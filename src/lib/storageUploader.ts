/**
 * Supabase Storage WebP Preview Uploader
 *
 * Responsibilities:
 * - Uploads generated WebP preview Blobs to Supabase Storage bucket 'photo-previews'.
 * - Uses exact structure: photo-previews/{gallery_id}/{photo_id}.webp
 * - Updates photos.webp_storage_path in Supabase with '{gallery_id}/{photo_id}.webp'.
 * - Operates with controlled concurrency (3–4 concurrent uploads) for high throughput
 *   and smooth UI without memory exhaustion on large folders (1,000–2,000 photos).
 * - Safe for retries: uses upsert = true.
 * - If all photos upload successfully, moves gallery status from 'draft' to 'active'.
 * - If any upload fails, leaves gallery status as 'draft'.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface UploadProgress {
  uploaded: number;
  total: number;
  failed: number;
  currentPhotoId?: string;
  currentFilename?: string;
}

export interface UploadItemResult {
  photoId: string;
  filename: string;
  storagePath: string;
  success: boolean;
  error?: string;
}

export interface UploadQueueItem {
  photoId: string;
  filename: string;
  blob: Blob;
}

/**
 * Upload a single WebP preview and update photos.webp_storage_path
 */
export async function uploadSinglePreview(
  supabase: SupabaseClient,
  galleryId: string,
  photoId: string,
  blob: Blob
): Promise<{ storagePath: string; success: boolean; error?: string }> {
  const storagePath = `${galleryId}/${photoId}.webp`;

  try {
    // 1. Upload to Supabase Storage bucket 'photo-previews'
    const { error: uploadError } = await supabase.storage
      .from('photo-previews')
      .upload(storagePath, blob, {
        contentType: 'image/webp',
        upsert: true, // Retry/duplicate safety
      });

    if (uploadError) {
      return {
        storagePath,
        success: false,
        error: `Storage upload failed: ${uploadError.message}`,
      };
    }

    // 2. Update photos table with relative storage path
    const { error: dbError } = await supabase
      .from('photos')
      .update({ webp_storage_path: storagePath })
      .eq('id', photoId);

    if (dbError) {
      return {
        storagePath,
        success: false,
        error: `Database update failed: ${dbError.message}`,
      };
    }

    return { storagePath, success: true };
  } catch (err: any) {
    return {
      storagePath,
      success: false,
      error: err?.message || 'Unexpected upload error',
    };
  }
}

/**
 * Concurrency worker queue: uploads WebP previews in bounded batches (3–4 concurrent uploads)
 * and safely updates gallery status to 'active' if and only if all uploads succeed.
 */
export async function processUploadQueue(
  supabase: SupabaseClient,
  galleryId: string,
  items: UploadQueueItem[],
  onProgress: (progress: UploadProgress, latestResult: UploadItemResult) => void,
  concurrency = 4
): Promise<{ results: UploadItemResult[]; galleryActive: boolean }> {
  const results: UploadItemResult[] = new Array(items.length);
  let currentIndex = 0;
  let uploadedCount = 0;
  let failedCount = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      const item = items[index];

      const uploadResult = await uploadSinglePreview(
        supabase,
        galleryId,
        item.photoId,
        item.blob
      );

      const result: UploadItemResult = {
        photoId: item.photoId,
        filename: item.filename,
        storagePath: uploadResult.storagePath,
        success: uploadResult.success,
        error: uploadResult.error,
      };

      results[index] = result;

      if (uploadResult.success) {
        uploadedCount++;
      } else {
        failedCount++;
      }

      onProgress(
        {
          uploaded: uploadedCount,
          total: items.length,
          failed: failedCount,
          currentPhotoId: item.photoId,
          currentFilename: item.filename,
        },
        result
      );

      // Yield microtask to ensure smooth UI repaints and avoid event loop lag
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  // Status transition: Move to 'active' ONLY if ALL uploads succeeded
  let galleryActive = false;
  if (failedCount === 0 && items.length > 0) {
    const { error: statusError } = await supabase
      .from('galleries')
      .update({ status: 'active' })
      .eq('id', galleryId);

    if (!statusError) {
      galleryActive = true;
    } else {
      console.warn('Could not update gallery status to active:', statusError);
    }
  }

  return { results, galleryActive };
}
