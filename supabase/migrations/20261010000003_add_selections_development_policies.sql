-- ==============================================================================
-- MIGRATION: 20261010000003_add_selections_development_policies.sql
-- DESCRIPTION: Minimum development policies for customer photo selection submission.
--
-- WORKFLOW COVERED:
-- 1. Allow customer (anon/authenticated) to insert selected photos into 'selections'.
-- 2. Allow customer (anon/authenticated) to read selections for verification.
--
-- CONSTRAINTS ENFORCED:
-- - RLS remains fully ENABLED on 'selections'.
-- - Foreign key constraints ensure selections.gallery_id matches photos.gallery_id.
-- - Unique constraint prevents duplicate photo submissions.
-- - No UPDATE or DELETE policies created.
-- ==============================================================================

-- 1. Table-level permissions
GRANT SELECT, INSERT ON TABLE selections TO anon, authenticated;

-- 2. Row Level Security policies for development
DROP POLICY IF EXISTS "selections_insert_dev" ON selections;
CREATE POLICY "selections_insert_dev"
ON selections
FOR INSERT
TO anon, authenticated
WITH CHECK (gallery_id IS NOT NULL AND photo_id IS NOT NULL);

DROP POLICY IF EXISTS "selections_select_dev" ON selections;
CREATE POLICY "selections_select_dev"
ON selections
FOR SELECT
TO anon, authenticated
USING (true);
