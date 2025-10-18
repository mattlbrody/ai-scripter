-- Create storage bucket for call recordings
-- Run this in your Supabase SQL Editor if the bucket doesn't exist

-- Create the calls bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'calls',
  'calls', 
  false, -- Set to false for better security, we'll use RLS
  52428800, -- 50MB limit in bytes
  ARRAY['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg', 'audio/x-m4a']::text[]
)
ON CONFLICT (id) DO UPDATE
SET 
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Create RLS policies for the calls bucket
-- Allow authenticated users from the same org to upload
CREATE POLICY "Allow org members to upload calls" ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'calls' AND
  EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = auth.uid()
    AND is_active = true
  )
);

-- Allow authenticated users from the same org to view/download
CREATE POLICY "Allow org members to view calls" ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'calls' AND
  EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = auth.uid()
    AND is_active = true
  )
);

-- Allow authenticated users to delete their own uploads
CREATE POLICY "Allow users to delete own uploads" ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'calls' AND
  owner = auth.uid()
);

-- Notify user
DO $$
BEGIN
  RAISE NOTICE 'Storage bucket "calls" has been created/updated successfully!';
  RAISE NOTICE 'RLS policies have been applied for secure access.';
END $$;