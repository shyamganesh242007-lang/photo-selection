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

export interface DetectedPhoto {
  filename: string;
  relativePath: string;
  file?: File;
  fileHandle?: any;
}

export const SUPPORTED_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'heif',
  'cr2',
  'cr3',
  'nef',
  'arw',
  'dng',
  'raw',
  'rw2',
  'orf',
  'pef',
  'tif',
  'tiff',
]);
