-- Fix RLS policy for memberships table to allow users to read their own memberships
-- This fixes the 403 error when querying memberships with user_id filter

-- Drop the existing restrictive policies
drop policy if exists "Users can view org memberships" on public.memberships;
drop policy if exists "Users can view their own memberships" on public.memberships;

-- Create a new policy that allows users to ALWAYS view their own memberships
-- This is crucial for the initial lookup when determining their organization
create policy "Users can view their own memberships"
    on public.memberships for select
    using (
        user_id = auth.uid()  -- Users can always see their own memberships
    );

-- Ensure the admin policy is properly set
drop policy if exists "Admins can manage memberships" on public.memberships;
create policy "Admins can manage memberships"
    on public.memberships for all
    using (
        public.user_has_role(auth.uid(), 'admin')
        or user_id = auth.uid()  -- Users can also manage their own memberships
    );