-- ==============================================================================
-- PHOTO SELECTION APPLICATION - DATABASE SCHEMA MIGRATION
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
