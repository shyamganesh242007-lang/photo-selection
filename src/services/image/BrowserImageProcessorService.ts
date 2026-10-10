import type { IImageProcessorService, WebPConversionResult } from './IImageProcessorService';

export class BrowserImageProcessorService implements IImageProcessorService {
  async compressToWebP(
    file: File | Blob,
    photoId: string,
    options: {
      quality?: number;
      maxWidth?: number;
      maxHeight?: number;
    } = {}
  ): Promise<WebPConversionResult> {
    const quality = options.quality ?? 0.82;
    const maxWidth = options.maxWidth ?? 1920;
    const maxHeight = options.maxHeight ?? 1280;
    const originalSize = file.size || 15 * 1024 * 1024;

    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas 2D context unavailable'));
          return;
        }

        // Draw and compress to WebP
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('WebP encoding failed'));
              return;
            }

            const webpSize = blob.size;
            const ratio = ((originalSize - webpSize) / originalSize) * 100;

            resolve({
              photoId,
              blob,
              width,
              height,
              originalSizeBytes: originalSize,
              webpSizeBytes: webpSize,
              compressionRatioPercent: Math.max(0, Math.round(ratio * 10) / 10),
            });
          },
          'image/webp',
          quality
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image for WebP compression'));
      };

      img.src = objectUrl;
    });
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
}

export const imageProcessor = new BrowserImageProcessorService();
