-- ==============================================================================
-- MIGRATION: 20261010000008_cleanup_status_fields.sql
-- DESCRIPTION: Step 17 Cloud Cleanup Metadata & Status Tracking
--
-- WORKFLOW & CLEANUP SPECIFICATION:
-- 1. Adds cloud_cleanup_at timestamptz to track scheduled or execution time.
-- 2. Adds cloud_cleanup_status text with values ('none', 'scheduled', 'deleted', 'failed').
-- 3. Updates get_expired_completed_galleries to filter galleries eligible for automatic cleanup.
-- 4. Updates mark_gallery_previews_cleaned to transition cloud_cleanup_status to 'deleted'.
-- ==============================================================================

-- 1. Add columns to galleries table if they do not exist
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS cloud_cleanup_at timestamptz;
ALTER TABLE galleries ADD COLUMN IF NOT EXISTS cloud_cleanup_status text DEFAULT 'none';

-- 2. Add constraint to validate cloud_cleanup_status values
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

-- 3. Function to get expired completed galleries for scheduled cleanup
CREATE OR REPLACE FUNCTION get_expired_completed_galleries(p_hours integer DEFAULT 24)
RETURNS TABLE (
  gallery_id uuid,
  gallery_name text,
  completed_at timestamptz,
  cleanup_scheduled_at timestamptz,
  cleanup_status text,
  hours_since_completion double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    id AS gallery_id,
    name AS gallery_name,
    updated_at AS completed_at,
    cloud_cleanup_at AS cleanup_scheduled_at,
    cloud_cleanup_status AS cleanup_status,
    EXTRACT(EPOCH FROM (timezone('utc', now()) - updated_at)) / 3600.0 AS hours_since_completion
  FROM galleries
  WHERE status = 'completed'
  AND (cloud_cleanup_status IS NULL OR cloud_cleanup_status <> 'deleted')
  AND (
    (cloud_cleanup_at IS NOT NULL AND cloud_cleanup_at <= timezone('utc', now()))
    OR (updated_at <= timezone('utc', now()) - (p_hours || ' hours')::interval)
  )
  ORDER BY updated_at ASC;
$$;

GRANT EXECUTE ON FUNCTION get_expired_completed_galleries(integer) TO anon, authenticated;

-- 4. Function to mark gallery previews as cleaned
CREATE OR REPLACE FUNCTION mark_gallery_previews_cleaned(p_gallery_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated_photos integer;
BEGIN
  -- Nullify storage path in photos table
  UPDATE photos
  SET webp_storage_path = NULL
  WHERE gallery_id = p_gallery_id
  AND webp_storage_path IS NOT NULL;

  GET DIAGNOSTICS v_updated_photos = ROW_COUNT;

  -- Update cleanup status and timestamp in galleries table
  UPDATE galleries
  SET
    cloud_cleanup_status = 'deleted',
    cloud_cleanup_at = timezone('utc', now())
  WHERE id = p_gallery_id;

  RETURN jsonb_build_object(
    'success', true,
    'gallery_id', p_gallery_id,
    'cloud_cleanup_status', 'deleted',
    'updated_photos_count', v_updated_photos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION mark_gallery_previews_cleaned(uuid) TO anon, authenticated;
