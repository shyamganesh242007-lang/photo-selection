-- ==============================================================================
-- MIGRATION: 20261010000005_security_hardening.sql
-- DESCRIPTION: Step 12 Production Security & RLS Hardening
--
-- WORKFLOW COVERED:
-- 1. Restrict customer selection insertion to only active galleries.
--    Prevents inserting selections into draft, submitted, completed, or archived galleries.
-- 2. Strictly enforce that selections must match existing photos in the same active gallery.
--    (Reinforced by existing composite foreign key fk_selections_photo_gallery_match).
-- 3. Confirm that DELETE on database tables (galleries, photos, selections) remains
--    explicitly denied for anonymous/public clients.
-- ==============================================================================

-- 1. Selections INSERT Hardening: Only allowed when the associated gallery is in 'active' status
DROP POLICY IF EXISTS "selections_insert_dev" ON selections;
DROP POLICY IF EXISTS "selections_insert_active_only" ON selections;

CREATE POLICY "selections_insert_active_only"
ON selections
FOR INSERT
TO anon, authenticated
WITH CHECK (
  gallery_id IS NOT NULL AND
  photo_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM galleries
    WHERE galleries.id = selections.gallery_id
    AND galleries.status = 'active'
  )
);
