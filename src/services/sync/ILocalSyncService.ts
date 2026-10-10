// ==============================================================================
// LOCAL SYNC SERVICE INTERFACE (Original File Retrieval & Copy)
// ==============================================================================

import type { LocalSyncJob, PhotoMapping } from '../../types';

export interface SyncProgressUpdate {
  filesCopied: number;
  totalFiles: number;
  percent: number;
  currentFilename: string;
  bytesCopied: number;
}

export interface VerificationResult {
  isVerified: boolean;
  totalVerified: number;
  missingFiles: string[];
  sizeMismatches: string[];
  message: string;
}

export interface ILocalSyncService {
  /**
   * Matches customer-selected photo IDs with original local files,
   * generates the destination folder (e.g. 'Selected Shyam Wedding'),
   * and copies the untouched high-res originals.
   */
  copySelectedOriginals(
    galleryId: string,
    sourceFolder: string,
    destinationFolder: string,
    mappings: PhotoMapping[],
    selectedPhotoIds: string[],
    onProgress?: (update: SyncProgressUpdate) => void
  ): Promise<LocalSyncJob>;

  /**
   * Strictly verifies that all selected originals exist in the destination folder
   * and match the expected file size BEFORE any cloud cleanup can be permitted.
   */
  verifyCopiedOriginals(
    job: LocalSyncJob,
    mappings: PhotoMapping[]
  ): Promise<VerificationResult>;
}
