-- ==============================================================================
-- MIGRATION: 20261010000009_cleanup_gallery_database.sql
-- DESCRIPTION: Atomic Database Cleanup & Row Deletion Fixes
--
-- FIXES INCLUDED:
-- 1. ISSUE 1: "Delete Cloud Previews" deletes Storage WebPs + selections + photos,
--    while preserving the galleries row as lightweight event history.
-- 2. ISSUE 2: Recent Events [X] deletes Storage WebPs + selections + photos +
--    the galleries database row itself.
-- 3. ISSUE 3: Successful local copy + SHA-256 verification immediately triggers
--    cloud cleanup (Storage WebPs + selections + photos deleted, galleries history preserved).
-- 4. Provides both SECURITY DEFINER RPC functions and direct table DELETE permissions.
-- ==============================================================================

-- 1. ENSURE STATUS TRACKING COLUMNS EXIST ON GALLERIES
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS cloud_cleanup_at timestamptz;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS cloud_cleanup_status text DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_galleries_cloud_cleanup_status'
  ) THEN
    ALTER TABLE galleries
    ADD CONSTRAINT chk_galleries_cloud_cleanup_status
    CHECK (cloud_cleanup_status IN ('none', 'scheduled', 'deleted', 'failed'));
  END IF;
END $$;

-- 2. FUNCTION: cleanup_gallery_database
-- Atomically deletes selections and photos for a gallery while PRESERVING
-- the galleries row for lightweight history.
CREATE OR REPLACE FUNCTION cleanup_gallery_database(p_gallery_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_gallery_status text;
  v_deleted_selections integer := 0;
  v_deleted_photos integer := 0;
BEGIN
  -- Security Guard 1: Verify gallery exists
  SELECT status INTO v_gallery_status
  FROM galleries
  WHERE id = p_gallery_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Gallery not found'
    );
  END IF;

  -- Security Guard 2: Never cleanup the protected test gallery
  IF p_gallery_id = 'e47c936b-d91a-470a-942d-deee2fa788f9'::uuid THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Protected test gallery cannot be cleaned up'
    );
  END IF;

  -- FK ORDER 1: Delete selections rows for this gallery
  DELETE FROM selections
  WHERE gallery_id = p_gallery_id;
  GET DIAGNOSTICS v_deleted_selections = ROW_COUNT;

  -- FK ORDER 2: Delete photos rows for this gallery
  DELETE FROM photos
  WHERE gallery_id = p_gallery_id;
  GET DIAGNOSTICS v_deleted_photos = ROW_COUNT;

  -- FK ORDER 3: KEEP galleries row! Update status to completed and cloud cleanup info
  UPDATE galleries
  SET status = 'completed',
      cloud_cleanup_status = 'deleted',
      cloud_cleanup_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  WHERE id = p_gallery_id;

  RETURN jsonb_build_object(
    'success', true,
    'gallery_id', p_gallery_id,
    'deleted_selections', v_deleted_selections,
    'deleted_photos', v_deleted_photos,
    'galleries_preserved', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_gallery_database(uuid) TO anon, authenticated;

-- 3. FUNCTION: delete_gallery_completely
-- Atomically deletes selections, photos, AND the gallery row itself.
-- Triggered when the photographer clicks [X] on Recent Events.
CREATE OR REPLACE FUNCTION delete_gallery_completely(p_gallery_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted_selections integer := 0;
  v_deleted_photos integer := 0;
  v_deleted_galleries integer := 0;
BEGIN
  -- Security Guard: Never delete the protected test gallery
  IF p_gallery_id = 'e47c936b-d91a-470a-942d-deee2fa788f9'::uuid THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Protected test gallery cannot be deleted'
    );
  END IF;

  -- FK ORDER 1: Delete selections rows for this gallery
  DELETE FROM selections
  WHERE gallery_id = p_gallery_id;
  GET DIAGNOSTICS v_deleted_selections = ROW_COUNT;

  -- FK ORDER 2: Delete photos rows for this gallery
  DELETE FROM photos
  WHERE gallery_id = p_gallery_id;
  GET DIAGNOSTICS v_deleted_photos = ROW_COUNT;

  -- FK ORDER 3: Delete the galleries row itself
  DELETE FROM galleries
  WHERE id = p_gallery_id;
  GET DIAGNOSTICS v_deleted_galleries = ROW_COUNT;

  IF v_deleted_galleries = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Gallery not found or already deleted'
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'gallery_id', p_gallery_id,
    'deleted_selections', v_deleted_selections,
    'deleted_photos', v_deleted_photos,
    'deleted_galleries', v_deleted_galleries
  );
END;
$$;

GRANT EXECUTE ON FUNCTION delete_gallery_completely(uuid) TO anon, authenticated;

-- 4. TABLE LEVEL PERMISSIONS FOR DIRECT DELETION
GRANT DELETE ON TABLE selections TO anon, authenticated;
GRANT DELETE ON TABLE photos TO anon, authenticated;
GRANT DELETE ON TABLE galleries TO anon, authenticated;

-- 5. RLS POLICIES FOR DIRECT CLIENT DELETES
DROP POLICY IF EXISTS "selections_delete_completed" ON selections;
DROP POLICY IF EXISTS "selections_delete_all" ON selections;
CREATE POLICY "selections_delete_all"
ON selections
FOR DELETE
TO anon, authenticated
USING (gallery_id <> 'e47c936b-d91a-470a-942d-deee2fa788f9'::uuid);

DROP POLICY IF EXISTS "photos_delete_completed" ON photos;
DROP POLICY IF EXISTS "photos_delete_all" ON photos;
CREATE POLICY "photos_delete_all"
ON photos
FOR DELETE
TO anon, authenticated
USING (gallery_id <> 'e47c936b-d91a-470a-942d-deee2fa788f9'::uuid);

DROP POLICY IF EXISTS "galleries_delete_all" ON galleries;
CREATE POLICY "galleries_delete_all"
ON galleries
FOR DELETE
TO anon, authenticated
USING (id <> 'e47c936b-d91a-470a-942d-deee2fa788f9'::uuid);
