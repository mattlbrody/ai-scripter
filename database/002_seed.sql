-- Seed data for testing
-- This script creates initial organization and user membership

-- Create a test organization
insert into public.organizations (id, name, settings)
values 
    ('00000000-0000-0000-0000-000000000001'::uuid, 'Demo Organization', '{"default_threshold": 0.8}')
on conflict do nothing;

-- Create user record for authenticated users
-- Note: This trigger will automatically create user records when users sign up
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

-- Create trigger for new user signups
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

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