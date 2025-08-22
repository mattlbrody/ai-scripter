# Authentication Fix Instructions

## Problem Summary
You were getting authentication errors because:
1. The anon key was missing/truncated in the .env file
2. Row Level Security (RLS) policies weren't configured in Supabase
3. The user didn't have a membership record in the database

## Solution Applied

### 1. Fixed Authentication Code
- Created `AuthContext.tsx` to properly manage session state
- Updated `api.ts` to use `getSession()` instead of `getUser()` (avoids unnecessary API calls)
- Added proper error handling for permission issues
- Added setup utility to create missing database records

### 2. Fixed Environment Variables
The `.env` file now has the correct anon key:
```
VITE_SUPABASE_URL=https://lqsbxkgtkmroqenbmzrt.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxxc2J4a2d0a21yb3FlbmJtenJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4MDQ2MDIsImV4cCI6MjA3MTM4MDYwMn0.qb8FBCTnCPJjLbNBAp-h2fzjViyVMA_aExLvEB2QDrU
```

### 3. Database Setup Required

**IMPORTANT: You need to run the SQL script in Supabase to fix the RLS policies:**

1. Go to your Supabase dashboard: https://supabase.com/dashboard/project/lqsbxkgtkmroqenbmzrt/sql
2. Open the SQL editor
3. Copy and paste the contents of `fix-rls-policies.sql`
4. Run the script

This script:
- Enables Row Level Security on all tables
- Creates policies allowing authenticated users to access their organization's data
- Creates a test organization and membership if needed

## How to Test

### Option 1: Use the Setup UI (Recommended)
1. Log in to the app
2. If you see the "Database Setup Required" screen, click "Set Up Database"
3. This will automatically create your organization and membership

### Option 2: Manual Testing
1. Open browser console while logged in
2. Run: `await testAuth()`
3. Check the console output for any errors

### Option 3: Use Test Page
1. Open `admin-ui/test-fix.html` in your browser
2. Make sure you're logged in to the app first
3. Check the results displayed on the page

## What Was Changed

### Files Modified:
- `admin-ui/src/lib/supabase.ts` - Added proper auth configuration
- `admin-ui/src/lib/api.ts` - Fixed to use getSession() and better error handling
- `admin-ui/src/App.tsx` - Added AuthContext provider
- `admin-ui/src/pages/Dashboard.tsx` - Added setup prompt for new users
- `admin-ui/.env` - Added correct anon key

### Files Created:
- `admin-ui/src/contexts/AuthContext.tsx` - Centralized auth management
- `admin-ui/src/utils/setupDatabase.ts` - Database setup utility
- `admin-ui/src/components/SetupPrompt.tsx` - UI for database setup
- `fix-rls-policies.sql` - SQL script to fix database permissions
- `admin-ui/test-auth.ts` - Testing utility (available in console)

## Verification Checklist

✅ The app loads without authentication errors
✅ You can navigate between pages without 401 errors
✅ The dashboard shows data (or zeros if no data exists)
✅ No "permission denied" errors in the console
✅ The console shows successful session retrieval

## If You Still Have Issues

1. **Clear browser storage:**
   ```javascript
   localStorage.clear();
   sessionStorage.clear();
   location.reload();
   ```

2. **Re-login:**
   - Sign out completely
   - Sign in again
   - Check console for errors

3. **Verify RLS policies:**
   - Run the SQL script again in Supabase
   - Make sure it completes without errors

4. **Check membership:**
   - In Supabase SQL editor, run:
   ```sql
   SELECT * FROM memberships WHERE user_id = 'YOUR_USER_ID';
   ```
   - If empty, run the setup utility

## How It Works Now

1. User logs in → Supabase creates a session
2. App checks session using `getSession()` (no network call)
3. API calls include the session token automatically
4. Supabase validates the token and checks RLS policies
5. User can only access data from their organization

The key improvement is using `getSession()` instead of `getUser()`, which avoids unnecessary API calls that were failing with 401 errors.