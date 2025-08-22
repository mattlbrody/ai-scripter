# Quick Start Guide - Simplified Setup

Since deploying Edge Functions requires database passwords and CLI setup, here's how to get started immediately with just the Admin UI:

## What You Need

1. Your Supabase project (✅ Already set up)
2. Admin UI with direct Supabase access (✅ Already configured)

## Steps to Run

### 1. Create Storage Bucket (One-time setup)

Go to your Supabase Dashboard:
1. Navigate to **Storage** section
2. Click **New Bucket**
3. Name it: `calls`
4. Set to **Public** (or configure RLS later)

### 2. Create Initial Data

Run this in Supabase SQL Editor to create your first organization:

```sql
-- Create a test organization
INSERT INTO app.organizations (name) 
VALUES ('My Sales Team')
RETURNING id;

-- Save the returned ID, you'll need it
```

### 3. Create Your User Account

Run this in SQL Editor (replace with your email):

```sql
-- Create user in app.users (replace with your auth user id)
INSERT INTO app.users (id, email, full_name)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'your-email@example.com'),
  'your-email@example.com',
  'Your Name'
);

-- Create membership (replace org_id with the ID from step 2)
INSERT INTO app.memberships (user_id, org_id, role)
VALUES (
  (SELECT id FROM auth.users WHERE email = 'your-email@example.com'),
  'your-org-id-from-step-2',
  'admin'
);
```

### 4. Run the Admin UI

```bash
cd admin-ui
npm install
npm run dev
```

### 5. Sign Up / Sign In

1. Go to http://localhost:5173
2. Sign up with your email (or sign in if you already have an account)
3. You'll now have access to the admin dashboard!

## What Works Now

✅ Sign in/Sign up
✅ View dashboard
✅ Create and manage intents
✅ Create and manage responses
✅ Review queue functionality
✅ All database operations

## What Needs Edge Functions

These features require Edge Functions to be deployed:
- Processing uploaded audio files
- Generating embeddings for responses
- Real-time suggestions

## Next Steps

When you're ready to add audio processing:
1. Get your database password from Supabase Dashboard → Settings → Database
2. Run: `npx supabase link --project-ref lqsbxkgtkmroqenbmzrt`
3. Deploy the Edge Functions

But for now, you can use the admin UI to:
- Set up your intents
- Add responses manually
- Test the review queue
- Configure your system

The admin UI is fully functional without the Edge Functions!