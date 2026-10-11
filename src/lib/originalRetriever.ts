import type { SupabaseClient } from '@supabase/supabase-js';

export interface SelectedPhotoRecord {
  photoId: string;
  galleryId: string;
  originalFilename: string;
  originalRelativePath: string;
  sortOrder: number;
}

export interface GallerySelectionStatus {
  galleryId: string;
  galleryName: string;
  selectionLimit: number;
  totalPhotos: number;
  status: string;
  selectionsCount: number;
  isComplete: boolean;
}

export interface FileCopyResult {
  photoId: string;
  filename: string;
  relativePath: string;
  sizeBytes: number;
  sourceHash?: string;
  destHash?: string;
  hashesMatch: boolean;
  status: 'copied' | 'skipped' | 'failed';
  error?: string;
}

export interface RetrievalProgress {
  total: number;
  processed: number;
  copied: number;
  skipped: number;
  failed: number;
  currentFilename?: string;
  percentage: number;
}

export type ConflictStrategy = 'skip' | 'replace' | 'cancel';

/**
 * Calculates SHA-256 hex string using browser Web Crypto API
 */
export async function calculateBufferSha256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Fetches gallery status and count of customer selections from Supabase
 */
export async function fetchGallerySelectionStatus(
  supabase: SupabaseClient,
  galleryId: string
): Promise<GallerySelectionStatus> {
  const { data: gallery, error: gErr } = await supabase
    .from('galleries')
    .select('id, name, selection_limit, total_photos, status')
    .eq('id', galleryId)
    .single();

  if (gErr || !gallery) {
    throw new Error(`Failed to load gallery details: ${gErr?.message || 'Gallery not found'}`);
  }

  const { data: selections, error: sErr } = await supabase
    .from('selections')
    .select('id')
    .eq('gallery_id', galleryId);

  if (sErr) {
    throw new Error(`Failed to check selections count: ${sErr.message}`);
  }

  const selectionsCount = selections?.length || 0;
  const isComplete = selectionsCount === gallery.selection_limit;

  return {
    galleryId: gallery.id,
    galleryName: gallery.name,
    selectionLimit: gallery.selection_limit,
    totalPhotos: gallery.total_photos,
    status: gallery.status,
    selectionsCount,
    isComplete,
  };
}

/**
 * Fetches selected photo records with original_relative_path and original_filename
 */
export async function fetchSelectedPhotos(
  supabase: SupabaseClient,
  galleryId: string
): Promise<SelectedPhotoRecord[]> {
  // 1. Fetch selections rows
  const { data: selectionRows, error: sErr } = await supabase
    .from('selections')
    .select('photo_id')
    .eq('gallery_id', galleryId);

  if (sErr || !selectionRows) {
    throw new Error(`Failed to load selections: ${sErr?.message}`);
  }

  if (selectionRows.length === 0) {
    return [];
  }

  const photoIds = selectionRows.map((s) => s.photo_id);

  // 2. Fetch corresponding photos rows
  const { data: photoRows, error: pErr } = await supabase
    .from('photos')
    .select('id, gallery_id, original_filename, original_relative_path, sort_order')
    .in('id', photoIds);

  if (pErr || !photoRows) {
    throw new Error(`Failed to load photo records: ${pErr?.message}`);
  }

  return photoRows.map((p) => ({
    photoId: p.id,
    galleryId: p.gallery_id,
    originalFilename: p.original_filename,
    originalRelativePath: p.original_relative_path,
    sortOrder: p.sort_order,
  }));
}

export interface SourceFolderIndex {
  rootDirName: string;
  filesByPath: Map<string, { handle: any; relativePath: string; pathParts: string[] }>;
  allPaths: string[];
}

/**
 * Builds a fast relative-path index of the source directory handle
 */
export async function indexSourceDirectory(sourceDirHandle: any): Promise<SourceFolderIndex> {
  const rootDirName = sourceDirHandle.name;
  const filesByPath = new Map<string, { handle: any; relativePath: string; pathParts: string[] }>();
  const allPaths: string[] = [];

  async function scan(currentDir: any, currentParts: string[]) {
    for await (const entry of currentDir.values()) {
      if (entry.kind === 'file') {
        const fullParts = [...currentParts, entry.name];
        const pathFromRoot = fullParts.join('/');
        const pathWithDirName = `${rootDirName}/${pathFromRoot}`;

        const entryInfo = {
          handle: entry,
          relativePath: pathFromRoot,
          pathParts: currentParts,
        };

        // Index both:
        // 1. With directory name prefix (e.g. "gallery/photo1.png")
        // 2. Without directory name prefix (e.g. "photo1.png")
        filesByPath.set(pathWithDirName.toLowerCase(), entryInfo);
        filesByPath.set(pathFromRoot.toLowerCase(), entryInfo);
        allPaths.push(pathWithDirName);
      } else if (entry.kind === 'directory') {
        await scan(entry, [...currentParts, entry.name]);
      }
    }
  }

  await scan(sourceDirHandle, []);

  return {
    rootDirName,
    filesByPath,
    allPaths,
  };
}

/**
 * Locates the source file handle matching the database original_relative_path
 */
export function findSourceFileInIndex(
  index: SourceFolderIndex,
  originalRelativePath: string
): { handle: any; pathParts: string[] } | null {
  const normalized = originalRelativePath.replace(/\\/g, '/').toLowerCase();

  // Try direct match
  let found = index.filesByPath.get(normalized);
  if (found) return found;

  // Try stripped root folder prefix
  if (normalized.startsWith(index.rootDirName.toLowerCase() + '/')) {
    const stripped = normalized.slice(index.rootDirName.length + 1);
    found = index.filesByPath.get(stripped);
    if (found) return found;
  }

  // Try adding root folder prefix
  const withPrefix = `${index.rootDirName.toLowerCase()}/${normalized}`;
  found = index.filesByPath.get(withPrefix);
  if (found) return found;

  return null;
}

/**
 * Resolves or creates nested directory handle inside output folder
 */
export async function getOrCreateSubdirectory(
  baseHandle: any,
  subdirs: string[]
): Promise<any> {
  let curr = baseHandle;
  for (const dirName of subdirs) {
    if (!dirName || dirName === '.' || dirName === '..') continue;
    curr = await curr.getDirectoryHandle(dirName, { create: true });
  }
  return curr;
}

/**
 * Copies ONLY the selected original files from source directory handle to output folder
 */
export async function copySelectedOriginalFiles(options: {
  sourceDirHandle: any;
  destParentDirHandle: any;
  galleryName: string;
  selectedPhotos: SelectedPhotoRecord[];
  conflictStrategy?: ConflictStrategy;
  onProgress?: (progress: RetrievalProgress) => void;
}): Promise<{
  results: FileCopyResult[];
  copiedCount: number;
  skippedCount: number;
  failedCount: number;
  outputDirName: string;
}> {
  const {
    sourceDirHandle,
    destParentDirHandle,
    galleryName,
    selectedPhotos,
    conflictStrategy = 'skip',
    onProgress,
  } = options;

  // 1. Determine Output Directory:
  // Desired name: "Selected {Gallery Name}"
  const desiredOutputName = `Selected ${galleryName}`;
  let outputDirHandle: any;

  // Check if destination handle is already named "Selected {Gallery Name}"
  if (destParentDirHandle.name.toLowerCase() === desiredOutputName.toLowerCase()) {
    outputDirHandle = destParentDirHandle;
  } else {
    // Check safety: output directory must NOT be the source folder itself
    if (
      sourceDirHandle.name &&
      destParentDirHandle.name &&
      sourceDirHandle.name === destParentDirHandle.name
    ) {
      throw new Error(
        'Output directory cannot be inside the original source folder. Please select a separate destination.'
      );
    }
    // Create/reuse "Selected {Gallery Name}" in the chosen destination parent
    outputDirHandle = await destParentDirHandle.getDirectoryHandle(desiredOutputName, {
      create: true,
    });
  }

  // 2. Index Source Directory
  const sourceIndex = await indexSourceDirectory(sourceDirHandle);

  const results: FileCopyResult[] = [];
  let copiedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  const total = selectedPhotos.length;

  for (let i = 0; i < total; i++) {
    const photo = selectedPhotos[i];

    if (onProgress) {
      onProgress({
        total,
        processed: i,
        copied: copiedCount,
        skipped: skippedCount,
        failed: failedCount,
        currentFilename: photo.originalFilename,
        percentage: Math.round((i / total) * 100),
      });
    }

    try {
      // 3. Locate source file using original_relative_path
      const foundSource = findSourceFileInIndex(sourceIndex, photo.originalRelativePath);

      if (!foundSource) {
        throw new Error(
          `Original file not found in source folder: ${photo.originalRelativePath}`
        );
      }

      const sourceFile: File = await foundSource.handle.getFile();
      const sourceBuffer = await sourceFile.arrayBuffer();
      const sourceHash = await calculateBufferSha256(sourceBuffer);

      // 4. Resolve subfolders for output file
      // Preserve subfolder structure relative to source
      const targetDirHandle =
        foundSource.pathParts.length > 0
          ? await getOrCreateSubdirectory(outputDirHandle, foundSource.pathParts)
          : outputDirHandle;

      // 5. Existing file safety check
      let exists = false;
      try {
        await targetDirHandle.getFileHandle(photo.originalFilename, { create: false });
        exists = true;
      } catch {
        exists = false;
      }

      if (exists) {
        if (conflictStrategy === 'skip') {
          skippedCount++;
          results.push({
            photoId: photo.photoId,
            filename: photo.originalFilename,
            relativePath: photo.originalRelativePath,
            sizeBytes: sourceFile.size,
            sourceHash,
            hashesMatch: true,
            status: 'skipped',
          });
          continue;
        } else if (conflictStrategy === 'cancel') {
          throw new Error(`File already exists in destination: ${photo.originalFilename}`);
        }
        // If 'replace', proceed to overwrite
      }

      // 6. Write ORIGINAL bytes unchanged (zero compression, zero conversion, zero resizing)
      const targetFileHandle = await targetDirHandle.getFileHandle(photo.originalFilename, {
        create: true,
      });
      const writable = await targetFileHandle.createWritable();
      await writable.write(sourceBuffer);
      await writable.close();

      // 7. Verify byte size and SHA-256
      const writtenFile: File = await targetFileHandle.getFile();
      if (writtenFile.size !== sourceFile.size) {
        throw new Error(
          `Byte size mismatch: source ${sourceFile.size} vs written ${writtenFile.size}`
        );
      }

      const writtenBuffer = await writtenFile.arrayBuffer();
      const destHash = await calculateBufferSha256(writtenBuffer);

      if (sourceHash !== destHash) {
        throw new Error(
          `SHA-256 hash mismatch! Source: ${sourceHash} vs Dest: ${destHash}`
        );
      }

      copiedCount++;
      results.push({
        photoId: photo.photoId,
        filename: photo.originalFilename,
        relativePath: photo.originalRelativePath,
        sizeBytes: sourceFile.size,
        sourceHash,
        destHash,
        hashesMatch: true,
        status: 'copied',
      });
    } catch (err: any) {
      console.error(`Error copying photo ${photo.originalFilename}:`, err);
      failedCount++;
      results.push({
        photoId: photo.photoId,
        filename: photo.originalFilename,
        relativePath: photo.originalRelativePath,
        sizeBytes: 0,
        hashesMatch: false,
        status: 'failed',
        error: err.message || 'Unknown copy error',
      });
    }
  }

  if (onProgress) {
    onProgress({
      total,
      processed: total,
      copied: copiedCount,
      skipped: skippedCount,
      failed: failedCount,
      currentFilename: undefined,
      percentage: 100,
    });
  }

  return {
    results,
    copiedCount,
    skippedCount,
    failedCount,
    outputDirName: desiredOutputName,
  };
}
