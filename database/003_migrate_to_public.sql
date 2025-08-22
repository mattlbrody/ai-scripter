-- Migration script to move all tables from app schema to public schema
-- This simplifies the codebase and avoids schema specification issues

-- Drop existing views and functions that depend on app schema
drop materialized view if exists app.response_lookup cascade;
drop function if exists app.search_responses cascade;
drop function if exists app.refresh_response_lookup cascade;
drop function if exists app.current_org cascade;
drop function if exists app.user_has_role cascade;
drop function if exists app.update_updated_at cascade;
drop function if exists app.handle_new_user cascade;

-- Drop triggers
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists update_organizations_updated_at on app.organizations;
drop trigger if exists update_users_updated_at on app.users;
drop trigger if exists update_memberships_updated_at on app.memberships;
drop trigger if exists update_intents_updated_at on app.intents;
drop trigger if exists update_responses_updated_at on app.responses;

-- Move types to public schema
alter type app.user_role set schema public;
alter type app.call_status set schema public;
alter type app.review_status set schema public;
alter type app.suggestion_outcome set schema public;

-- Move tables to public schema
alter table app.organizations set schema public;
alter table app.users set schema public;
alter table app.memberships set schema public;
alter table app.intents set schema public;
alter table app.responses set schema public;
alter table app.embeddings set schema public;
alter table app.calls set schema public;
alter table app.turns set schema public;
alter table app.suggestions set schema public;
alter table app.review_queue set schema public;

-- Recreate functions in public schema
create or replace function public.current_org() 
returns uuid 
language sql 
stable 
security definer
as $$
    select nullif(current_setting('app.org_id', true), '')::uuid
$$;

create or replace function public.user_has_role(user_id uuid, required_role public.user_role)
returns boolean
language sql
stable
security definer
as $$
    select exists(
        select 1 from public.memberships
        where user_id = $1
        and org_id = public.current_org()
        and is_active = true
        and (
            role = $2 
            or (role = 'admin')
            or (role = 'manager' and $2 = 'agent')
        )
    )
$$;

-- Updated_at trigger function
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- Handle new user function
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
    -- Create user record
    insert into public.users (id, email, full_name)
    values (new.id, new.email, new.raw_user_meta_data->>'full_name')
    on conflict (id) do nothing;
    
    -- Create default membership in demo organization
    insert into public.memberships (user_id, org_id, role)
    values (new.id, '00000000-0000-0000-0000-000000000001'::uuid, 'admin')
    on conflict (user_id, org_id) do nothing;
    
    return new;
end;
$$;

-- Recreate triggers
create trigger update_organizations_updated_at before update on public.organizations
    for each row execute function public.update_updated_at();

create trigger update_users_updated_at before update on public.users
    for each row execute function public.update_updated_at();

create trigger update_memberships_updated_at before update on public.memberships
    for each row execute function public.update_updated_at();

create trigger update_intents_updated_at before update on public.intents
    for each row execute function public.update_updated_at();

create trigger update_responses_updated_at before update on public.responses
    for each row execute function public.update_updated_at();

create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- Recreate materialized view
create materialized view public.response_lookup as
select 
    r.id,
    r.org_id,
    r.intent_id,
    r.text,
    r.rating,
    i.label as intent_label,
    i.threshold,
    e.vec as embedding,
    e.id as embedding_id
from public.responses r
join public.intents i on i.id = r.intent_id
left join public.embeddings e on e.response_id = r.id
where r.rating >= 0.5 and i.is_active = true;

-- Create index on materialized view
create index idx_response_lookup_org_intent 
    on public.response_lookup(org_id, intent_id);

-- Function to refresh materialized view
create or replace function public.refresh_response_lookup()
returns void
language sql
security definer
as $$
    refresh materialized view concurrently public.response_lookup;
$$;

-- Function for vector similarity search
create or replace function public.search_responses(
    query_vec vector(1536),
    query_intent_id uuid,
    query_org_id uuid,
    limit_count integer default 10
)
returns table (
    response_id uuid,
    response_text text,
    similarity numeric,
    rating numeric
)
language sql
stable
as $$
    select 
        r.id as response_id,
        r.text as response_text,
        1 - (e.vec <=> query_vec) as similarity,
        r.rating
    from public.embeddings e
    join public.responses r on r.id = e.response_id
    where r.org_id = query_org_id 
        and r.intent_id = query_intent_id
    order by e.vec <=> query_vec
    limit limit_count;
$$;

-- Update RLS policies to use public schema functions
-- Drop old policies first
drop policy if exists "Users can view their organizations" on public.organizations;
drop policy if exists "Admins can update organizations" on public.organizations;
drop policy if exists "Users can view themselves" on public.users;
drop policy if exists "Users can update themselves" on public.users;
drop policy if exists "Users can view org memberships" on public.memberships;
drop policy if exists "Admins can manage memberships" on public.memberships;
drop policy if exists "Users can view intents" on public.intents;
drop policy if exists "Managers can manage intents" on public.intents;
drop policy if exists "Users can view responses" on public.responses;
drop policy if exists "Managers can manage responses" on public.responses;
drop policy if exists "Users can view embeddings" on public.embeddings;
drop policy if exists "System can manage embeddings" on public.embeddings;
drop policy if exists "Users can view calls" on public.calls;
drop policy if exists "Agents can view their calls" on public.calls;
drop policy if exists "System can manage calls" on public.calls;
drop policy if exists "Users can view turns" on public.turns;
drop policy if exists "System can manage turns" on public.turns;
drop policy if exists "Users can view suggestions" on public.suggestions;
drop policy if exists "System can manage suggestions" on public.suggestions;
drop policy if exists "Managers can view review queue" on public.review_queue;
drop policy if exists "Managers can update review queue" on public.review_queue;

-- Recreate policies with public schema references
create policy "Users can view their organizations"
    on public.organizations for select
    using (
        exists (
            select 1 from public.memberships
            where org_id = organizations.id
            and user_id = auth.uid()
            and is_active = true
        )
    );

create policy "Admins can update organizations"
    on public.organizations for update
    using (public.user_has_role(auth.uid(), 'admin'));

create policy "Users can view themselves"
    on public.users for select
    using (id = auth.uid() or public.current_org() is not null);

create policy "Users can update themselves"
    on public.users for update
    using (id = auth.uid());

create policy "Users can view org memberships"
    on public.memberships for select
    using (org_id = public.current_org());

create policy "Admins can manage memberships"
    on public.memberships for all
    using (public.user_has_role(auth.uid(), 'admin'));

create policy "Users can view intents"
    on public.intents for select
    using (org_id = public.current_org());

create policy "Managers can manage intents"
    on public.intents for all
    using (public.user_has_role(auth.uid(), 'manager'));

create policy "Users can view responses"
    on public.responses for select
    using (org_id = public.current_org());

create policy "Managers can manage responses"
    on public.responses for all
    using (public.user_has_role(auth.uid(), 'manager'));

create policy "Users can view embeddings"
    on public.embeddings for select
    using (org_id = public.current_org());

create policy "System can manage embeddings"
    on public.embeddings for all
    using (org_id = public.current_org());

create policy "Users can view calls"
    on public.calls for select
    using (org_id = public.current_org());

create policy "Agents can view their calls"
    on public.calls for select
    using (agent_id = auth.uid());

create policy "System can manage calls"
    on public.calls for all
    using (org_id = public.current_org());

create policy "Users can view turns"
    on public.turns for select
    using (org_id = public.current_org());

create policy "System can manage turns"
    on public.turns for all
    using (org_id = public.current_org());

create policy "Users can view suggestions"
    on public.suggestions for select
    using (org_id = public.current_org());

create policy "System can manage suggestions"
    on public.suggestions for all
    using (org_id = public.current_org());

create policy "Managers can view review queue"
    on public.review_queue for select
    using (public.user_has_role(auth.uid(), 'manager'));

create policy "Managers can update review queue"
    on public.review_queue for update
    using (public.user_has_role(auth.uid(), 'manager'));

-- Drop the app schema if it's now empty
drop schema if exists app cascade;