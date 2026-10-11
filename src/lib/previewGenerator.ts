/**
 * Local WebP Preview Generator
 *
 * Responsibilities:
 * - Generates high-quality WebP previews locally in the browser.
 * - Preserves aspect ratio without cropping.
 * - Handles EXIF orientation automatically.
 * - Targets ~100–200 KB preview file size when practical without degrading quality.
 * - Decodes and scales asynchronously with controlled concurrency (e.g. 2 workers)
 *   so UI remains responsive and memory is kept bounded (suitable for 1,000–2,000 photos).
 * - Leaves original File objects completely untouched.
 */

export interface WebPPreviewResult {
  filename: string;
  relativePath: string;
  success: boolean;
  blob?: Blob;
  previewUrl?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  error?: string;
}

export interface PreviewGenerationProgress {
  processed: number;
  total: number;
  currentFilename?: string;
  successCount: number;
  failedCount: number;
}

/**
 * Human-readable byte formatting (e.g., 145.2 KB)
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Generate a single WebP preview from a File or Blob.
 * - Preserves aspect ratio (never crops).
 * - Auto-orients via EXIF.
 * - Downscales large originals to maxDimension (default 1920px) for crisp proofing.
 */
export async function generateWebPPreview(
  file: File | Blob,
  maxDimension = 1920
): Promise<{ blob: Blob; width: number; height: number; sizeBytes: number }> {
  let source: ImageBitmap | HTMLImageElement | null = null;
  let origWidth = 0;
  let origHeight = 0;
  let tempObjectUrl: string | null = null;

  try {
    // 1. Decode with createImageBitmap (hardware-accelerated, honors EXIF orientation)
    if (typeof createImageBitmap === 'function') {
      try {
        source = await createImageBitmap(file, { imageOrientation: 'from-image' });
        origWidth = source.width;
        origHeight = source.height;
      } catch {
        // Fallback to HTMLImageElement if createImageBitmap fails for specific format
        source = null;
      }
    }

    // Fallback: standard HTMLImageElement decode
    if (!source) {
      tempObjectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.src = tempObjectUrl;
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Browser could not decode image format'));
      });
      source = img;
      origWidth = img.naturalWidth || img.width;
      origHeight = img.naturalHeight || img.height;
    }

    if (!origWidth || !origHeight) {
      throw new Error('Image has invalid zero dimensions');
    }

    // 2. Proportional aspect ratio scale (NEVER crops, never upscales small images)
    const scale = Math.min(1, maxDimension / Math.max(origWidth, origHeight));
    const targetWidth = Math.max(1, Math.round(origWidth * scale));
    const targetHeight = Math.max(1, Math.round(origHeight * scale));

    // 3. Render onto Canvas
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Canvas 2D context unavailable');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, targetWidth, targetHeight);

    // 4. Export WebP with balanced quality (target ~100-200 KB practical range)
    const quality = 0.82;
    let blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality)
    );

    if (!blob) {
      throw new Error('Canvas toBlob(image/webp) returned null');
    }

    // Gentle second pass ONLY if practical and file is exceptionally large (>280KB)
    if (blob.size > 280 * 1024 && targetWidth > 1200) {
      const secondPass = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/webp', 0.76)
      );
      if (secondPass && secondPass.size < blob.size) {
        blob = secondPass;
      }
    }

    // Free canvas memory buffer
    canvas.width = 0;
    canvas.height = 0;

    return {
      blob,
      width: targetWidth,
      height: targetHeight,
      sizeBytes: blob.size,
    };
  } finally {
    // Release native resources immediately to keep memory bounded
    if (source && 'close' in source && typeof (source as ImageBitmap).close === 'function') {
      (source as ImageBitmap).close();
    }
    if (tempObjectUrl) {
      URL.revokeObjectURL(tempObjectUrl);
    }
  }
}

/**
 * Concurrency worker queue: processes photos in bounded concurrent batches
 * so 1,000–2,000 photos process smoothly without freezing the UI or exhausting RAM.
 */
export async function processPreviewQueue(
  items: {
    photo: { filename: string; relativePath: string };
    getFile: () => Promise<File | null>;
  }[],
  onProgress: (progress: PreviewGenerationProgress, latestResult: WebPPreviewResult) => void,
  concurrency = 2
): Promise<WebPPreviewResult[]> {
  const results: WebPPreviewResult[] = new Array(items.length);
  let currentIndex = 0;
  let processedCount = 0;
  let successCount = 0;
  let failedCount = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      const item = items[index];

      let result: WebPPreviewResult;
      try {
        const file = await item.getFile();
        if (!file) {
          throw new Error('Could not read original file stream');
        }

        const preview = await generateWebPPreview(file);
        const previewUrl = URL.createObjectURL(preview.blob);

        result = {
          filename: item.photo.filename,
          relativePath: item.photo.relativePath,
          success: true,
          blob: preview.blob,
          previewUrl,
          width: preview.width,
          height: preview.height,
          sizeBytes: preview.sizeBytes,
        };
        successCount++;
      } catch (err: any) {
        result = {
          filename: item.photo.filename,
          relativePath: item.photo.relativePath,
          success: false,
          error: err?.message || 'Failed to generate WebP preview',
        };
        failedCount++;
      }

      results[index] = result;
      processedCount++;

      onProgress(
        {
          processed: processedCount,
          total: items.length,
          currentFilename: item.photo.filename,
          successCount,
          failedCount,
        },
        result
      );

      // Yield microtask execution to allow smooth UI repaint
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  return results;
}
