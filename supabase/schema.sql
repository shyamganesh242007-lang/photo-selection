-- ==============================================================================
-- PHOTO SELECTION APPLICATION - DATABASE SCHEMA (STANDALONE SQL)
-- Project: Photo Selection
-- Target: Supabase (PostgreSQL)
-- Architecture: 3 Tables (galleries, photos, selections)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. HELPER FUNCTION: AUTO-UPDATE UPDATED_AT TIMESTAMP
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- TABLE 1: galleries
-- Stores gallery/event metadata, selection limit, and workflow status.
-- No binary files are stored here.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS galleries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  selection_limit INTEGER NOT NULL,
  total_photos INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  -- Constraints
  CONSTRAINT chk_galleries_selection_limit_positive CHECK (selection_limit > 0),
  CONSTRAINT chk_galleries_total_photos_non_negative CHECK (total_photos >= 0),
  CONSTRAINT chk_galleries_status_valid CHECK (
    status IN ('draft', 'processing', 'active', 'submitted', 'completed', 'archived')
  )
);

-- Trigger for galleries.updated_at
DROP TRIGGER IF EXISTS trg_galleries_updated_at ON galleries;
CREATE TRIGGER trg_galleries_updated_at
BEFORE UPDATE ON galleries
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Indexes for galleries
CREATE INDEX IF NOT EXISTS idx_galleries_status ON galleries(status);
CREATE INDEX IF NOT EXISTS idx_galleries_created_at ON galleries(created_at DESC);

-- ==============================================================================
-- TABLE 2: photos
-- Stores stable photo mappings linking original local files to cloud WebP previews.
-- Original 15 MB RAW/JPG files remain strictly on the photographer's local PC.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  original_relative_path TEXT NOT NULL,
  webp_storage_path TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  -- Constraints
  CONSTRAINT chk_photos_sort_order_non_negative CHECK (sort_order >= 0),
  CONSTRAINT uq_photos_gallery_relative_path UNIQUE (gallery_id, original_relative_path),
  -- Compound unique candidate key required for composite foreign key constraint in selections
  CONSTRAINT uq_photos_id_gallery UNIQUE (id, gallery_id)
);

-- Indexes for photos
CREATE INDEX IF NOT EXISTS idx_photos_gallery_id ON photos(gallery_id);
CREATE INDEX IF NOT EXISTS idx_photos_gallery_sort_order ON photos(gallery_id, sort_order);

-- ==============================================================================
-- TABLE 3: selections
-- Records customer-selected photo IDs for a gallery.
-- Prevents duplicate selections and strictly ensures selections.gallery_id
-- always matches the gallery_id of selections.photo_id.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
  photo_id UUID NOT NULL,
  selected_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  -- Integrity Constraints
  -- 1. Enforces that selections.gallery_id MUST MATCH photos.gallery_id for the given photo_id
  CONSTRAINT fk_selections_photo_gallery_match
    FOREIGN KEY (photo_id, gallery_id)
    REFERENCES photos (id, gallery_id)
    ON DELETE CASCADE,

  -- 2. Prevents the same photo from ever being inserted twice into selections
  CONSTRAINT uq_selections_photo UNIQUE (photo_id),

  -- 3. Explicit unique constraint on (gallery_id, photo_id)
  CONSTRAINT uq_selections_gallery_photo UNIQUE (gallery_id, photo_id)
);

-- Indexes for selections
CREATE INDEX IF NOT EXISTS idx_selections_gallery_id ON selections(gallery_id);
CREATE INDEX IF NOT EXISTS idx_selections_photo_id ON selections(photo_id);
CREATE INDEX IF NOT EXISTS idx_selections_gallery_photo ON selections(gallery_id, photo_id);

-- ==============================================================================
-- SECURITY & ROW LEVEL SECURITY (RLS)
-- Enable RLS on all tables.
-- By default with no open policies, all direct public anonymous queries are denied.
-- Supabase service_role key automatically bypasses RLS for trusted backend operations.
-- ==============================================================================

ALTER TABLE galleries ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE selections ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- STEP 13 PRODUCTION RLS POLICIES & AUTH HARDENING
-- ------------------------------------------------------------------------------
-- 1. Table-level permissions
REVOKE INSERT, UPDATE ON TABLE galleries FROM anon;
REVOKE INSERT, UPDATE ON TABLE photos FROM anon;

GRANT SELECT ON TABLE galleries TO anon;
GRANT SELECT ON TABLE photos TO anon;
GRANT SELECT, INSERT ON TABLE selections TO anon;

GRANT SELECT, INSERT, UPDATE ON TABLE galleries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE photos TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE selections TO authenticated;

-- 2. Galleries policies
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

CREATE POLICY "galleries_select_auth"
ON galleries
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "galleries_select_anon"
ON galleries
FOR SELECT
TO anon
USING (status IN ('active', 'submitted', 'completed', 'archived'));

-- 3. Photos policies
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

CREATE POLICY "photos_select_auth"
ON photos
FOR SELECT
TO authenticated
USING (true);

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

-- 4. Selections policies
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

DROP POLICY IF EXISTS "selections_select_dev" ON selections;
DROP POLICY IF EXISTS "selections_select_auth" ON selections;
DROP POLICY IF EXISTS "selections_select_anon" ON selections;

CREATE POLICY "selections_select_auth"
ON selections
FOR SELECT
TO authenticated
USING (true);

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

  -- 2. Check if already submitted
  IF v_gallery.status = 'submitted' THEN
    RETURN jsonb_build_object('success', true, 'already_submitted', true, 'message', 'Gallery is already submitted');
  END IF;

  -- 3. Validate status is active
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

GRANT EXECUTE ON FUNCTION submit_gallery(uuid) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 6. STORAGE BUCKET & AUTH POLICIES (photo-previews)
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photo-previews',
  'photo-previews',
  false,
  5242880,
  ARRAY['image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

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

CREATE POLICY "photo_previews_select_auth"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'photo-previews');

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

-- ------------------------------------------------------------------------------
-- STEP 17 ATOMIC DATABASE CLEANUP & ROW DELETION
-- ------------------------------------------------------------------------------
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
  SELECT status INTO v_gallery_status
  FROM galleries
  WHERE id = p_gallery_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Gallery not found');
  END IF;

  IF p_gallery_id = 'e47c936b-d91a-470a-942d-deee2fa788f9'::uuid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Protected test gallery cannot be cleaned up');
  END IF;

  DELETE FROM selections WHERE gallery_id = p_gallery_id;
  GET DIAGNOSTICS v_deleted_selections = ROW_COUNT;

  DELETE FROM photos WHERE gallery_id = p_gallery_id;
  GET DIAGNOSTICS v_deleted_photos = ROW_COUNT;

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
  IF p_gallery_id = 'e47c936b-d91a-470a-942d-deee2fa788f9'::uuid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Protected test gallery cannot be deleted');
  END IF;

  DELETE FROM selections WHERE gallery_id = p_gallery_id;
  GET DIAGNOSTICS v_deleted_selections = ROW_COUNT;

  DELETE FROM photos WHERE gallery_id = p_gallery_id;
  GET DIAGNOSTICS v_deleted_photos = ROW_COUNT;

  DELETE FROM galleries WHERE id = p_gallery_id;
  GET DIAGNOSTICS v_deleted_galleries = ROW_COUNT;

  IF v_deleted_galleries = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Gallery not found or already deleted');
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

GRANT DELETE ON TABLE selections TO anon, authenticated;
GRANT DELETE ON TABLE photos TO anon, authenticated;
GRANT DELETE ON TABLE galleries TO anon, authenticated;

DROP POLICY IF EXISTS "selections_delete_all" ON selections;
CREATE POLICY "selections_delete_all"
ON selections
FOR DELETE
TO anon, authenticated
USING (gallery_id <> 'e47c936b-d91a-470a-942d-deee2fa788f9'::uuid);

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




