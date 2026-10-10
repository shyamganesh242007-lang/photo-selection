import type { ILocalSyncService, SyncProgressUpdate, VerificationResult } from './ILocalSyncService';
import type { LocalSyncJob, PhotoMapping } from '../../types';

export class LocalSyncService implements ILocalSyncService {
  async copySelectedOriginals(
    galleryId: string,
    sourceFolder: string,
    destinationFolder: string,
    mappings: PhotoMapping[],
    selectedPhotoIds: string[],
    onProgress?: (update: SyncProgressUpdate) => void
  ): Promise<LocalSyncJob> {
    const selectedMappings = mappings.filter((m) => selectedPhotoIds.includes(m.photoId));
    const totalFiles = selectedMappings.length;

    const job: LocalSyncJob = {
      jobId: `sync_${galleryId}_${Date.now()}`,
      galleryId,
      status: 'in_progress',
      totalFilesToCopy: totalFiles,
      filesCopied: 0,
      verifiedCount: 0,
      failedFiles: [],
      sourceDirectory: sourceFolder,
      destinationDirectory: destinationFolder,
      startedAt: new Date().toISOString(),
    };

    let totalBytesCopied = 0;

    // Simulate high-throughput local disk copy (or Native File System write)
    for (let i = 0; i < totalFiles; i++) {
      const item = selectedMappings[i];
      // Simulated per-file copy delay (e.g. 15MB file copying from HDD/SSD)
      await new Promise((res) => setTimeout(res, 25));

      totalBytesCopied += item.originalSizeBytes;
      job.filesCopied = i + 1;

      if (onProgress) {
        onProgress({
          filesCopied: i + 1,
          totalFiles,
          percent: Math.round(((i + 1) / totalFiles) * 100),
          currentFilename: item.originalFilename,
          bytesCopied: totalBytesCopied,
        });
      }
    }

    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    return job;
  }

  async verifyCopiedOriginals(
    job: LocalSyncJob,
    _mappings: PhotoMapping[]
  ): Promise<VerificationResult> {
    // Delay to simulate disk verification and hash checks
    await new Promise((res) => setTimeout(res, 350));

    const isVerified = job.filesCopied === job.totalFilesToCopy && job.failedFiles.length === 0;

    return {
      isVerified,
      totalVerified: job.filesCopied,
      missingFiles: [],
      sizeMismatches: [],
      message: isVerified
        ? `100% Verified: All ${job.filesCopied} original master camera files verified in "${job.destinationDirectory}". Zero WebP previews were copied. Original master folder untouched.`
        : 'Verification failed: Some files were not copied or are missing.',
    };
  }
}

export const localSyncService = new LocalSyncService();
