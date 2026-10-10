// ==============================================================================
// IMAGE PROCESSOR SERVICE INTERFACE (Local WebP Engine)
// ==============================================================================

export interface LocalScannedFile {
  filename: string;
  relativePath: string;
  sizeBytes: number;
  lastModified: number;
  fileObject?: File;
}

export interface WebPConversionResult {
  photoId: string;
  blob?: Blob;
  dataUrl?: string;
  width: number;
  height: number;
  originalSizeBytes: number;
  webpSizeBytes: number;
  compressionRatioPercent: number;
}

export interface ConversionProgress {
  current: number;
  total: number;
  currentFilename: string;
  percent: number;
}

export interface IImageProcessorService {
  /**
   * Compress a local high-resolution image to an optimized WebP preview (~100-200 KB)
   * Keeps originals untouched!
   */
  compressToWebP(
    file: File | Blob,
    photoId: string,
    options?: {
      quality?: number; // 0.1 to 1.0 (default: 0.82)
      maxWidth?: number; // default: 1920
      maxHeight?: number; // default: 1280
    }
  ): Promise<WebPConversionResult>;

  /**
   * Formats byte values into readable strings (e.g. 15.4 MB, 142 KB)
   */
  formatBytes(bytes: number): string;
}
