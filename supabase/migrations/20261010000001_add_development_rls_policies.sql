-- ==============================================================================
-- MIGRATION: 20261010000001_add_development_rls_policies.sql
-- DESCRIPTION: Minimum development RLS policies for anon/publishable-key client.
--
-- WORKFLOW COVERED:
-- 1. Insert new gallery in 'draft' status.
-- 2. Read the inserted gallery record (required by PostgREST .select() / RETURNING).
-- 3. Insert photo metadata rows linked to the created gallery.
-- 4. Read photo records belonging to galleries.
--
-- CONSTRAINTS ENFORCED:
-- - RLS remains ENABLED on all 3 tables: galleries, photos, selections.
-- - No UPDATE or DELETE policies created.
-- - No policies created for selections.
-- ==============================================================================

-- 1. Ensure minimal table-level permissions for anon and authenticated roles
GRANT SELECT, INSERT ON TABLE galleries TO anon, authenticated;
GRANT SELECT, INSERT ON TABLE photos TO anon, authenticated;

-- 2. GALLERIES POLICIES
DROP POLICY IF EXISTS "galleries_insert_dev" ON galleries;
CREATE POLICY "galleries_insert_dev"
ON galleries
FOR INSERT
TO anon, authenticated
WITH CHECK (status = 'draft');

DROP POLICY IF EXISTS "galleries_select_dev" ON galleries;
CREATE POLICY "galleries_select_dev"
ON galleries
FOR SELECT
TO anon, authenticated
USING (true);

-- 3. PHOTOS POLICIES
DROP POLICY IF EXISTS "photos_insert_dev" ON photos;
CREATE POLICY "photos_insert_dev"
ON photos
FOR INSERT
TO anon, authenticated
WITH CHECK (gallery_id IS NOT NULL);

DROP POLICY IF EXISTS "photos_select_dev" ON photos;
CREATE POLICY "photos_select_dev"
ON photos
FOR SELECT
TO anon, authenticated
USING (true);
