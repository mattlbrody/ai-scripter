-- Unified script to set up everything in public schema
-- This handles both fresh installs and migrations from app schema

-- Enable required extensions
create extension if not exists "vector";
create extension if not exists "pg_trgm";

-- Check if we need to migrate from app schema
do $$
begin
    -- Check if app schema exists with tables
    if exists (select 1 from information_schema.tables where table_schema = 'app') then
        -- Migration path: Move everything from app to public
        
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

        -- Move types to public schema if they exist in app
        if exists (select 1 from pg_type where typname = 'user_role' and typnamespace = (select oid from pg_namespace where nspname = 'app')) then
            alter type app.user_role set schema public;
        end if;
        if exists (select 1 from pg_type where typname = 'call_status' and typnamespace = (select oid from pg_namespace where nspname = 'app')) then
            alter type app.call_status set schema public;
        end if;
        if exists (select 1 from pg_type where typname = 'review_status' and typnamespace = (select oid from pg_namespace where nspname = 'app')) then
            alter type app.review_status set schema public;
        end if;
        if exists (select 1 from pg_type where typname = 'suggestion_outcome' and typnamespace = (select oid from pg_namespace where nspname = 'app')) then
            alter type app.suggestion_outcome set schema public;
        end if;

        -- Move tables to public schema
        if exists (select 1 from information_schema.tables where table_schema = 'app' and table_name = 'organizations') then
            alter table app.organizations set schema public;
        end if;
        if exists (select 1 from information_schema.tables where table_schema = 'app' and table_name = 'users') then
            alter table app.users set schema public;
        end if;
        if exists (select 1 from information_schema.tables where table_schema = 'app' and table_name = 'memberships') then
            alter table app.memberships set schema public;
        end if;
        if exists (select 1 from information_schema.tables where table_schema = 'app' and table_name = 'intents') then
            alter table app.intents set schema public;
        end if;
        if exists (select 1 from information_schema.tables where table_schema = 'app' and table_name = 'responses') then
            alter table app.responses set schema public;
        end if;
        if exists (select 1 from information_schema.tables where table_schema = 'app' and table_name = 'embeddings') then
            alter table app.embeddings set schema public;
        end if;
        if exists (select 1 from information_schema.tables where table_schema = 'app' and table_name = 'calls') then
            alter table app.calls set schema public;
        end if;
        if exists (select 1 from information_schema.tables where table_schema = 'app' and table_name = 'turns') then
            alter table app.turns set schema public;
        end if;
        if exists (select 1 from information_schema.tables where table_schema = 'app' and table_name = 'suggestions') then
            alter table app.suggestions set schema public;
        end if;
        if exists (select 1 from information_schema.tables where table_schema = 'app' and table_name = 'review_queue') then
            alter table app.review_queue set schema public;
        end if;
        
        -- Drop the app schema
        drop schema if exists app cascade;
    else
        -- Fresh install path: Create types and tables directly in public
        
        -- Create enum types if they don't exist
        do $types$
        begin
            if not exists (select 1 from pg_type where typname = 'user_role') then
                create type public.user_role as enum ('admin', 'manager', 'agent');
            end if;
            if not exists (select 1 from pg_type where typname = 'call_status') then
                create type public.call_status as enum ('processing', 'ready', 'archived');
            end if;
            if not exists (select 1 from pg_type where typname = 'review_status') then
                create type public.review_status as enum ('pending', 'approved', 'rejected', 'edited');
            end if;
            if not exists (select 1 from pg_type where typname = 'suggestion_outcome') then
                create type public.suggestion_outcome as enum ('shown', 'ignored', 'used');
            end if;
        end $types$;

        -- Create tables if they don't exist
        create table if not exists public.organizations (
            id uuid primary key default gen_random_uuid(),
            name text not null,
            settings jsonb default '{}',
            created_at timestamptz default now(),
            updated_at timestamptz default now()
        );

        create table if not exists public.users (
            id uuid primary key references auth.users(id) on delete cascade,
            email text unique not null,
            full_name text,
            avatar_url text,
            settings jsonb default '{}',
            created_at timestamptz default now(),
            updated_at timestamptz default now()
        );

        create table if not exists public.memberships (
            id uuid primary key default gen_random_uuid(),
            user_id uuid not null references public.users(id) on delete cascade,
            org_id uuid not null references public.organizations(id) on delete cascade,
            role public.user_role not null default 'agent',
            is_active boolean default true,
            created_at timestamptz default now(),
            updated_at timestamptz default now(),
            unique(user_id, org_id)
        );

        create table if not exists public.intents (
            id uuid primary key default gen_random_uuid(),
            org_id uuid not null references public.organizations(id) on delete cascade,
            label text not null,
            description text,
            is_active boolean default true,
            threshold numeric(3,2) default 0.80 check (threshold between 0.50 and 1.00),
            priority integer default 0,
            created_at timestamptz default now(),
            updated_at timestamptz default now(),
            unique(org_id, label)
        );

        create table if not exists public.responses (
            id uuid primary key default gen_random_uuid(),
            org_id uuid not null references public.organizations(id) on delete cascade,
            intent_id uuid not null references public.intents(id) on delete cascade,
            text text not null,
            source_call_id uuid,
            source_turn_id uuid,
            rating numeric(3,2) default 0.50,
            usage_count integer default 0,
            metadata jsonb default '{}',
            created_at timestamptz default now(),
            updated_at timestamptz default now()
        );

        create table if not exists public.embeddings (
            id uuid primary key default gen_random_uuid(),
            org_id uuid not null references public.organizations(id) on delete cascade,
            response_id uuid not null references public.responses(id) on delete cascade,
            vec vector(1536) not null,
            model text default 'text-embedding-3-small',
            created_at timestamptz default now(),
            unique(response_id)
        );

        create table if not exists public.calls (
            id uuid primary key default gen_random_uuid(),
            org_id uuid not null references public.organizations(id) on delete cascade,
            external_id text,
            agent_id uuid references public.users(id),
            phone_number text,
            audio_url text,
            duration_seconds integer,
            status public.call_status default 'processing',
            metadata jsonb default '{}',
            started_at timestamptz,
            ended_at timestamptz,
            created_at timestamptz default now()
        );

        create table if not exists public.turns (
            id uuid primary key default gen_random_uuid(),
            call_id uuid not null references public.calls(id) on delete cascade,
            org_id uuid not null references public.organizations(id) on delete cascade,
            speaker text not null check (speaker in ('agent', 'lead')),
            text text not null,
            start_ms integer not null,
            end_ms integer not null,
            confidence numeric(3,2),
            metadata jsonb default '{}',
            created_at timestamptz default now()
        );

        create table if not exists public.suggestions (
            id uuid primary key default gen_random_uuid(),
            org_id uuid not null references public.organizations(id) on delete cascade,
            call_id uuid not null references public.calls(id) on delete cascade,
            turn_id uuid not null references public.turns(id) on delete cascade,
            intent_id uuid references public.intents(id),
            response_id uuid references public.responses(id),
            lead_text text not null,
            suggested_text text,
            similarity_score numeric(3,2),
            decision text not null check (decision in ('suggestion', 'no_match')),
            outcome public.suggestion_outcome,
            latency_ms integer,
            shown_at timestamptz,
            dismissed_at timestamptz,
            created_at timestamptz default now()
        );

        create table if not exists public.review_queue (
            id uuid primary key default gen_random_uuid(),
            org_id uuid not null references public.organizations(id) on delete cascade,
            call_id uuid not null references public.calls(id) on delete cascade,
            turn_id uuid not null references public.turns(id) on delete cascade,
            lead_text text not null,
            proposed_intent_id uuid references public.intents(id),
            proposed_response text,
            confidence numeric(3,2),
            status public.review_status default 'pending',
            reviewed_by uuid references public.users(id),
            reviewed_at timestamptz,
            notes text,
            created_at timestamptz default now()
        );

        -- Create indexes
        create index if not exists idx_intents_org_active on public.intents(org_id, is_active);
        create index if not exists idx_responses_intent on public.responses(intent_id, rating desc);
        create index if not exists idx_responses_org on public.responses(org_id);
        create index if not exists idx_embeddings_vec on public.embeddings 
            using hnsw (vec vector_cosine_ops)
            with (m = 16, ef_construction = 64);
        create index if not exists idx_calls_org_status on public.calls(org_id, status);
        create index if not exists idx_calls_agent on public.calls(agent_id);
        create index if not exists idx_calls_started on public.calls(started_at desc);
        create index if not exists idx_turns_call on public.turns(call_id, start_ms);
        create index if not exists idx_turns_speaker on public.turns(call_id, speaker);
        create index if not exists idx_suggestions_call on public.suggestions(call_id);
        create index if not exists idx_suggestions_outcome on public.suggestions(org_id, outcome);
        create index if not exists idx_suggestions_intent on public.suggestions(intent_id);
        create index if not exists idx_review_queue_status on public.review_queue(org_id, status);
        create index if not exists idx_review_queue_confidence on public.review_queue(confidence) where status = 'pending';
    end if;
end $$;

-- Create or replace functions in public schema
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

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

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

-- Create triggers
drop trigger if exists update_organizations_updated_at on public.organizations;
create trigger update_organizations_updated_at before update on public.organizations
    for each row execute function public.update_updated_at();

drop trigger if exists update_users_updated_at on public.users;
create trigger update_users_updated_at before update on public.users
    for each row execute function public.update_updated_at();

drop trigger if exists update_memberships_updated_at on public.memberships;
create trigger update_memberships_updated_at before update on public.memberships
    for each row execute function public.update_updated_at();

drop trigger if exists update_intents_updated_at on public.intents;
create trigger update_intents_updated_at before update on public.intents
    for each row execute function public.update_updated_at();

drop trigger if exists update_responses_updated_at on public.responses;
create trigger update_responses_updated_at before update on public.responses
    for each row execute function public.update_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- Create materialized view
drop materialized view if exists public.response_lookup;
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
create index if not exists idx_response_lookup_org_intent 
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

-- Enable RLS on all tables
alter table public.organizations enable row level security;
alter table public.users enable row level security;
alter table public.memberships enable row level security;
alter table public.intents enable row level security;
alter table public.responses enable row level security;
alter table public.embeddings enable row level security;
alter table public.calls enable row level security;
alter table public.turns enable row level security;
alter table public.suggestions enable row level security;
alter table public.review_queue enable row level security;

-- Drop existing policies before recreating
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

-- Create RLS policies
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
    using (org_id = public.current_org() or user_id = auth.uid());

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

-- Seed initial data
-- Create a test organization
insert into public.organizations (id, name, settings)
values 
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Demo Organization', '{"default_threshold": 0.8}')
on conflict do nothing;

-- For existing users, ensure they have records
insert into public.users (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- Ensure all existing users have membership in demo org
insert into public.memberships (user_id, org_id, role)
select u.id, '00000000-0000-0000-0000-000000000001'::uuid, 'admin'
from public.users u
where not exists (
    select 1 from public.memberships m 
    where m.user_id = u.id 
    and m.org_id = '00000000-0000-0000-0000-000000000001'::uuid
);

-- Create some sample intents
insert into public.intents (org_id, label, description, threshold)
values 
    ('00000000-0000-0000-0000-000000000001'::uuid, 'objection', 'Customer expressing doubt or resistance', 0.80),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'pricing_question', 'Questions about cost or pricing', 0.82),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'competitor_mention', 'Mentioning or comparing to competitors', 0.78),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'interest_signal', 'Showing interest or asking for more info', 0.85),
    ('00000000-0000-0000-0000-000000000001'::uuid, 'scheduling', 'Discussing times or scheduling meetings', 0.83)
on conflict (org_id, label) do nothing;