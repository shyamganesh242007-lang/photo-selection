-- ==============================================================================
-- MIGRATION: 20261010000006_auth_hardening.sql
-- DESCRIPTION: Step 13 Photographer Authentication & Authorization Hardening
--
-- WORKFLOW & HARDENING COVERED:
-- 1. Restrict Photographer Write Operations:
--    - galleries (INSERT, UPDATE): authenticated only
--    - photos (INSERT, UPDATE): authenticated only
--    - storage.objects (INSERT, UPDATE, DELETE): authenticated only
-- 2. Restrict Anonymous Read Operations:
--    - Anonymous customers can only read galleries with status in ('active', 'submitted', 'completed', 'archived')
--    - Anonymous customers cannot read draft or processing galleries
--    - Anonymous customers can only read photos/selections/storage for customer-visible galleries
-- 3. Secure Customer Submission RPC:
--    - Creates submit_gallery(p_gallery_id uuid) function with SECURITY DEFINER
--    - Validates selection_count = selection_limit before transitioning status to 'submitted'
--    - Anonymous customers cannot perform arbitrary updates to galleries
-- 4. Preserve Customer Selection Submission:
--    - Anonymous customers can still INSERT selections for active galleries
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. TABLE PERMISSIONS & ROLE REVOCATIONS
-- ------------------------------------------------------------------------------
-- Ensure only authenticated users can insert or update galleries and photos
REVOKE INSERT, UPDATE ON TABLE galleries FROM anon;
REVOKE INSERT, UPDATE ON TABLE photos FROM anon;

GRANT SELECT ON TABLE galleries TO anon;
GRANT SELECT ON TABLE photos TO anon;
GRANT SELECT, INSERT ON TABLE selections TO anon;

GRANT SELECT, INSERT, UPDATE ON TABLE galleries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE photos TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE selections TO authenticated;

-- ------------------------------------------------------------------------------
-- 2. GALLERIES RLS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "galleries_insert_dev" ON galleries;
DROP POLICY IF EXISTS "galleries_insert_auth" ON galleries;
CREATE POLICY "galleries_insert_auth"
ON galleries
FOR INSERT
TO authenticated
WITH CHECK (status = 'draft');

DROP POLICY IF EXISTS "galleries_update_dev" ON galleries;
DROP POLICY IF EXISTS "galleries_update_auth" ON galleries;
CREATE POLICY "galleries_update_auth"
ON galleries
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "galleries_select_dev" ON galleries;
DROP POLICY IF EXISTS "galleries_select_auth" ON galleries;
DROP POLICY IF EXISTS "galleries_select_anon" ON galleries;

-- Authenticated photographer can view all galleries (draft, processing, active, etc.)
CREATE POLICY "galleries_select_auth"
ON galleries
FOR SELECT
TO authenticated
USING (true);

-- Anonymous customers can only view customer-visible galleries
CREATE POLICY "galleries_select_anon"
ON galleries
FOR SELECT
TO anon
USING (status IN ('active', 'submitted', 'completed', 'archived'));

-- ------------------------------------------------------------------------------
-- 3. PHOTOS RLS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "photos_insert_dev" ON photos;
DROP POLICY IF EXISTS "photos_insert_auth" ON photos;
CREATE POLICY "photos_insert_auth"
ON photos
FOR INSERT
TO authenticated
WITH CHECK (gallery_id IS NOT NULL);

DROP POLICY IF EXISTS "photos_update_dev" ON photos;
DROP POLICY IF EXISTS "photos_update_auth" ON photos;
CREATE POLICY "photos_update_auth"
ON photos
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "photos_select_dev" ON photos;
DROP POLICY IF EXISTS "photos_select_auth" ON photos;
DROP POLICY IF EXISTS "photos_select_anon" ON photos;

-- Authenticated photographer can view all photo metadata
CREATE POLICY "photos_select_auth"
ON photos
FOR SELECT
TO authenticated
USING (true);

-- Anonymous customers can only view photos belonging to customer-visible galleries
CREATE POLICY "photos_select_anon"
ON photos
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM galleries g
    WHERE g.id = photos.gallery_id
    AND g.status IN ('active', 'submitted', 'completed', 'archived')
  )
);

-- ------------------------------------------------------------------------------
-- 4. SELECTIONS RLS POLICIES
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "selections_select_dev" ON selections;
DROP POLICY IF EXISTS "selections_select_auth" ON selections;
DROP POLICY IF EXISTS "selections_select_anon" ON selections;

-- Authenticated photographer can view selections across all galleries
CREATE POLICY "selections_select_auth"
ON selections
FOR SELECT
TO authenticated
USING (true);

-- Anonymous customers can only view selections belonging to customer-visible galleries
CREATE POLICY "selections_select_anon"
ON selections
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM galleries g
    WHERE g.id = selections.gallery_id
    AND g.status IN ('active', 'submitted', 'completed', 'archived')
  )
);

-- Selection INSERT remains protected for active galleries only (from Step 12)
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
    SELECT 1 FROM galleries g
    WHERE g.id = selections.gallery_id
    AND g.status = 'active'
  )
);

-- ------------------------------------------------------------------------------
-- 5. SECURE CUSTOMER SUBMISSION RPC
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_gallery(p_gallery_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_gallery RECORD;
  v_count INTEGER;
BEGIN
  -- 1. Validate gallery exists and lock row
  SELECT id, status, selection_limit
  INTO v_gallery
  FROM galleries
  WHERE id = p_gallery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Gallery not found');
  END IF;

  -- 2. Check if already submitted (idempotent submission handling)
  IF v_gallery.status = 'submitted' THEN
    RETURN jsonb_build_object('success', true, 'already_submitted', true, 'message', 'Gallery is already submitted');
  END IF;

  -- 3. Validate current status is active
  IF v_gallery.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error', format('Gallery is in %s state and cannot be submitted', v_gallery.status));
  END IF;

  -- 4. Count selections for this gallery
  SELECT COUNT(*)
  INTO v_count
  FROM selections
  WHERE gallery_id = p_gallery_id;

  -- 5. Verify exact selection count matches selection limit
  IF v_count <> v_gallery.selection_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Selection count (%s) does not match required limit (%s)', v_count, v_gallery.selection_limit),
      'selection_count', v_count,
      'selection_limit', v_gallery.selection_limit
    );
  END IF;

  -- 6. Transition status to 'submitted'
  UPDATE galleries
  SET status = 'submitted',
      updated_at = timezone('utc', now())
  WHERE id = p_gallery_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'submitted',
    'message', 'Gallery selections submitted successfully'
  );
END;
$$;

-- Grant EXECUTE permission on submit_gallery to anon and authenticated
GRANT EXECUTE ON FUNCTION submit_gallery(uuid) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 6. STORAGE POLICIES FOR 'photo-previews'
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "photo_previews_insert_dev" ON storage.objects;
DROP POLICY IF EXISTS "photo_previews_insert_auth" ON storage.objects;
CREATE POLICY "photo_previews_insert_auth"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'photo-previews');

DROP POLICY IF EXISTS "photo_previews_update_dev" ON storage.objects;
DROP POLICY IF EXISTS "photo_previews_update_auth" ON storage.objects;
CREATE POLICY "photo_previews_update_auth"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'photo-previews')
WITH CHECK (bucket_id = 'photo-previews');

DROP POLICY IF EXISTS "photo_previews_delete_dev" ON storage.objects;
DROP POLICY IF EXISTS "photo_previews_delete_auth" ON storage.objects;
CREATE POLICY "photo_previews_delete_auth"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'photo-previews');

DROP POLICY IF EXISTS "photo_previews_select_dev" ON storage.objects;
DROP POLICY IF EXISTS "photo_previews_select_auth" ON storage.objects;
DROP POLICY IF EXISTS "photo_previews_select_anon" ON storage.objects;

-- Authenticated photographer can view all previews
CREATE POLICY "photo_previews_select_auth"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'photo-previews');

-- Anonymous customers can only view previews of customer-visible galleries
CREATE POLICY "photo_previews_select_anon"
ON storage.objects
FOR SELECT
TO anon
USING (
  bucket_id = 'photo-previews'
  AND EXISTS (
    SELECT 1 FROM galleries g
    WHERE g.id::text = split_part(name, '/', 1)
    AND g.status IN ('active', 'submitted', 'completed', 'archived')
  )
);
