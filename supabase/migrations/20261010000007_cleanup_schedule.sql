-- ==============================================================================
-- MIGRATION: 20261010000007_cleanup_schedule.sql
-- DESCRIPTION: Step 16 Automatic 24-Hour WebP Cleanup & Preview Status
--
-- WORKFLOW & CLEANUP SPECIFICATION:
-- 1. Keeps WebP previews temporarily for recovery for approximately 24 hours
--    after successful original retrieval & SHA-256 verification.
-- 2. get_expired_completed_galleries(p_hours):
--    Identifies completed galleries whose completion timestamp (updated_at)
--    is older than 24 hours.
-- 3. mark_gallery_previews_cleaned(p_gallery_id):
--    Nullifies webp_storage_path in photos table once storage previews are deleted.
-- 4. Server-Side Execution / pg_cron Pattern:
--    If pg_cron is enabled in Supabase, schedule hourly cleanup via:
--    SELECT cron.schedule('cleanup-expired-webp-previews', '0 * * * *', ...);
-- ==============================================================================

-- 1. FUNCTION: get_expired_completed_galleries
-- Returns galleries that were marked 'completed' more than p_hours ago (default 24).
CREATE OR REPLACE FUNCTION get_expired_completed_galleries(p_hours integer DEFAULT 24)
RETURNS TABLE (
  gallery_id uuid,
  gallery_name text,
  completed_at timestamptz,
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
    EXTRACT(EPOCH FROM (timezone('utc', now()) - updated_at)) / 3600.0 AS hours_since_completion
  FROM galleries
  WHERE status = 'completed'
  AND updated_at <= timezone('utc', now()) - (p_hours || ' hours')::interval
  ORDER BY updated_at ASC;
$$;

-- Grant EXECUTE permission to anon and authenticated
GRANT EXECUTE ON FUNCTION get_expired_completed_galleries(integer) TO anon, authenticated;

-- 2. FUNCTION: mark_gallery_previews_cleaned
-- Marks photo records for a gallery as having their cloud previews cleaned up.
CREATE OR REPLACE FUNCTION mark_gallery_previews_cleaned(p_gallery_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated_count integer;
BEGIN
  UPDATE photos
  SET webp_storage_path = NULL
  WHERE gallery_id = p_gallery_id
  AND webp_storage_path IS NOT NULL;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'gallery_id', p_gallery_id,
    'updated_photos_count', v_updated_count
  );
END;
$$;

-- Grant EXECUTE permission to anon and authenticated
GRANT EXECUTE ON FUNCTION mark_gallery_previews_cleaned(uuid) TO anon, authenticated;
