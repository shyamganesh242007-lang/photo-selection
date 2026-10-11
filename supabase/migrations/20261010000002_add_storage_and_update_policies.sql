-- ==============================================================================
-- MIGRATION: 20261010000002_add_storage_and_update_policies.sql
-- DESCRIPTION: Storage bucket setup and update policies for WebP preview upload workflow.
--
-- WORKFLOW COVERED:
-- 1. Create 'photo-previews' bucket in Supabase Storage (WebP only, 5MB limit).
-- 2. Storage RLS policies on storage.objects for 'photo-previews' (INSERT, UPDATE, SELECT).
-- 3. Database UPDATE permissions and RLS policies on 'photos' (to update webp_storage_path).
-- 4. Database UPDATE permissions and RLS policies on 'galleries' (to transition status to 'active').
--
-- CONSTRAINTS ENFORCED:
-- - Bucket allows ONLY 'image/webp' MIME types.
-- - No DELETE policies created.
-- - 'selections' table remains strictly unmodified and protected.
-- ==============================================================================

-- 1. Create 'photo-previews' bucket if it doesn't already exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photo-previews',
  'photo-previews',
  false,
  5242880, -- 5 MB file size limit
  ARRAY['image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Storage RLS Policies for photo-previews
DROP POLICY IF EXISTS "photo_previews_insert_dev" ON storage.objects;
CREATE POLICY "photo_previews_insert_dev"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'photo-previews');

DROP POLICY IF EXISTS "photo_previews_update_dev" ON storage.objects;
CREATE POLICY "photo_previews_update_dev"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'photo-previews')
WITH CHECK (bucket_id = 'photo-previews');

DROP POLICY IF EXISTS "photo_previews_select_dev" ON storage.objects;
CREATE POLICY "photo_previews_select_dev"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'photo-previews');

-- 3. Database Table Permissions & RLS Policies for UPDATE
GRANT UPDATE ON TABLE galleries TO anon, authenticated;
GRANT UPDATE ON TABLE photos TO anon, authenticated;

-- Allow anon and authenticated to update gallery status (e.g., from 'draft' to 'active')
DROP POLICY IF EXISTS "galleries_update_dev" ON galleries;
CREATE POLICY "galleries_update_dev"
ON galleries
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- Allow anon and authenticated to update photo metadata (specifically webp_storage_path)
DROP POLICY IF EXISTS "photos_update_dev" ON photos;
CREATE POLICY "photos_update_dev"
ON photos
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);
