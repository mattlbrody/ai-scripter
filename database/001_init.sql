-- Enable required extensions
create extension if not exists "vector";
create extension if not exists "pg_trgm";

-- Create app schema
create schema if not exists app;

-- Set search path
set search_path to app, public;

-- Enum types
create type app.user_role as enum ('admin', 'manager', 'agent');
create type app.call_status as enum ('processing', 'ready', 'archived');
create type app.review_status as enum ('pending', 'approved', 'rejected', 'edited');
create type app.suggestion_outcome as enum ('shown', 'ignored', 'used');

-- Organizations table
create table app.organizations (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    settings jsonb default '{}',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Users table (mapped to Supabase Auth)
create table app.users (
    id uuid primary key references auth.users(id) on delete cascade,
    email text unique not null,
    full_name text,
    avatar_url text,
    settings jsonb default '{}',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Memberships (user-org relationships)
create table app.memberships (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references app.users(id) on delete cascade,
    org_id uuid not null references app.organizations(id) on delete cascade,
    role app.user_role not null default 'agent',
    is_active boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique(user_id, org_id)
);

-- Intents table
create table app.intents (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references app.organizations(id) on delete cascade,
    label text not null,
    description text,
    is_active boolean default true,
    threshold numeric(3,2) default 0.80 check (threshold between 0.50 and 1.00),
    priority integer default 0,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique(org_id, label)
);

-- Create index for intent lookups
create index idx_intents_org_active on app.intents(org_id, is_active);

-- Responses table (approved responses for intents)
create table app.responses (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references app.organizations(id) on delete cascade,
    intent_id uuid not null references app.intents(id) on delete cascade,
    text text not null,
    source_call_id uuid,
    source_turn_id uuid,
    rating numeric(3,2) default 0.50,
    usage_count integer default 0,
    metadata jsonb default '{}',
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- Create indexes for response lookups
create index idx_responses_intent on app.responses(intent_id, rating desc);
create index idx_responses_org on app.responses(org_id);

-- Embeddings table (vector storage)
create table app.embeddings (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references app.organizations(id) on delete cascade,
    response_id uuid not null references app.responses(id) on delete cascade,
    vec vector(1536) not null,
    model text default 'text-embedding-3-small',
    created_at timestamptz default now(),
    unique(response_id)
);

-- Create HNSW index for fast similarity search
create index idx_embeddings_vec on app.embeddings 
using hnsw (vec vector_cosine_ops)
with (m = 16, ef_construction = 64);

-- Calls table
create table app.calls (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references app.organizations(id) on delete cascade,
    external_id text,
    agent_id uuid references app.users(id),
    phone_number text,
    audio_url text,
    duration_seconds integer,
    status app.call_status default 'processing',
    metadata jsonb default '{}',
    started_at timestamptz,
    ended_at timestamptz,
    created_at timestamptz default now()
);

-- Create indexes for call lookups
create index idx_calls_org_status on app.calls(org_id, status);
create index idx_calls_agent on app.calls(agent_id);
create index idx_calls_started on app.calls(started_at desc);

-- Turns table (speech segments)
create table app.turns (
    id uuid primary key default gen_random_uuid(),
    call_id uuid not null references app.calls(id) on delete cascade,
    org_id uuid not null references app.organizations(id) on delete cascade,
    speaker text not null check (speaker in ('agent', 'lead')),
    text text not null,
    start_ms integer not null,
    end_ms integer not null,
    confidence numeric(3,2),
    metadata jsonb default '{}',
    created_at timestamptz default now()
);

-- Create indexes for turn lookups
create index idx_turns_call on app.turns(call_id, start_ms);
create index idx_turns_speaker on app.turns(call_id, speaker);

-- Suggestions table (real-time suggestions shown)
create table app.suggestions (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references app.organizations(id) on delete cascade,
    call_id uuid not null references app.calls(id) on delete cascade,
    turn_id uuid not null references app.turns(id) on delete cascade,
    intent_id uuid references app.intents(id),
    response_id uuid references app.responses(id),
    lead_text text not null,
    suggested_text text,
    similarity_score numeric(3,2),
    decision text not null check (decision in ('suggestion', 'no_match')),
    outcome app.suggestion_outcome,
    latency_ms integer,
    shown_at timestamptz,
    dismissed_at timestamptz,
    created_at timestamptz default now()
);

-- Create indexes for suggestion analytics
create index idx_suggestions_call on app.suggestions(call_id);
create index idx_suggestions_outcome on app.suggestions(org_id, outcome);
create index idx_suggestions_intent on app.suggestions(intent_id);

-- Review queue table
create table app.review_queue (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references app.organizations(id) on delete cascade,
    call_id uuid not null references app.calls(id) on delete cascade,
    turn_id uuid not null references app.turns(id) on delete cascade,
    lead_text text not null,
    proposed_intent_id uuid references app.intents(id),
    proposed_response text,
    confidence numeric(3,2),
    status app.review_status default 'pending',
    reviewed_by uuid references app.users(id),
    reviewed_at timestamptz,
    notes text,
    created_at timestamptz default now()
);

-- Create indexes for review queue
create index idx_review_queue_status on app.review_queue(org_id, status);
create index idx_review_queue_confidence on app.review_queue(confidence) where status = 'pending';

-- Function to get current organization (for RLS)
create or replace function app.current_org() 
returns uuid 
language sql 
stable 
security definer
as $$
    select nullif(current_setting('app.org_id', true), '')::uuid
$$;

-- Function to check user membership
create or replace function app.user_has_role(user_id uuid, required_role app.user_role)
returns boolean
language sql
stable
security definer
as $$
    select exists(
        select 1 from app.memberships
        where user_id = $1
        and org_id = app.current_org()
        and is_active = true
        and (
            role = $2 
            or (role = 'admin')
            or (role = 'manager' and $2 = 'agent')
        )
    )
$$;

-- Enable RLS on all tables
alter table app.organizations enable row level security;
alter table app.users enable row level security;
alter table app.memberships enable row level security;
alter table app.intents enable row level security;
alter table app.responses enable row level security;
alter table app.embeddings enable row level security;
alter table app.calls enable row level security;
alter table app.turns enable row level security;
alter table app.suggestions enable row level security;
alter table app.review_queue enable row level security;

-- RLS Policies for organizations
create policy "Users can view their organizations"
    on app.organizations for select
    using (
        exists (
            select 1 from app.memberships
            where org_id = organizations.id
            and user_id = auth.uid()
            and is_active = true
        )
    );

create policy "Admins can update organizations"
    on app.organizations for update
    using (app.user_has_role(auth.uid(), 'admin'));

-- RLS Policies for users
create policy "Users can view themselves"
    on app.users for select
    using (id = auth.uid() or app.current_org() is not null);

create policy "Users can update themselves"
    on app.users for update
    using (id = auth.uid());

-- RLS Policies for memberships
create policy "Users can view org memberships"
    on app.memberships for select
    using (org_id = app.current_org());

create policy "Admins can manage memberships"
    on app.memberships for all
    using (app.user_has_role(auth.uid(), 'admin'));

-- RLS Policies for intents
create policy "Users can view intents"
    on app.intents for select
    using (org_id = app.current_org());

create policy "Managers can manage intents"
    on app.intents for all
    using (app.user_has_role(auth.uid(), 'manager'));

-- RLS Policies for responses
create policy "Users can view responses"
    on app.responses for select
    using (org_id = app.current_org());

create policy "Managers can manage responses"
    on app.responses for all
    using (app.user_has_role(auth.uid(), 'manager'));

-- RLS Policies for embeddings
create policy "Users can view embeddings"
    on app.embeddings for select
    using (org_id = app.current_org());

create policy "System can manage embeddings"
    on app.embeddings for all
    using (org_id = app.current_org());

-- RLS Policies for calls
create policy "Users can view calls"
    on app.calls for select
    using (org_id = app.current_org());

create policy "Agents can view their calls"
    on app.calls for select
    using (agent_id = auth.uid());

create policy "System can manage calls"
    on app.calls for all
    using (org_id = app.current_org());

-- RLS Policies for turns
create policy "Users can view turns"
    on app.turns for select
    using (org_id = app.current_org());

create policy "System can manage turns"
    on app.turns for all
    using (org_id = app.current_org());

-- RLS Policies for suggestions
create policy "Users can view suggestions"
    on app.suggestions for select
    using (org_id = app.current_org());

create policy "System can manage suggestions"
    on app.suggestions for all
    using (org_id = app.current_org());

-- RLS Policies for review queue
create policy "Managers can view review queue"
    on app.review_queue for select
    using (app.user_has_role(auth.uid(), 'manager'));

create policy "Managers can update review queue"
    on app.review_queue for update
    using (app.user_has_role(auth.uid(), 'manager'));

-- Updated_at trigger function
create or replace function app.update_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- Apply updated_at triggers
create trigger update_organizations_updated_at before update on app.organizations
    for each row execute function app.update_updated_at();

create trigger update_users_updated_at before update on app.users
    for each row execute function app.update_updated_at();

create trigger update_memberships_updated_at before update on app.memberships
    for each row execute function app.update_updated_at();

create trigger update_intents_updated_at before update on app.intents
    for each row execute function app.update_updated_at();

create trigger update_responses_updated_at before update on app.responses
    for each row execute function app.update_updated_at();

-- Materialized view for fast response lookups
create materialized view app.response_lookup as
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
from app.responses r
join app.intents i on i.id = r.intent_id
left join app.embeddings e on e.response_id = r.id
where r.rating >= 0.5 and i.is_active = true;

-- Create index on materialized view
create index idx_response_lookup_org_intent 
    on app.response_lookup(org_id, intent_id);

-- Function to refresh materialized view
create or replace function app.refresh_response_lookup()
returns void
language sql
security definer
as $$
    refresh materialized view concurrently app.response_lookup;
$$;

-- Function for vector similarity search
create or replace function app.search_responses(
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
    from app.embeddings e
    join app.responses r on r.id = e.response_id
    where r.org_id = query_org_id 
        and r.intent_id = query_intent_id
    order by e.vec <=> query_vec
    limit limit_count;
$$;

-- Initial seed data can be added later after creating an organization
-- Example:
-- insert into app.intents (org_id, label, description, threshold)
-- values 
--     ('your-org-id'::uuid, 'objection', 'Customer expressing doubt or resistance', 0.80),
--     ('your-org-id'::uuid, 'pricing_question', 'Questions about cost or pricing', 0.82),
--     ('your-org-id'::uuid, 'competitor_mention', 'Mentioning or comparing to competitors', 0.78),
--     ('your-org-id'::uuid, 'interest_signal', 'Showing interest or asking for more info', 0.85),
--     ('your-org-id'::uuid, 'scheduling', 'Discussing times or scheduling meetings', 0.83);