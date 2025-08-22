-- Fix RLS policies for memberships table
-- This script enables Row Level Security and creates proper policies

-- Enable RLS on memberships table
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can read their own memberships" ON memberships;
DROP POLICY IF EXISTS "Users can view their own memberships" ON memberships;

-- Create policy to allow users to read their own membership records
CREATE POLICY "Users can read their own memberships" ON memberships
    FOR SELECT
    USING (auth.uid() = user_id);

-- Also enable RLS and create policies for other tables that might need it
-- Organizations table
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read orgs they belong to" ON organizations;

CREATE POLICY "Users can read orgs they belong to" ON organizations
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM memberships 
            WHERE memberships.org_id = organizations.id 
            AND memberships.user_id = auth.uid()
        )
    );

-- Calls table
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read calls from their org" ON calls;

CREATE POLICY "Users can read calls from their org" ON calls
    FOR ALL
    USING (
        org_id IN (
            SELECT org_id FROM memberships 
            WHERE user_id = auth.uid()
        )
    );

-- Intents table
ALTER TABLE intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage intents from their org" ON intents;

CREATE POLICY "Users can manage intents from their org" ON intents
    FOR ALL
    USING (
        org_id IN (
            SELECT org_id FROM memberships 
            WHERE user_id = auth.uid()
        )
    );

-- Responses table
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage responses from their org" ON responses;

CREATE POLICY "Users can manage responses from their org" ON responses
    FOR ALL
    USING (
        org_id IN (
            SELECT org_id FROM memberships 
            WHERE user_id = auth.uid()
        )
    );

-- Review queue table
ALTER TABLE review_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage review items from their org" ON review_queue;

CREATE POLICY "Users can manage review items from their org" ON review_queue
    FOR ALL
    USING (
        org_id IN (
            SELECT org_id FROM memberships 
            WHERE user_id = auth.uid()
        )
    );

-- Suggestions table (if it exists)
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read suggestions from their org" ON suggestions;

CREATE POLICY "Users can read suggestions from their org" ON suggestions
    FOR SELECT
    USING (
        org_id IN (
            SELECT org_id FROM memberships 
            WHERE user_id = auth.uid()
        )
    );

-- Grant necessary permissions
GRANT ALL ON memberships TO authenticated;
GRANT ALL ON organizations TO authenticated;
GRANT ALL ON calls TO authenticated;
GRANT ALL ON intents TO authenticated;
GRANT ALL ON responses TO authenticated;
GRANT ALL ON review_queue TO authenticated;
GRANT ALL ON suggestions TO authenticated;

-- Also create the membership record if it doesn't exist for the test user
-- First, let's check if the user exists and create a test org and membership
DO $$
DECLARE
    test_user_id UUID := '00e10f82-de45-4409-a3b2-ed66c900619e';
    test_org_id UUID;
BEGIN
    -- Check if an org exists, if not create one
    SELECT id INTO test_org_id FROM organizations LIMIT 1;
    
    IF test_org_id IS NULL THEN
        INSERT INTO organizations (name, created_at, updated_at)
        VALUES ('Test Organization', NOW(), NOW())
        RETURNING id INTO test_org_id;
    END IF;
    
    -- Check if membership exists, if not create it
    IF NOT EXISTS (SELECT 1 FROM memberships WHERE user_id = test_user_id) THEN
        INSERT INTO memberships (user_id, org_id, role, created_at)
        VALUES (test_user_id, test_org_id, 'admin', NOW())
        ON CONFLICT (user_id, org_id) DO NOTHING;
    END IF;
END $$;