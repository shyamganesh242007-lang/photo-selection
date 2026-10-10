// ==============================================================================
// SUPABASE DATABASE TYPES (Generated from schema)
// Tables: galleries, photos, selections
// ==============================================================================

export type GalleryStatus =
  | 'draft'
  | 'processing'
  | 'active'
  | 'submitted'
  | 'completed'
  | 'archived';

export interface GalleryRow {
  id: string; // UUID primary key
  name: string;
  selection_limit: number;
  total_photos: number;
  status: GalleryStatus;
  created_at: string;
  updated_at: string;
}

export interface PhotoRow {
  id: string; // UUID primary key
  gallery_id: string; // UUID foreign key -> galleries.id
  original_filename: string;
  original_relative_path: string;
  webp_storage_path: string | null;
  sort_order: number;
  created_at: string;
}

export interface SelectionRow {
  id: string; // UUID primary key
  gallery_id: string; // UUID foreign key -> galleries.id
  photo_id: string; // UUID foreign key -> photos.id
  selected_at: string;
}
