// ==============================================================================
// PHOTO SELECTION - CORE DATA TYPES
// ==============================================================================

export interface PhotoEventFolder {
  name: string;
  path?: string;
  photoCount: number;
  selectionLimit?: number;
}

export interface PhotoRecord {
  photoId: string;
  filename: string;
  relativePath: string;
  sizeBytes: number;
}
