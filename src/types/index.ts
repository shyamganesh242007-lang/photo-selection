// ==============================================================================
// PHOTO SELECTION PLATFORM - CORE DOMAIN TYPES & INTERFACES
// ==============================================================================

export type GalleryStatus =
  | 'draft'       // Local folder scanned, awaiting WebP conversion & cloud upload
  | 'processing'  // Local machine currently converting high-res originals to WebP
  | 'uploading'   // WebP previews uploading to Cloudflare R2
  | 'active'      // Live online gallery, link sent to customer, awaiting selection
  | 'submitted'   // Customer has selected EXACT limit and locked selection
  | 'syncing'     // Desktop tool actively copying matched original files to new folder
  | 'completed'   // All originals verified copied & Cloudflare R2 previews cleaned
  | 'archived';   // Project completed and archived

export type CloudCleanupStatus = 'pending' | 'in_progress' | 'cleaned' | 'failed' | 'skipped';

export interface PhotoDimensions {
  width: number;
  height: number;
}

export interface Photo {
  photoId: string;               // Stable unique ID (e.g. 'p_shyam_0456_a9f2')
  galleryId: string;             // Associated gallery ID
  originalFilename: string;      // Name of file on camera/disk (e.g. 'IMG_0456.JPG')
  originalRelativePath: string;  // Relative to event root (e.g. 'Ceremony/IMG_0456.JPG')
  originalSizeBytes: number;     // e.g. 15,800,000 bytes (~15.8 MB)
  webpStoragePath: string;       // Path in R2 (e.g. 'galleries/gal_123/p_shyam_0456_a9f2.webp')
  webpPreviewUrl: string;        // URL used for client-side rendering
  webpSizeBytes: number;         // e.g. 148,000 bytes (~148 KB)
  dimensions: PhotoDimensions;
  category?: string;             // Optional categorization (e.g. 'Ceremony', 'Portraits')
  isSelected: boolean;           // Whether customer selected this photo
  originalCopied: boolean;       // Whether desktop tool has copied the high-res file
  copyVerified: boolean;         // Integrity verification of local copy
}

export interface PhotoMapping {
  photoId: string;
  galleryId: string;
  originalFilename: string;
  originalRelativePath: string;
  originalSizeBytes: number;
  webpStoragePath: string;
  checksum?: string;
}

export interface Gallery {
  id: string;
  title: string;                 // e.g. 'Shyam & Ananya Wedding'
  clientName: string;            // e.g. 'Shyam Kumar'
  clientEmail: string;
  clientPhone?: string;
  localFolderPath: string;       // e.g. 'D:\\Events\\Shyam Wedding\\'
  selectedFolderExportPath: string; // e.g. 'D:\\Events\\Selected Shyam Wedding\\'
  totalPhotos: number;           // e.g. 1000 original photos detected
  selectionLimit: number;        // e.g. 300 allowed (exact requirement)
  selectedCount: number;         // Current count of selected photos
  status: GalleryStatus;
  createdAt: string;
  submittedAt?: string | null;
  copiedAt?: string | null;
  cloudCleanupStatus: CloudCleanupStatus;
  webpCompressionQuality: number; // e.g. 82
  shareToken: string;
  shareUrl: string;              // e.g. '/gallery/gal_shyam_wedding_2026'
  coverPhotoUrl?: string;
  notes?: string;
}

export interface LocalSyncJob {
  jobId: string;
  galleryId: string;
  status: 'idle' | 'in_progress' | 'completed' | 'failed';
  totalFilesToCopy: number;
  filesCopied: number;
  verifiedCount: number;
  failedFiles: Array<{ photoId: string; filename: string; error: string }>;
  sourceDirectory: string;
  destinationDirectory: string;
  startedAt?: string;
  completedAt?: string;
}

export interface CloudflareR2Config {
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicDomain: string;
  isConnected: boolean;
  lifecycleDays: number;         // Safety net auto-expire days (default: 30)
}

export interface StudioProfile {
  studioName: string;
  tagline: string;
  contactEmail: string;
  phone: string;
  currency: string;
  watermarkText?: string;
}

export interface StorageStats {
  totalGalleries: number;
  totalWebPUploadedCount: number;
  totalOriginalVolumeBytes: number;  // High-res volume kept strictly local
  totalWebPVolumeBytes: number;      // Lightweight volume in Cloudflare R2
  bandwidthSavingsPercent: number;   // Typically 98.8%+ savings
}
