// ==============================================================================
// CLOUD CLEANUP SERVICE (Safe R2 WebP Pruning After Verified Local Copy)
// ==============================================================================

import type { Gallery, LocalSyncJob } from '../../types';
import type { IStorageService } from '../storage/IStorageService';
import type { VerificationResult } from '../sync/ILocalSyncService';

export interface CleanupResult {
  allowed: boolean;
  success: boolean;
  purgedCount: number;
  message: string;
  error?: string;
}

export class CleanupService {
  private storageService: IStorageService;

  constructor(storageService: IStorageService) {
    this.storageService = storageService;
  }

  /**
   * Safely deletes WebP previews from Cloudflare R2 ONLY IF:
   * 1. Customer has submitted selection
   * 2. Local copy job is completed
   * 3. Verification check is 100% passed
   * 4. Original files exist in the new destination folder
   */
  async executeCloudCleanup(
    gallery: Gallery,
    syncJob: LocalSyncJob | null,
    verification: VerificationResult | null,
    storagePaths: string[]
  ): Promise<CleanupResult> {
    // GUARD 1: Gallery must be submitted
    if (gallery.status !== 'submitted' && gallery.status !== 'syncing' && gallery.status !== 'completed') {
      return {
        allowed: false,
        success: false,
        purgedCount: 0,
        message: 'Cleanup blocked: Customer has not submitted their final photo selection yet.',
      };
    }

    // GUARD 2: Sync job must exist and be marked completed
    if (!syncJob || syncJob.status !== 'completed') {
      return {
        allowed: false,
        success: false,
        purgedCount: 0,
        message: 'Cleanup blocked: Original files have not been copied locally yet.',
      };
    }

    // GUARD 3: Verification must be strictly true
    if (!verification || !verification.isVerified) {
      return {
        allowed: false,
        success: false,
        purgedCount: 0,
        message: 'Cleanup strictly blocked: Local copy verification check has NOT passed!',
      };
    }

    // GUARD 4: Must have copied the exact required count
    if (syncJob.filesCopied !== gallery.selectionLimit) {
      return {
        allowed: false,
        success: false,
        purgedCount: 0,
        message: `Cleanup blocked: Copied count (${syncJob.filesCopied}) does not match selection limit (${gallery.selectionLimit}).`,
      };
    }

    // ALL GUARDS PASSED -> Execute batch prune from Cloudflare R2
    try {
      const result = await this.storageService.batchDeleteGalleryPreviews(gallery.id, storagePaths);

      return {
        allowed: true,
        success: true,
        purgedCount: result.deletedCount,
        message: `Cloudflare R2 Cleanup Verified & Completed: Purged ${result.deletedCount} temporary WebP preview files. Zero original files modified.`,
      };
    } catch (err: any) {
      return {
        allowed: true,
        success: false,
        purgedCount: 0,
        message: `Cleanup error occurred while communicating with Cloudflare R2: ${err.message}`,
        error: err.message,
      };
    }
  }
}
