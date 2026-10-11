-- ==============================================================================
-- MIGRATION: 20261010000004_add_storage_delete_policy.sql
-- DESCRIPTION: Minimum development policy to allow cloud preview cleanup on gallery completion.
--
-- WORKFLOW COVERED:
-- Allow photographer (anon/authenticated) to delete WebP previews from 'photo-previews' bucket.
--
-- CONSTRAINTS ENFORCED:
-- - RLS remains fully ENABLED on storage.objects.
-- - Only applies to bucket 'photo-previews'.
-- - Does NOT allow deleting buckets.
-- - Does NOT modify tables or table schemas.
-- ==============================================================================

DROP POLICY IF EXISTS "photo_previews_delete_dev" ON storage.objects;
CREATE POLICY "photo_previews_delete_dev"
ON storage.objects
FOR DELETE
TO anon, authenticated
USING (bucket_id = 'photo-previews');
