# Upload Issue Fix

## Problem
The call upload feature wasn't working - no errors in console, nothing happening when clicking upload.

## Root Cause
The storage bucket "calls" doesn't exist in Supabase, causing the upload to fail silently.

## Solution Applied

### 1. Enhanced Error Handling
- Added detailed error messages in `admin-ui/src/lib/api.ts`
- Added file validation (size and type) before upload
- Added console logging for debugging

### 2. Improved UI Feedback
- Added error display with specific instructions in `admin-ui/src/pages/Calls.tsx`
- Added success message when upload completes
- Added visual feedback for different error types

### 3. Storage Bucket Setup
Created SQL script to set up the storage bucket: `database/006_create_storage_bucket.sql`

## How to Fix the Storage Bucket Issue

### Option 1: Via Supabase Dashboard (Recommended)
1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Navigate to **Storage** section
3. Click **New bucket**
4. Name it: `calls`
5. Configure:
   - Public: No (use RLS for security)
   - File size limit: 50MB
   - Allowed MIME types: audio/mpeg, audio/wav, audio/mp4, audio/ogg, audio/x-m4a

### Option 2: Via SQL
Run the SQL script in your Supabase SQL Editor:
```bash
# Copy and run the contents of:
database/006_create_storage_bucket.sql
```

## Testing the Fix

1. Start the admin UI:
```bash
cd admin-ui
npm run dev
```

2. Navigate to http://localhost:5174 (or appropriate port)
3. Go to the Calls page
4. Try uploading an audio file

You should now see:
- ✅ Success message if upload works
- ❌ Clear error message if storage bucket is missing
- ❌ Validation errors for invalid files

## What Changed

### Files Modified:
1. `admin-ui/src/pages/Calls.tsx`
   - Added error/success state management
   - Added visual feedback components
   - Added debug logging

2. `admin-ui/src/lib/api.ts`
   - Added file validation
   - Enhanced error messages
   - Added detailed logging

### Files Created:
1. `database/006_create_storage_bucket.sql` - SQL to create storage bucket
2. `admin-ui/test-upload.html` - Test page for debugging
3. `FIX_UPLOAD_ISSUE.md` - This documentation

## Debug Information

If upload still fails, check browser console for:
- File details (name, size, type)
- Organization ID
- Storage upload response
- Detailed error messages

The enhanced logging will help identify the exact issue.