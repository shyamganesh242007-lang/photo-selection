import type { SupabaseClient } from '@supabase/supabase-js';
import type { FileCopyResult } from './originalRetriever';
import {
  saveRecentEventToStorage,
  updateRecentEventStatusInStorage,
  getRecentEventsFromStorage,
  removeRecentEventFromStorage,
} from './recentEventsStorage';

export interface RetrievalVerificationSummary {
  hasRetrieved: boolean;
  totalSelected: number;
  copiedCount: number;
  skippedCount: number;
  failedCount: number;
  allHashesMatch: boolean;
  results: FileCopyResult[];
}

export interface CanCompleteCheckResult {
  canComplete: boolean;
  isAlreadyCompleted: boolean;
  reason: string;
}

export interface CompletionResult {
  success: boolean;
  galleryId: string;
  status: string;
  deletedPreviewsCount: number;
  error?: string;
}

/**
 * Validates all completion conditions before allowing gallery completion.
 * Conditions:
 * 1. Gallery is not already completed.
 * 2. Customer selection is complete: COUNT(selections) === selection_limit.
 * 3. Photographer-side retrieval has completed successfully.
 * 4. Every selected original file copied has passed SHA-256 verification.
 * 5. No selected file failed, was skipped, or remains unverified.
 */
export function canCompleteGallery(
  galleryStatus: string,
  selectionsCount: number,
  selectionLimit: number,
  retrievalSummary?: RetrievalVerificationSummary | null
): CanCompleteCheckResult {
  if (galleryStatus === 'completed') {
    return {
      canComplete: false,
      isAlreadyCompleted: true,
      reason: 'Gallery is already completed.',
    };
  }

  if (selectionsCount !== selectionLimit) {
    return {
      canComplete: false,
      isAlreadyCompleted: false,
      reason: `Customer selection incomplete (${selectionsCount} / ${selectionLimit} selected).`,
    };
  }

  if (!retrievalSummary || !retrievalSummary.hasRetrieved) {
    return {
      canComplete: false,
      isAlreadyCompleted: false,
      reason: 'Photographer has not yet retrieved and verified original files.',
    };
  }

  if (retrievalSummary.copiedCount !== selectionLimit) {
    return {
      canComplete: false,
      isAlreadyCompleted: false,
      reason: `Only ${retrievalSummary.copiedCount} of ${selectionLimit} selected originals were copied.`,
    };
  }

  if (retrievalSummary.failedCount > 0) {
    return {
      canComplete: false,
      isAlreadyCompleted: false,
      reason: `${retrievalSummary.failedCount} file(s) failed during retrieval.`,
    };
  }

  if (retrievalSummary.skippedCount > 0) {
    return {
      canComplete: false,
      isAlreadyCompleted: false,
      reason: `${retrievalSummary.skippedCount} file(s) were skipped and remain unverified.`,
    };
  }

  if (!retrievalSummary.allHashesMatch) {
    return {
      canComplete: false,
      isAlreadyCompleted: false,
      reason: 'SHA-256 hash verification failed on one or more copied originals.',
    };
  }

  return {
    canComplete: true,
    isAlreadyCompleted: false,
    reason: 'Selected originals verified. Gallery is ready to complete.',
  };
}

/**
 * Deletes WebP preview objects belonging ONLY to this gallery from 'photo-previews',
 * physically DELETES matching rows from `selections` and `photos`,
 * and KEEPS the `galleries` row for lightweight history.
 *
 * Never uses `UPDATE photos SET webp_storage_path = NULL` as cleanup.
 */
export async function cleanupGalleryPreviews(
  supabase: SupabaseClient,
  galleryId: string
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  // Step A: Verify gallery exists and is in completed, submitted, or archived state
  const { data: gallery, error: gErr } = await supabase
    .from('galleries')
    .select('id, name, status')
    .eq('id', galleryId)
    .single();

  if (gErr || !gallery) {
    throw new Error(`Failed to find gallery for cleanup: ${gErr?.message || 'Gallery not found'}`);
  }

  if (gallery.status !== 'completed' && gallery.status !== 'submitted' && gallery.status !== 'archived') {
    throw new Error(
      `Safety violation: Cannot clean up previews for gallery in "${gallery.status}" state. Only completed or submitted galleries can be cleaned up.`
    );
  }

  // Safety Guard: Never cleanup the protected test gallery
  if (galleryId === 'e47c936b-d91a-470a-942d-deee2fa788f9') {
    throw new Error('Protected test gallery cannot be cleaned up.');
  }

  // Step B: Identify all WebP storage paths for this gallery
  const { data: photos, error: pErr } = await supabase
    .from('photos')
    .select('id, webp_storage_path')
    .eq('gallery_id', galleryId);

  if (pErr) {
    console.warn(`Querying photos for storage paths warning: ${pErr.message}`);
  }

  const pathsToDelete = (photos || [])
    .map((p) => p.webp_storage_path)
    .filter((p): p is string => Boolean(p));

  // Strict safety check: Ensure EVERY path belongs strictly to this gallery folder
  for (const path of pathsToDelete) {
    if (!path.startsWith(`${galleryId}/`)) {
      throw new Error(
        `Safety violation: Storage path "${path}" does not belong to gallery "${galleryId}". Aborting deletion.`
      );
    }
  }

  // Also query storage list to catch any orphaned previews in the gallery folder
  const { data: existingStorageFiles, error: listErr } = await supabase.storage
    .from('photo-previews')
    .list(galleryId);

  if (listErr) {
    console.warn(`Storage list warning for ${galleryId}:`, listErr.message);
  }

  const folderPaths = (existingStorageFiles || []).map((f) => `${galleryId}/${f.name}`);
  const allUniquePaths = Array.from(new Set([...pathsToDelete, ...folderPaths]));

  // Step C: Delete Storage objects (if any exist)
  let totalDeleted = 0;
  if (allUniquePaths.length > 0) {
    const BATCH_SIZE = 100;
    for (let i = 0; i < allUniquePaths.length; i += BATCH_SIZE) {
      const batch = allUniquePaths.slice(i, i + BATCH_SIZE);
      const { error: removeErr } = await supabase.storage
        .from('photo-previews')
        .remove(batch);

      if (removeErr) {
        throw new Error(`Storage deletion failed: ${removeErr.message}`);
      }
      totalDeleted += batch.length;
    }
  }

  // Step D: Verify storage cleanup result - ensure 0 files remain in storage folder
  const { data: remainingFiles, error: checkListErr } = await supabase.storage
    .from('photo-previews')
    .list(galleryId);

  if (!checkListErr && remainingFiles && remainingFiles.length > 0) {
    try {
      await supabase
        .from('galleries')
        .update({ cloud_cleanup_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', galleryId);
    } catch {
      // ignore
    }
    throw new Error(
      `Cleanup incomplete: ${remainingFiles.length} file(s) remain in photo-previews/${galleryId}/. Database rows preserved.`
    );
  }

  // Step E: Delete selections and photos for the gallery
  // Only executed after Storage cleanup safely succeeded.
  let dbCleaned = false;

  // Step E 1: Atomic server-side RPC (SECURITY DEFINER)
  try {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('cleanup_gallery_database', {
      p_gallery_id: galleryId,
    });
    if (!rpcErr && rpcRes && rpcRes.success) {
      dbCleaned = true;
    }
  } catch (err) {
    console.warn('RPC cleanup_gallery_database fallback:', err);
  }

  // Step E 2: Direct table deletes in strict FK order if RPC not available
  if (!dbCleaned) {
    // Delete selections first (child of photos & galleries)
    const { error: selErr } = await supabase.from('selections').delete().eq('gallery_id', galleryId);
    if (selErr) {
      console.warn(`Direct selections delete error for ${galleryId}:`, selErr.message);
    }

    // Delete photos next (child of galleries)
    const { error: photoErr } = await supabase.from('photos').delete().eq('gallery_id', galleryId);
    if (photoErr) {
      console.warn(`Direct photos delete error for ${galleryId}:`, photoErr.message);
    }
  }

  // Step F: STRICT DATABASE VERIFICATION - Ensure complete rows are physically deleted!
  // Never consider `photos.webp_storage_path = NULL` as cleanup!
  const { count: remainingSelections } = await supabase
    .from('selections')
    .select('id', { count: 'exact', head: true })
    .eq('gallery_id', galleryId);

  const { count: remainingPhotos } = await supabase
    .from('photos')
    .select('id', { count: 'exact', head: true })
    .eq('gallery_id', galleryId);

  if ((remainingSelections ?? 0) > 0 || (remainingPhotos ?? 0) > 0) {
    try {
      await supabase
        .from('galleries')
        .update({ cloud_cleanup_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', galleryId);
    } catch {}
    throw new Error(
      `Database cleanup failed: ${remainingPhotos ?? 0} photos and ${remainingSelections ?? 0} selections rows still exist in database.`
    );
  }

  // Step G: KEEP galleries row for lightweight history! Update status to completed and cloud cleanup info
  const nowIso = new Date().toISOString();
  try {
    await supabase
      .from('galleries')
      .update({
        status: 'completed',
        cloud_cleanup_status: 'deleted',
        cloud_cleanup_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', galleryId);
  } catch {
    try {
      await supabase
        .from('galleries')
        .update({
          status: 'completed',
          updated_at: nowIso,
        })
        .eq('id', galleryId);
    } catch (e) {
      console.warn(`Could not update gallery status for ${galleryId}:`, e);
    }
  }

  // Update Recent Events in localStorage
  updateRecentEventStatusInStorage(galleryId, 'deleted');

  return { success: true, deletedCount: totalDeleted };
}

/**
 * ISSUE 2: Recent Events [X] Action
 * Completely deletes all Storage previews, selections rows, photos rows,
 * AND the gallery database row from `public.galleries`.
 *
 * Local original files are NEVER touched.
 */
export async function deleteGalleryCompletely(
  supabase: SupabaseClient,
  galleryId: string
): Promise<{ success: boolean; error?: string }> {
  // Safety Guard: Never delete the protected test gallery
  if (galleryId === 'e47c936b-d91a-470a-942d-deee2fa788f9') {
    throw new Error('Protected test gallery cannot be deleted.');
  }

  // 1. Delete any remaining Storage preview objects
  const { data: storageFiles, error: listErr } = await supabase.storage
    .from('photo-previews')
    .list(galleryId);

  if (listErr) {
    console.warn(`Storage list warning before complete deletion for ${galleryId}:`, listErr.message);
  }

  if (storageFiles && storageFiles.length > 0) {
    const pathsToDelete = storageFiles.map((f) => `${galleryId}/${f.name}`);
    const BATCH_SIZE = 100;
    for (let i = 0; i < pathsToDelete.length; i += BATCH_SIZE) {
      const batch = pathsToDelete.slice(i, i + BATCH_SIZE);
      const { error: removeErr } = await supabase.storage
        .from('photo-previews')
        .remove(batch);

      if (removeErr) {
        throw new Error(`Failed to delete storage previews: ${removeErr.message}`);
      }
    }
  }

  // Verify storage is completely empty
  const { data: remainingStorage } = await supabase.storage
    .from('photo-previews')
    .list(galleryId);

  if (remainingStorage && remainingStorage.length > 0) {
    throw new Error(`Failed to delete all preview files from storage (${remainingStorage.length} remaining).`);
  }

  // 2. Database deletion (selections, photos, galleries)
  let dbDeleted = false;

  // Try atomic server-side RPC first
  try {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('delete_gallery_completely', {
      p_gallery_id: galleryId,
    });
    if (!rpcErr && rpcRes && rpcRes.success) {
      dbDeleted = true;
    }
  } catch (err) {
    console.warn('RPC delete_gallery_completely fallback:', err);
  }

  // Direct table deletion fallback in strict foreign key order
  if (!dbDeleted) {
    // 1) Delete selections
    const { error: sErr } = await supabase.from('selections').delete().eq('gallery_id', galleryId);
    if (sErr) console.warn(`Delete selections warning for ${galleryId}:`, sErr.message);

    // 2) Delete photos
    const { error: pErr } = await supabase.from('photos').delete().eq('gallery_id', galleryId);
    if (pErr) console.warn(`Delete photos warning for ${galleryId}:`, pErr.message);

    // 3) Delete galleries row
    const { error: gErr } = await supabase.from('galleries').delete().eq('id', galleryId);
    if (gErr) {
      throw new Error(`Failed to delete gallery record: ${gErr.message}`);
    }
  }

  // STRICT VERIFICATION: Verify the galleries row is physically deleted from Supabase!
  const { data: checkG } = await supabase
    .from('galleries')
    .select('id')
    .eq('id', galleryId)
    .maybeSingle();

  if (checkG) {
    throw new Error('Gallery record still exists in Supabase database after deletion attempt.');
  }

  // 3. Remove event from localStorage Recent Events
  removeRecentEventFromStorage(galleryId);

  return { success: true };
}

/**
 * Checks whether cloud WebP previews still exist for a gallery in Supabase Storage
 * or photos rows still remain in the database.
 */
export async function checkGalleryPreviewsExist(
  supabase: SupabaseClient,
  galleryId: string
): Promise<boolean> {
  try {
    // 1. Check storage bucket folder directly
    const { data: storageFiles } = await supabase.storage
      .from('photo-previews')
      .list(galleryId, { limit: 1 });

    if (storageFiles && storageFiles.length > 0) {
      return true;
    }

    // 2. Check photos table for remaining photo rows
    const { count, error } = await supabase
      .from('photos')
      .select('id', { count: 'exact', head: true })
      .eq('gallery_id', galleryId);

    if (!error && count !== null && count > 0) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Server-side / database-driven automatic cleanup for galleries completed >= 24 hours ago.
 * Tolerates already-deleted files, only deletes the specific gallery's WebPs, and is retry-safe.
 */
export async function cleanupExpiredGalleries(
  supabase: SupabaseClient
): Promise<{ cleanedGalleryIds: string[]; totalFilesDeleted: number }> {
  try {
    const cleanedIds: string[] = [];
    let totalDeleted = 0;

    // 1. Check local storage scheduled events that are overdue (24 hours elapsed)
    const localEvents = getRecentEventsFromStorage();
    const now = Date.now();
    for (const le of localEvents) {
      if (le.cleanupStatus === 'scheduled' && le.cleanupAfter && now >= new Date(le.cleanupAfter).getTime()) {
        if (le.galleryId === 'e47c936b-d91a-470a-942d-deee2fa788f9') continue;
        try {
          const res = await cleanupGalleryPreviews(supabase, le.galleryId);
          if (res.success) {
            cleanedIds.push(le.galleryId);
            totalDeleted += res.deletedCount;
            updateRecentEventStatusInStorage(le.galleryId, 'deleted');
          }
        } catch (err) {
          console.warn(`Overdue local event cleanup failed for ${le.galleryId}:`, err);
        }
      }
    }

    // 2. Also check remote Supabase for completed galleries completed >= 24h ago
    const cutoffTime = new Date(Date.now() - TWENTY_FOUR_HOURS_MS).toISOString();
    const { data: expiredGalleries, error } = await supabase
      .from('galleries')
      .select('id, name, updated_at')
      .eq('status', 'completed')
      .lt('updated_at', cutoffTime);

    if (!error && expiredGalleries) {
      for (const g of expiredGalleries) {
        if (g.id === 'e47c936b-d91a-470a-942d-deee2fa788f9') continue;
        if (cleanedIds.includes(g.id)) continue;
        const hasPreviews = await checkGalleryPreviewsExist(supabase, g.id);
        if (hasPreviews) {
          try {
            const res = await cleanupGalleryPreviews(supabase, g.id);
            if (res.success && res.deletedCount > 0) {
              cleanedIds.push(g.id);
              totalDeleted += res.deletedCount;
              updateRecentEventStatusInStorage(g.id, 'deleted');
            }
          } catch (err) {
            console.warn(`Automatic cleanup warning for gallery ${g.id} (${g.name}):`, err);
          }
        }
      }
    }

    return { cleanedGalleryIds: cleanedIds, totalFilesDeleted: totalDeleted };
  } catch (err) {
    console.warn('Error during automatic expired galleries cleanup:', err);
    return { cleanedGalleryIds: [], totalFilesDeleted: 0 };
  }
}

/**
 * ISSUE 3: Completes a gallery AFTER local copy & SHA-256 verification succeeds:
 *
 * Workflow:
 * Customer selects exact photos
 *         ↓
 * Customer submits
 *         ↓
 * Photographer copies selected ORIGINAL files locally
 *         ↓
 * SHA-256/hash verification succeeds
 *         ↓
 * Cloud cleanup happens immediately (Storage WebPs + selections + photos deleted; galleries history kept)
 *         ↓
 * Gallery becomes completed/history state
 *
 * If copy or verification fails, this function is NOT called and cloud data remains intact.
 */
export async function completeGallery(
  supabase: SupabaseClient,
  galleryId: string,
  retrievalSummary: RetrievalVerificationSummary
): Promise<CompletionResult> {
  // 1. Re-check gallery from Supabase
  const { data: gallery, error: gErr } = await supabase
    .from('galleries')
    .select('id, name, selection_limit, status')
    .eq('id', galleryId)
    .single();

  if (gErr || !gallery) {
    throw new Error(`Failed to reload gallery for completion: ${gErr?.message || 'Not found'}`);
  }

  // 2. Re-check selections count
  const { data: selections, error: sErr } = await supabase
    .from('selections')
    .select('id')
    .eq('gallery_id', galleryId);

  if (sErr || !selections) {
    throw new Error(`Failed to check selections count: ${sErr?.message}`);
  }

  const check = canCompleteGallery(
    gallery.status,
    selections.length,
    gallery.selection_limit,
    retrievalSummary
  );

  if (!check.canComplete) {
    throw new Error(`Cannot complete gallery: ${check.reason}`);
  }

  // 3. Mark gallery as 'completed'
  const nowIso = new Date().toISOString();
  const res = await supabase
    .from('galleries')
    .update({
      status: 'completed',
      cloud_cleanup_status: 'scheduled',
      cloud_cleanup_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', galleryId);

  if (res.error) {
    await supabase
      .from('galleries')
      .update({ status: 'completed', updated_at: nowIso })
      .eq('id', galleryId);
  }

  // 4. ISSUE 3: Execute immediate cloud cleanup!
  // Deletes all Storage WebP previews + selections rows + photos rows,
  // while keeping the galleries row as lightweight event history.
  const cleanupRes = await cleanupGalleryPreviews(supabase, galleryId);

  if (!cleanupRes.success) {
    throw new Error(cleanupRes.error || 'Failed to clean up cloud previews and photo records.');
  }

  // 5. Save minimal event history to localStorage so Recent Events survives cloud DB deletion
  saveRecentEventToStorage({
    galleryId,
    galleryName: gallery.name,
    completedAt: nowIso,
    cleanupStatus: 'deleted',
    cleanupAfter: nowIso,
  });

  return {
    success: true,
    galleryId,
    status: 'completed',
    deletedPreviewsCount: cleanupRes.deletedCount,
  };
}

