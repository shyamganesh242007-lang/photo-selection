import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Plus,
  FolderOpen,
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  Share2,
  UploadCloud,
  FileCheck2,
  FolderCheck,
  FolderOutput,
  Info,
  Clock,
  X,
  Trash2,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  processPreviewQueue,
  type PreviewGenerationProgress,
} from '../lib/previewGenerator';
import {
  processUploadQueue,
  type UploadProgress,
  type UploadQueueItem,
} from '../lib/storageUploader';
import {
  copyCustomerGalleryLink,
  shareCustomerGalleryLink,
  getCustomerGalleryUrl,
  isWebShareSupported,
} from '../lib/gallerySharing';
import {
  fetchSelectedPhotos,
  copySelectedOriginalFiles,
  type SelectedPhotoRecord,
  type RetrievalProgress,
  type FileCopyResult,
} from '../lib/originalRetriever';
import {
  completeGallery,
  cleanupGalleryPreviews,
  deleteGalleryCompletely,
  checkGalleryPreviewsExist,
  cleanupExpiredGalleries,
  type RetrievalVerificationSummary,
} from '../lib/galleryCompletion';
import {
  storeSourceDirectoryHandle,
  getStoredSourceDirectoryHandle,
  verifyHandlePermission,
} from '../lib/sourceHandleStorage';
import {
  getRecentEventsFromStorage,
  updateRecentEventStatusInStorage,
} from '../lib/recentEventsStorage';
import { type DetectedPhoto, SUPPORTED_EXTENSIONS } from '../types';

export type WorkflowStep =
  | 'step1_folder'
  | 'step2_configure'
  | 'step3_processing'
  | 'step4_ready'
  | 'step5_received'
  | 'step6_copying'
  | 'step7_completed';

interface ActiveGalleryState {
  id: string;
  name: string;
  totalPhotos: number;
  selectionLimit: number;
  status: string;
  selectionsCount?: number;
}

interface RecentGallerySummary {
  id: string;
  name: string;
  totalPhotos: number;
  selectionLimit: number;
  status: string;
  selectionsCount: number;
  updatedAt: string;
  hasCloudPreviews: boolean;
  cloudCleanupStatus: 'none' | 'scheduled' | 'deleted' | 'failed';
  cloudCleanupAt?: string | null;
}

function formatEventDate(dateString?: string): string {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateString;
  }
}

interface PhotographerWorkflowProps {
  initialGalleryId?: string | null;
  onOpenHistory?: () => void;
  onClearInitialGalleryId?: () => void;
}

export function PhotographerWorkflow({
  initialGalleryId,
  onClearInitialGalleryId,
}: PhotographerWorkflowProps = {}) {
  // Main Step State
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('step1_folder');

  // Step 1: Local Folder Detection
  const [folderName, setFolderName] = useState<string | null>(null);
  const [detectedPhotos, setDetectedPhotos] = useState<DetectedPhoto[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [sourceDirHandle, setSourceDirHandle] = useState<any>(null);

  // Step 2: Configuration
  const [selectionLimit, setSelectionLimit] = useState<string>('');

  // Step 3: WebP Preview Generation & Storage Upload Progress
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [previewProgress, setPreviewProgress] = useState<PreviewGenerationProgress>({
    processed: 0,
    total: 0,
    successCount: 0,
    failedCount: 0,
  });
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    uploaded: 0,
    total: 0,
    failed: 0,
  });

  // Step 4: Active Gallery & Customer Link State
  const [gallery, setGallery] = useState<ActiveGalleryState | null>(null);
  const [selectionsCount, setSelectionsCount] = useState<number>(0);
  const [isCheckingSelections, setIsCheckingSelections] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Step 6: Copying Originals & Verification
  const [isCopying, setIsCopying] = useState<boolean>(false);
  const [copyProgress, setCopyProgress] = useState<RetrievalProgress>({
    total: 0,
    processed: 0,
    copied: 0,
    skipped: 0,
    failed: 0,
    percentage: 0,
  });
  const [copyResults, setCopyResults] = useState<FileCopyResult[]>([]);
  const [outputFolderName, setOutputFolderName] = useState<string>('');
  const [destParentHandle, setDestParentHandle] = useState<any>(null);
  const [destFolderAlreadyExists, setDestFolderAlreadyExists] = useState<boolean>(false);
  const [conflictStrategy, setConflictStrategy] = useState<'replace' | 'skip'>('replace');

  // Step 7: Completed State
  const [isCleaningUp, setIsCleaningUp] = useState<boolean>(false);
  const [completedSummary, setCompletedSummary] = useState<{
    copiedCount: number;
    verifiedCount: number;
    cleanedUpWebPs: number;
    outputFolderName: string;
  } | null>(null);

  // General Messages & Feedbacks
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentGalleries, setRecentGalleries] = useState<RecentGallerySummary[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState<boolean>(false);
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState<RecentGallerySummary | null>(null);
  const [isDeletingPreviews, setIsDeletingPreviews] = useState<boolean>(false);
  const [confirmRemoveEvent, setConfirmRemoveEvent] = useState<RecentGallerySummary | null>(null);
  const [isRemovingEvent, setIsRemovingEvent] = useState<boolean>(false);
  const [copiedRecentId, setCopiedRecentId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Recent Galleries for Step 1
  const loadRecentGalleries = useCallback(async () => {
    setIsLoadingRecent(true);
    try {
      // Reconcile automatic 24-hour cleanup for any completed galleries >= 24 hours old
      if (supabase) {
        try {
          await cleanupExpiredGalleries(supabase);
        } catch (cleanErr) {
          console.warn('Automatic 24-hour cleanup check warning:', cleanErr);
        }
      }

      // Read locally dismissed gallery IDs
      let dismissedIds = new Set<string>();
      try {
        const stored = JSON.parse(localStorage.getItem('dismissed_recent_events') || '[]');
        if (Array.isArray(stored)) {
          dismissedIds = new Set(stored);
        }
      } catch {}

      // 1. Read minimal event display history from localStorage (key: photo_selection_recent_events)
      const localEvents = getRecentEventsFromStorage();
      const items: RecentGallerySummary[] = [];

      // 2. Fetch galleries from Supabase (if online)
      if (supabase) {
        const { data: dbGalleries } = await supabase
          .from('galleries')
          .select('id, name, total_photos, selection_limit, status, updated_at, cloud_cleanup_status, cloud_cleanup_at')
          .in('status', ['submitted', 'active', 'completed'])
          .order('updated_at', { ascending: false })
          .limit(6);

        if (dbGalleries) {
          for (const g of dbGalleries) {
            if (dismissedIds.has(g.id)) continue;
            if (items.some((it) => it.id === g.id)) continue;

            if (g.status === 'completed') {
              const isCleaned = g.cloud_cleanup_status === 'deleted';
              let hasPreviews = !isCleaned;
              if (!isCleaned) {
                hasPreviews = await checkGalleryPreviewsExist(supabase, g.id);
              }
              const cleanupStatus = isCleaned || !hasPreviews ? 'deleted' : (g.cloud_cleanup_status || 'scheduled');

              items.push({
                id: g.id,
                name: g.name,
                totalPhotos: 0,
                selectionLimit: g.selection_limit,
                status: 'completed',
                selectionsCount: g.selection_limit,
                updatedAt: g.updated_at,
                hasCloudPreviews: hasPreviews,
                cloudCleanupStatus: cleanupStatus,
                cloudCleanupAt: g.cloud_cleanup_at || null,
              });
            } else {
              const { count: sCount } = await supabase
                .from('selections')
                .select('*', { count: 'exact', head: true })
                .eq('gallery_id', g.id);

              items.push({
                id: g.id,
                name: g.name,
                totalPhotos: g.total_photos,
                selectionLimit: g.selection_limit,
                status: g.status,
                selectionsCount: sCount || 0,
                updatedAt: g.updated_at,
                hasCloudPreviews: true,
                cloudCleanupStatus: 'none',
                cloudCleanupAt: null,
              });
            }
          }
        }
      }

      // 3. Merge local completed events (ensures display if offline or freshly completed)
      for (const le of localEvents) {
        if (dismissedIds.has(le.galleryId)) continue;
        if (items.some((it) => it.id === le.galleryId)) continue;

        items.push({
          id: le.galleryId,
          name: le.galleryName,
          totalPhotos: 0,
          selectionLimit: 0,
          status: 'completed',
          selectionsCount: 0,
          updatedAt: le.completedAt,
          hasCloudPreviews: le.cleanupStatus !== 'deleted',
          cloudCleanupStatus: le.cleanupStatus,
          cloudCleanupAt: le.cleanupAfter || null,
        });
      }

      setRecentGalleries(items.slice(0, 5));
    } catch (e) {
      console.warn('Failed to load recent galleries:', e);
    } finally {
      setIsLoadingRecent(false);
    }
  }, []);

  // Manual Delete Cloud Previews Handler
  const handleExecuteManualDelete = async (item: RecentGallerySummary) => {
    if (!supabase) return;
    setIsDeletingPreviews(true);
    setErrorMessage(null);
    try {
      const res = await cleanupGalleryPreviews(supabase, item.id);
      if (!res.success) {
        throw new Error(res.error || 'Failed to clean up previews');
      }
      updateRecentEventStatusInStorage(item.id, 'deleted');
      setRecentGalleries((prev) =>
        prev.map((g) =>
          g.id === item.id
            ? { ...g, hasCloudPreviews: false, cloudCleanupStatus: 'deleted', cloudCleanupAt: new Date().toISOString() }
            : g
        )
      );
      setConfirmDeleteEvent(null);
    } catch (err: any) {
      console.error('Error deleting cloud previews:', err);
      setRecentGalleries((prev) =>
        prev.map((g) => (g.id === item.id ? { ...g, cloudCleanupStatus: 'failed' } : g))
      );
      setErrorMessage(err.message || 'Failed to delete cloud previews.');
    } finally {
      setIsDeletingPreviews(false);
    }
  };

  // ISSUE 2: Remove Event from Recent Events List (X Action)
  // Deletes Storage WebPs + selections + photos + galleries database row.
  // Only after successful backend cleanup, removes the event from UI.
  // If cleanup fails, shows clear error and keeps event visible so photographer can retry.
  const handleExecuteRemoveRecent = async (item: RecentGallerySummary) => {
    if (!supabase) return;
    setIsRemovingEvent(true);
    setErrorMessage(null);
    try {
      const res = await deleteGalleryCompletely(supabase, item.id);
      if (!res.success) {
        throw new Error(res.error || 'Failed to delete gallery record and previews.');
      }

      // 1. Clean from dismissed list in localStorage if present
      try {
        const stored = JSON.parse(localStorage.getItem('dismissed_recent_events') || '[]');
        const updated = stored.filter((id: string) => id !== item.id);
        localStorage.setItem('dismissed_recent_events', JSON.stringify(updated));
      } catch {}

      // 2. Only after successful backend cleanup, remove event from UI state
      setRecentGalleries((prev) => prev.filter((g) => g.id !== item.id));
      setConfirmRemoveEvent(null);
    } catch (err: any) {
      console.error('Error removing recent event:', err);
      // Keep event visible so photographer can retry!
      setErrorMessage(err.message || 'Failed to delete event from database. Please retry.');
    } finally {
      setIsRemovingEvent(false);
    }
  };

  useEffect(() => {
    if (currentStep === 'step1_folder') {
      loadRecentGalleries();
    }
  }, [currentStep, loadRecentGalleries]);

  // Load a Gallery by ID directly into its lifecycle state
  const loadGalleryById = useCallback(async (galleryId: string) => {
    if (!supabase) return;
    setErrorMessage(null);
    try {
      const { data: g, error: gErr } = await supabase
        .from('galleries')
        .select('id, name, total_photos, selection_limit, status')
        .eq('id', galleryId)
        .single();

      if (gErr || !g) {
        throw new Error(gErr?.message || 'Gallery not found.');
      }

      const { count: sCount } = await supabase
        .from('selections')
        .select('*', { count: 'exact', head: true })
        .eq('gallery_id', g.id);

      const count = sCount || 0;
      setGallery({
        id: g.id,
        name: g.name,
        totalPhotos: g.total_photos,
        selectionLimit: g.selection_limit,
        status: g.status,
        selectionsCount: count,
      });
      setSelectionsCount(count);

      // Attempt restoring retained source directory handle from storage if not in memory
      if (!sourceDirHandle) {
        const storedHandle =
          (await getStoredSourceDirectoryHandle(g.id)) ||
          (await getStoredSourceDirectoryHandle(g.name));
        if (storedHandle) {
          setSourceDirHandle(storedHandle);
        }
      }

      // Route to correct step
      if (g.status === 'completed') {
        setCompletedSummary({
          copiedCount: g.selection_limit,
          verifiedCount: g.selection_limit,
          cleanedUpWebPs: 0,
          outputFolderName: `Selected ${g.name}`,
        });
        setCurrentStep('step7_completed');
      } else if (g.status === 'submitted' || count >= g.selection_limit) {
        setCurrentStep('step5_received');
      } else {
        setCurrentStep('step4_ready');
      }
    } catch (err: any) {
      console.error('Error loading gallery by id:', err);
      setErrorMessage(err.message || 'Failed to load gallery.');
    }
  }, []);

  // Handle Initial Gallery ID if provided from props (e.g., opened from History)
  useEffect(() => {
    if (initialGalleryId) {
      loadGalleryById(initialGalleryId);
      onClearInitialGalleryId?.();
    }
  }, [initialGalleryId, loadGalleryById, onClearInitialGalleryId]);

  // Ensure retained source directory handle is restored from cache/IndexedDB whenever gallery is active
  useEffect(() => {
    if (gallery && !sourceDirHandle) {
      let isSubscribed = true;
      (async () => {
        const storedHandle =
          (await getStoredSourceDirectoryHandle(gallery.id)) ||
          (await getStoredSourceDirectoryHandle(gallery.name));
        if (storedHandle && isSubscribed) {
          setSourceDirHandle(storedHandle);
        }
      })();
      return () => {
        isSubscribed = false;
      };
    }
  }, [gallery, sourceDirHandle]);

  // Periodic Polling for Customer Selections on Step 4
  useEffect(() => {
    if (currentStep !== 'step4_ready' || !gallery) return;

    let isMounted = true;
    const pollSelections = async () => {
      if (!supabase) return;
      try {
        const { count, error } = await supabase
          .from('selections')
          .select('*', { count: 'exact', head: true })
          .eq('gallery_id', gallery.id);

        if (error) return;

        const currentCount = count || 0;
        if (!isMounted) return;

        setSelectionsCount(currentCount);

        // Also check if gallery status changed to submitted
        const { data: gData } = await supabase
          .from('galleries')
          .select('status')
          .eq('id', gallery.id)
          .single();

        if (
          currentCount >= gallery.selectionLimit ||
          gData?.status === 'submitted'
        ) {
          setGallery((prev) =>
            prev ? { ...prev, status: gData?.status || 'submitted', selectionsCount: currentCount } : null
          );
          setCurrentStep('step5_received');
        }
      } catch (err) {
        console.warn('Error polling selections:', err);
      }
    };

    pollSelections();
    const interval = setInterval(pollSelections, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentStep, gallery]);

  // Manual Check Selections button
  const handleCheckSelectionsManual = async () => {
    if (!supabase || !gallery) return;
    setIsCheckingSelections(true);
    setErrorMessage(null);
    try {
      const { count, error } = await supabase
        .from('selections')
        .select('*', { count: 'exact', head: true })
        .eq('gallery_id', gallery.id);

      if (error) throw error;
      const currentCount = count || 0;
      setSelectionsCount(currentCount);

      const { data: gData } = await supabase
        .from('galleries')
        .select('status')
        .eq('id', gallery.id)
        .single();

      if (currentCount >= gallery.selectionLimit || gData?.status === 'submitted') {
        setGallery((prev) =>
          prev ? { ...prev, status: gData?.status || 'submitted', selectionsCount: currentCount } : null
        );
        setCurrentStep('step5_received');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to refresh selections.');
    } finally {
      setIsCheckingSelections(false);
    }
  };

  // Directory Scanner for File System Access API
  const scanDirectoryHandle = async (
    dirHandle: any,
    currentPath = ''
  ): Promise<DetectedPhoto[]> => {
    const results: DetectedPhoto[] = [];

    for await (const entry of dirHandle.values()) {
      const entryRelativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      if (entry.kind === 'file') {
        const ext = entry.name.split('.').pop()?.toLowerCase() || '';
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          results.push({
            filename: entry.name,
            relativePath: entryRelativePath,
            fileHandle: entry,
          });
        }
      } else if (entry.kind === 'directory') {
        try {
          const subResults = await scanDirectoryHandle(entry, entryRelativePath);
          results.push(...subResults);
        } catch (e) {
          console.warn('Subdirectory scan warning:', e);
        }
      }
    }

    results.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
    return results;
  };

  // STEP 1: Add Event Folder Click Handler
  const handleAddFolderClick = async () => {
    setErrorMessage(null);

    // 1. Native File System Access API
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
        setIsScanning(true);
        setSourceDirHandle(dirHandle);
        await storeSourceDirectoryHandle(dirHandle.name, dirHandle);

        const scanned = await scanDirectoryHandle(dirHandle, dirHandle.name);
        setIsScanning(false);

        if (scanned.length === 0) {
          setErrorMessage('No supported image files (JPG, PNG, WebP, HEIC, RAW, CR2, NEF, ARW, DNG, etc.) found in this folder.');
          return;
        }

        setFolderName(dirHandle.name);
        setDetectedPhotos(scanned);
        // Default suggested selection limit: 30% of photos or min 1
        const suggested = Math.min(300, Math.max(1, Math.round(scanned.length * 0.3)));
        setSelectionLimit(String(suggested));
        setCurrentStep('step2_configure');
        return;
      } catch (err: any) {
        setIsScanning(false);
        if (err.name === 'AbortError') return;
        console.warn('showDirectoryPicker error, falling back to input:', err);
      }
    }

    // 2. Fallback to HTML5 directory input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // Fallback HTML5 input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsScanning(true);
    setErrorMessage(null);

    const scanned: DetectedPhoto[] = [];
    const firstPath = files[0].webkitRelativePath || '';
    const detectedName = firstPath.split('/')[0] || 'Selected Event';

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        scanned.push({
          filename: file.name,
          relativePath: file.webkitRelativePath || `${detectedName}/${file.name}`,
          file: file,
        });
      }
    }

    scanned.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
    setIsScanning(false);

    if (scanned.length === 0) {
      setErrorMessage('No supported image files found in the selected folder.');
      return;
    }

    setFolderName(detectedName);
    setDetectedPhotos(scanned);
    const suggested = Math.min(300, Math.max(1, Math.round(scanned.length * 0.3)));
    setSelectionLimit(String(suggested));
    setCurrentStep('step2_configure');
  };

  // Helper to extract File object without modifying originals
  const getFileForDetectedPhoto = async (photo: DetectedPhoto): Promise<File | null> => {
    if (photo.file) return photo.file;
    if (photo.fileHandle && typeof photo.fileHandle.getFile === 'function') {
      try {
        return await photo.fileHandle.getFile();
      } catch (err) {
        console.warn(`Could not get File for ${photo.filename}:`, err);
        return null;
      }
    }
    return null;
  };

  // STEP 2 -> STEP 3 & 4: Generate Gallery
  const handleGenerateGallery = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const limitNumber = parseInt(selectionLimit.trim(), 10);
    if (isNaN(limitNumber) || limitNumber <= 0) {
      setErrorMessage('Selection count must be a positive number greater than 0.');
      return;
    }
    if (limitNumber > detectedPhotos.length) {
      setErrorMessage(`Selection count cannot exceed the total photos detected (${detectedPhotos.length}).`);
      return;
    }
    if (!folderName) {
      setErrorMessage('Please select a valid event folder first.');
      return;
    }
    if (!isSupabaseConfigured || !supabase) {
      setErrorMessage('Supabase is not configured.');
      return;
    }

    setCurrentStep('step3_processing');
    setIsGenerating(true);

    try {
      // 1. Create Gallery Record automatically in Supabase
      const { data: galleryRow, error: galleryError } = await supabase
        .from('galleries')
        .insert({
          name: folderName,
          selection_limit: limitNumber,
          total_photos: detectedPhotos.length,
          status: 'draft',
        })
        .select('id, name, selection_limit, total_photos, status')
        .single();

      if (galleryError || !galleryRow) {
        throw new Error(`Database error creating gallery: ${galleryError?.message || 'Unknown error'}`);
      }

      const galleryId = galleryRow.id;

      // Retain directory handle under galleryId and galleryName
      if (sourceDirHandle) {
        await storeSourceDirectoryHandle(galleryId, sourceDirHandle);
        await storeSourceDirectoryHandle(galleryRow.name, sourceDirHandle);
      }

      // 2. Insert Photo Metadata Rows in Batches of 250
      const photoRows = detectedPhotos.map((photo, index) => ({
        gallery_id: galleryId,
        original_filename: photo.filename,
        original_relative_path: photo.relativePath,
        sort_order: index,
        webp_storage_path: null,
      }));

      const BATCH_SIZE = 250;
      for (let i = 0; i < photoRows.length; i += BATCH_SIZE) {
        const batch = photoRows.slice(i, i + BATCH_SIZE);
        const { error: batchErr } = await supabase.from('photos').insert(batch);
        if (batchErr) {
          throw new Error(`Error saving photos to database: ${batchErr.message}`);
        }
      }

      // 3. Fetch Created Photo UUIDs for 1-to-1 WebP storage mapping
      const { data: savedPhotos, error: fetchErr } = await supabase
        .from('photos')
        .select('id, original_relative_path')
        .eq('gallery_id', galleryId)
        .order('sort_order', { ascending: true });

      if (fetchErr || !savedPhotos) {
        throw new Error(`Failed to retrieve photo records: ${fetchErr?.message}`);
      }

      const photoDbMap = new Map(savedPhotos.map((p) => [p.original_relative_path, p.id]));

      // 4. Local WebP Preview Generation
      setPreviewProgress({
        processed: 0,
        total: detectedPhotos.length,
        successCount: 0,
        failedCount: 0,
      });

      const queueItems = detectedPhotos.map((photo) => ({
        photo,
        getFile: () => getFileForDetectedPhoto(photo),
      }));

      const previewResults = await processPreviewQueue(
        queueItems,
        (prog) => setPreviewProgress({ ...prog }),
        2
      );

      setIsGenerating(false);

      // 5. Upload ONLY WebP Previews to Private Supabase Storage
      setIsUploading(true);
      const successfulWebPs = previewResults.filter((p) => p.success && p.blob);
      setUploadProgress({
        uploaded: 0,
        total: successfulWebPs.length,
        failed: 0,
      });

      const uploadItems: UploadQueueItem[] = [];
      for (let i = 0; i < previewResults.length; i++) {
        const item = previewResults[i];
        if (item.success && item.blob) {
          const photoId = photoDbMap.get(item.relativePath) || savedPhotos[i]?.id;
          if (photoId) {
            uploadItems.push({
              photoId,
              filename: item.filename,
              blob: item.blob,
            });
          }
        }
      }

      const { galleryActive } = await processUploadQueue(
        supabase,
        galleryId,
        uploadItems,
        (prog) => setUploadProgress({ ...prog }),
        4
      );

      setIsUploading(false);

      // Clean up object URLs from memory
      previewResults.forEach((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      });

      // Gallery is now active and ready!
      setGallery({
        id: galleryRow.id,
        name: galleryRow.name,
        totalPhotos: galleryRow.total_photos,
        selectionLimit: galleryRow.selection_limit,
        status: galleryActive ? 'active' : 'draft',
        selectionsCount: 0,
      });
      setSelectionsCount(0);
      setCurrentStep('step4_ready');
    } catch (err: any) {
      console.error('Error generating gallery:', err);
      setIsGenerating(false);
      setIsUploading(false);
      setErrorMessage(err.message || 'An error occurred during gallery generation.');
      setCurrentStep('step2_configure');
    }
  };

  // Recovery Action: Reconnect Source Folder if handle was lost on page reload / cleared site data
  const handleReconnectSourceFolder = async () => {
    setErrorMessage(null);
    if (!('showDirectoryPicker' in window)) {
      setErrorMessage('File System Access API is not supported in this browser. Please use Chrome, Edge, or Opera.');
      return;
    }

    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'read' });
      setSourceDirHandle(handle);
      if (gallery) {
        await storeSourceDirectoryHandle(gallery.id, handle);
        await storeSourceDirectoryHandle(gallery.name, handle);
      } else if (folderName) {
        await storeSourceDirectoryHandle(folderName, handle);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setErrorMessage(err.message || 'Error reconnecting source folder.');
    }
  };

  // Choose Destination Parent Folder (Application will automatically create "Selected {gallery.name}" inside it)
  const handleChooseDestinationFolder = async () => {
    setErrorMessage(null);
    if (!('showDirectoryPicker' in window)) {
      setErrorMessage('File System Access API is not supported in this browser. Please use Chrome, Edge, or Opera.');
      return;
    }

    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      setDestParentHandle(handle);

      // Check if "Selected {gallery.name}" already exists inside chosen parent
      if (gallery) {
        try {
          await handle.getDirectoryHandle(`Selected ${gallery.name}`, { create: false });
          setDestFolderAlreadyExists(true);
        } catch {
          setDestFolderAlreadyExists(false);
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setErrorMessage(err.message || 'Error selecting destination parent folder.');
    }
  };

  // STEP 6: Copy Selected Originals Execution
  const handleStartCopyOriginals = async () => {
    if (!supabase || !gallery) return;

    setErrorMessage(null);

    // 1. Verify or restore Source Directory Handle
    let activeSourceHandle = sourceDirHandle;
    if (!activeSourceHandle) {
      activeSourceHandle =
        (await getStoredSourceDirectoryHandle(gallery.id)) ||
        (await getStoredSourceDirectoryHandle(gallery.name));
      if (activeSourceHandle) {
        setSourceDirHandle(activeSourceHandle);
      }
    }

    if (!activeSourceHandle) {
      setErrorMessage(
        'Source folder access needs to be restored. Please click "Reconnect Source Folder".'
      );
      return;
    }

    // Verify permission on the SAME stored handle without opening a folder picker
    const hasPerm = await verifyHandlePermission(activeSourceHandle, 'read');
    if (!hasPerm) {
      setErrorMessage('Permission was not granted to read files from the stored source folder.');
      return;
    }

    // 2. Verify or prompt for Destination Parent Directory Handle
    let activeDestHandle = destParentHandle;
    if (!activeDestHandle) {
      if ('showDirectoryPicker' in window) {
        try {
          activeDestHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
          setDestParentHandle(activeDestHandle);
        } catch (err: any) {
          if (err.name === 'AbortError') return;
          setErrorMessage('Please select a destination parent folder where "Selected ' + gallery.name + '" should be created.');
          return;
        }
      } else {
        setErrorMessage('File System Access API is not supported in this browser.');
        return;
      }
    }

    setCurrentStep('step6_copying');
    setIsCopying(true);
    setCopyResults([]);

    try {
      // 3. Fetch selected photos from database
      const selectedPhotos: SelectedPhotoRecord[] = await fetchSelectedPhotos(
        supabase,
        gallery.id
      );

      if (selectedPhotos.length === 0) {
        throw new Error('No selected photos found in database.');
      }

      // 4. Copy selected originals into `Selected ${gallery.name}` inside activeDestHandle
      const copyReport = await copySelectedOriginalFiles({
        sourceDirHandle: activeSourceHandle,
        destParentDirHandle: activeDestHandle,
        galleryName: gallery.name,
        selectedPhotos,
        conflictStrategy: conflictStrategy || 'replace',
        onProgress: (p) => setCopyProgress({ ...p }),
      });

      setCopyResults(copyReport.results);
      setOutputFolderName(copyReport.outputDirName);
      setIsCopying(false);

      if (copyReport.failedCount > 0) {
        throw new Error(`${copyReport.failedCount} file(s) failed during copying. Original files must match.`);
      }

      // 5. Automatic Verification Check
      const allVerified = copyReport.results.every((r) => r.hashesMatch && r.status === 'copied');
      if (!allVerified || copyReport.copiedCount !== gallery.selectionLimit) {
        throw new Error('Verification failed: Not all selected original files passed SHA-256 integrity verification.');
      }

      // 6. ISSUE 3: Complete Event & Execute Immediate Cloud Cleanup
      // Storage WebPs -> DELETED
      // selections rows -> DELETED
      // photos rows -> DELETED
      // galleries row -> KEPT (completed/history)
      // Local originals & Selected {Gallery Name} folder -> COMPLETELY UNTOUCHED
      setIsCleaningUp(true);
      const retrievalSummary: RetrievalVerificationSummary = {
        hasRetrieved: true,
        totalSelected: selectedPhotos.length,
        copiedCount: copyReport.copiedCount,
        skippedCount: copyReport.skippedCount,
        failedCount: copyReport.failedCount,
        allHashesMatch: true,
        results: copyReport.results,
      };

      const completionRes = await completeGallery(supabase, gallery.id, retrievalSummary);
      setIsCleaningUp(false);

      setCompletedSummary({
        copiedCount: copyReport.copiedCount,
        verifiedCount: copyReport.copiedCount,
        cleanedUpWebPs: completionRes.deletedPreviewsCount,
        outputFolderName: copyReport.outputDirName,
      });

      setGallery((prev) => (prev ? { ...prev, status: 'completed' } : null));
      setCurrentStep('step7_completed');
    } catch (err: any) {
      console.error('Copy/Completion error:', err);
      setIsCopying(false);
      setIsCleaningUp(false);
      setErrorMessage(err.message || 'An error occurred while copying original files.');
    }
  };

  // Reset to Start Over with a New Event Folder
  const handleResetToStart = () => {
    setFolderName(null);
    setDetectedPhotos([]);
    setSelectionLimit('');
    setGallery(null);
    setSelectionsCount(0);
    setErrorMessage(null);
    setCopyResults([]);
    setCompletedSummary(null);
    setCurrentStep('step1_folder');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-app)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Hidden folder input for browser directory selection */}
      <input
        type="file"
        ref={fileInputRef}
        // @ts-ignore
        webkitdirectory="true"
        directory="true"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      {/* Minimal Top Header */}
      <header
        style={{
          height: '64px',
          background: 'rgba(12, 17, 30, 0.85)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div
          onClick={handleResetToStart}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              background: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.4)',
            }}
          >
            <Camera size={18} color="#ffffff" />
          </div>
          <div>
            <span style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>
              Photo Selection
            </span>
            <span
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                marginLeft: '8px',
                display: 'inline-block',
              }}
            >
              Photographer Tool
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {currentStep !== 'step1_folder' && (
            <>
              <button
                type="button"
                onClick={handleResetToStart}
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '12px' }}
                id="btn-new-event-top"
              >
                <Plus size={14} />
                <span>+ New Event</span>
              </button>
              <button
                type="button"
                onClick={handleResetToStart}
                className="btn btn-outline"
                style={{ padding: '6px 12px', fontSize: '12px' }}
                id="btn-all-events-history-top"
                data-testid="btn-recent-events-top"
              >
                <span>Recent Events</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Single-Focused Workflow Area */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 16px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '620px',
            transition: 'max-width 0.3s ease',
          }}
        >
          {/* Card Container */}
          <div
            className="card card-elevated"
            style={{
              padding: '36px 32px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-card)',
              boxShadow: 'var(--shadow-xl)',
            }}
          >
            {/* Global Error Notice */}
            {errorMessage && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '12px',
                  marginBottom: '20px',
                }}
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{errorMessage}</span>
              </div>
            )}

            {/* ==============================================================
                STEP 1: PRIMARY PHOTOGRAPHER HOME SCREEN (+ ADD EVENT FOLDER)
                ============================================================== */}
            {currentStep === 'step1_folder' && (
              <div>
                <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                  <div
                    style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '16px',
                      background: 'rgba(37, 99, 235, 0.12)',
                      border: '1px solid rgba(37, 99, 235, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px auto',
                    }}
                  >
                    <FolderOpen size={28} color="#3b82f6" />
                  </div>

                  <h1
                    style={{
                      fontSize: '26px',
                      fontWeight: 800,
                      color: '#ffffff',
                      letterSpacing: '-0.02em',
                      lineHeight: 1.2,
                    }}
                  >
                    Photo Selection
                  </h1>
                  <p
                    style={{
                      fontSize: '14px',
                      color: 'var(--text-secondary)',
                      marginTop: '8px',
                      lineHeight: 1.5,
                      maxWidth: '440px',
                      marginLeft: 'auto',
                      marginRight: 'auto',
                    }}
                  >
                    Select an event folder containing the original photos.
                  </p>
                </div>

                {/* Dominant Primary Action Button */}
                <div style={{ marginTop: '24px' }}>
                  <button
                    onClick={handleAddFolderClick}
                    disabled={isScanning}
                    className="btn btn-primary"
                    style={{
                      width: '100%',
                      padding: '16px 28px',
                      fontSize: '16px',
                      fontWeight: 700,
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                    }}
                    id="btn-add-event-folder"
                  >
                    {isScanning ? (
                      <>
                        <RefreshCw size={18} className="spin" />
                        <span>Detecting Photos in Folder...</span>
                      </>
                    ) : (
                      <>
                        <Plus size={20} />
                        <span>+ Add Event Folder</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Workflow Reassurance Points */}
                <div
                  style={{
                    marginTop: '24px',
                    padding: '16px',
                    background: 'rgba(15, 23, 42, 0.5)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                    <Check size={14} color="#10b981" />
                    <span>Original camera files remain untouched</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                    <Check size={14} color="#10b981" />
                    <span>Small WebP previews are uploaded privately</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                    <Check size={14} color="#10b981" />
                    <span>Customer selects photos using the shared link</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                    <Check size={14} color="#10b981" />
                    <span>Selected originals are copied to a new folder</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                    <Check size={14} color="#10b981" />
                    <span>Cloud previews are automatically cleaned up</span>
                  </div>
                </div>

                {/* Lightweight Recent Events List (Step 16) */}
                {recentGalleries.length > 0 && (
                  <div style={{ marginTop: '28px', borderTop: '1px solid var(--border-subtle)', paddingTop: '20px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '14px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '11px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          fontWeight: 700,
                          color: 'var(--text-muted)',
                        }}
                      >
                        Recent Events
                      </span>
                      {isLoadingRecent && <RefreshCw size={12} className="spin" color="var(--text-muted)" />}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {recentGalleries.map((item) => {
                        const isCompleted = item.status === 'completed';
                        const isSubmitted = item.status === 'submitted' || item.selectionsCount >= item.selectionLimit;

                        return (
                          <div
                            key={item.id}
                            style={{
                              padding: '14px 16px',
                              background: 'rgba(9, 13, 22, 0.6)',
                              border: isSubmitted
                                ? '1px solid rgba(16, 185, 129, 0.4)'
                                : '1px solid var(--border-medium)',
                              borderRadius: 'var(--radius-sm)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '12px',
                            }}
                          >
                            {isCompleted ? (
                              <>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div
                                    style={{
                                      fontSize: '15px',
                                      fontWeight: 700,
                                      color: '#ffffff',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                  >
                                    {item.name}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: '12px',
                                      marginTop: '4px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '3px',
                                    }}
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{ color: '#10b981', fontWeight: 600 }}>✓ Completed</span>
                                      <span style={{ color: 'var(--text-muted)' }}>•</span>
                                      {item.cloudCleanupStatus === 'deleted' || !item.hasCloudPreviews ? (
                                        <span style={{ color: '#94a3b8' }}>☁ Cloud previews deleted</span>
                                      ) : item.cloudCleanupStatus === 'failed' ? (
                                        <span style={{ color: '#f59e0b', fontWeight: 600 }}>⚠ Cleanup failed</span>
                                      ) : (
                                        <span style={{ color: '#60a5fa' }}>☁ Cleanup scheduled</span>
                                      )}
                                    </div>

                                    {item.cloudCleanupStatus === 'deleted' || !item.hasCloudPreviews ? (
                                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                                        Cloud previews were permanently removed. • Completed: {formatEventDate(item.updatedAt)}
                                      </div>
                                    ) : item.cloudCleanupStatus === 'failed' ? (
                                      <div style={{ fontSize: '12px', color: '#f87171' }}>
                                        Cloud cleanup could not be completed. Retry.
                                      </div>
                                    ) : (
                                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                                        Cloud previews will be deleted automatically after 1 day.
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Actions for Completed: No Copy Originals, only cleanup actions + X remove */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                  {(item.cloudCleanupStatus === 'scheduled' || (item.hasCloudPreviews && item.cloudCleanupStatus !== 'deleted')) && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setConfirmDeleteEvent(item);
                                      }}
                                      className="btn btn-outline"
                                      style={{
                                        padding: '6px 12px',
                                        fontSize: '11px',
                                        borderColor: 'rgba(239, 68, 68, 0.4)',
                                        color: '#f87171',
                                      }}
                                      id={`btn-delete-previews-${item.id}`}
                                    >
                                      Delete Cloud Previews
                                    </button>
                                  )}

                                  {item.cloudCleanupStatus === 'failed' && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleExecuteManualDelete(item);
                                      }}
                                      className="btn btn-outline"
                                      style={{
                                        padding: '6px 12px',
                                        fontSize: '11px',
                                        borderColor: '#f59e0b',
                                        color: '#fcd34d',
                                      }}
                                      id={`btn-retry-cleanup-${item.id}`}
                                    >
                                      Retry Cleanup
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmRemoveEvent(item);
                                    }}
                                    className="btn btn-ghost"
                                    style={{
                                      padding: '6px',
                                      color: '#64748b',
                                      borderRadius: '4px',
                                      border: 'none',
                                      background: 'transparent',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                    title="Remove from Recent Events"
                                    aria-label="Remove from Recent Events"
                                    id={`btn-remove-recent-${item.id}`}
                                  >
                                    <X size={15} />
                                  </button>
                                </div>
                              </>
                            ) : isSubmitted ? (
                              <>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div
                                    style={{
                                      fontSize: '15px',
                                      fontWeight: 700,
                                      color: '#ffffff',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                  >
                                    {item.name}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: '12px',
                                      marginTop: '4px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                    }}
                                  >
                                    <span style={{ color: '#34d399', fontWeight: 600 }}>
                                      ✓ Selection received
                                    </span>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                  <button
                                    type="button"
                                    onClick={() => loadGalleryById(item.id)}
                                    className="btn btn-primary"
                                    style={{
                                      padding: '6px 12px',
                                      fontSize: '11px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                    id={`btn-copy-originals-${item.id}`}
                                  >
                                    <span>Copy Originals</span>
                                    <ArrowRight size={12} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmRemoveEvent(item);
                                    }}
                                    className="btn btn-ghost"
                                    style={{
                                      padding: '6px',
                                      color: '#64748b',
                                      borderRadius: '4px',
                                      border: 'none',
                                      background: 'transparent',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                    title="Remove from Recent Events"
                                    aria-label="Remove from Recent Events"
                                    id={`btn-remove-recent-${item.id}`}
                                  >
                                    <X size={15} />
                                  </button>
                                </div>
                              </>
                            ) : item.status === 'active' ? (
                              <>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div
                                    style={{
                                      fontSize: '15px',
                                      fontWeight: 700,
                                      color: '#ffffff',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                  >
                                    {item.name}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: '12px',
                                      marginTop: '4px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                    }}
                                  >
                                    <span style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span style={{ fontSize: '9px' }}>●</span>
                                      <span>Waiting for customer selection</span>
                                    </span>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const ok = await copyCustomerGalleryLink(item.id);
                                      if (ok) {
                                        setCopiedRecentId(item.id);
                                        setTimeout(() => setCopiedRecentId(null), 2000);
                                      }
                                    }}
                                    className="btn btn-secondary"
                                    style={{
                                      padding: '6px 10px',
                                      fontSize: '11px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                    id={`btn-copy-link-${item.id}`}
                                  >
                                    {copiedRecentId === item.id ? <Check size={12} /> : <Copy size={12} />}
                                    <span>{copiedRecentId === item.id ? 'Copied!' : 'Copy Link'}</span>
                                  </button>

                                  <a
                                    href={getCustomerGalleryUrl(item.id)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn btn-outline"
                                    style={{
                                      padding: '6px 10px',
                                      fontSize: '11px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      textDecoration: 'none',
                                    }}
                                    id={`btn-open-gallery-${item.id}`}
                                  >
                                    <span>Open Customer Gallery</span>
                                    <ExternalLink size={12} />
                                  </a>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmRemoveEvent(item);
                                    }}
                                    className="btn btn-ghost"
                                    style={{
                                      padding: '6px',
                                      color: '#64748b',
                                      borderRadius: '4px',
                                      border: 'none',
                                      background: 'transparent',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                    title="Remove from Recent Events"
                                    aria-label="Remove from Recent Events"
                                    id={`btn-remove-recent-${item.id}`}
                                  >
                                    <X size={15} />
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div
                                    style={{
                                      fontSize: '15px',
                                      fontWeight: 700,
                                      color: '#ffffff',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                  >
                                    {item.name}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: '12px',
                                      marginTop: '4px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                    }}
                                  >
                                    <span style={{ color: '#94a3b8' }}>
                                      Processing
                                    </span>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                  <button
                                    type="button"
                                    onClick={() => loadGalleryById(item.id)}
                                    className="btn btn-outline"
                                    style={{
                                      padding: '6px 12px',
                                      fontSize: '11px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                    id={`btn-open-event-${item.id}`}
                                  >
                                    <span>Resume</span>
                                    <ArrowRight size={12} />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmRemoveEvent(item);
                                    }}
                                    className="btn btn-ghost"
                                    style={{
                                      padding: '6px',
                                      color: '#64748b',
                                      borderRadius: '4px',
                                      border: 'none',
                                      background: 'transparent',
                                      cursor: 'pointer',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                    }}
                                    title="Remove from Recent Events"
                                    aria-label="Remove from Recent Events"
                                    id={`btn-remove-recent-${item.id}`}
                                  >
                                    <X size={15} />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Manual Delete Cloud Previews Confirmation Modal */}
                {confirmDeleteEvent && (
                  <div
                    style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'rgba(0, 0, 0, 0.75)',
                      backdropFilter: 'blur(4px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 9999,
                      padding: '20px',
                    }}
                  >
                    <div
                      style={{
                        background: '#0f172a',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '12px',
                        padding: '24px',
                        maxWidth: '460px',
                        width: '100%',
                        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            background: 'rgba(239, 68, 68, 0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <AlertCircle size={22} color="#ef4444" />
                        </div>
                        <div>
                          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                            Delete cloud previews?
                          </h3>
                          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                            Event: <strong style={{ color: '#ffffff' }}>{confirmDeleteEvent.name}</strong>
                          </div>
                        </div>
                      </div>

                      <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.6, marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <p style={{ margin: 0 }}>
                          Selected originals have already been copied locally. This will permanently remove the WebP previews and cloud/database records for this event. Your original camera files will NOT be affected.
                        </p>
                        <p style={{ margin: 0, color: '#f87171', fontWeight: 600 }}>
                          Your original camera files on this computer will NOT be affected. Your original camera files and copied selected originals will NOT be affected.
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteEvent(null)}
                          disabled={isDeletingPreviews}
                          className="btn btn-secondary"
                          style={{ padding: '8px 16px', fontSize: '13px' }}
                          id="btn-cancel-delete-previews"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExecuteManualDelete(confirmDeleteEvent)}
                          disabled={isDeletingPreviews}
                          className="btn"
                          style={{
                            padding: '8px 16px',
                            fontSize: '13px',
                            fontWeight: 700,
                            background: '#dc2626',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                          id="btn-confirm-delete-previews"
                        >
                          {isDeletingPreviews ? (
                            <>
                              <RefreshCw size={14} className="spin" />
                              <span>Deleting...</span>
                            </>
                          ) : (
                            <span>Delete Permanently</span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Remove Event from Recent Events Confirmation Modal (X Action) */}
                {confirmRemoveEvent && (
                  <div
                    style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'rgba(0, 0, 0, 0.75)',
                      backdropFilter: 'blur(4px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 9999,
                      padding: '20px',
                    }}
                  >
                    <div
                      style={{
                        background: '#0f172a',
                        border: '1px solid var(--border-medium)',
                        borderRadius: '12px',
                        padding: '24px',
                        maxWidth: '460px',
                        width: '100%',
                        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                        <div
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            background: 'rgba(239, 68, 68, 0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Trash2 size={22} color="#ef4444" />
                        </div>
                        <div>
                          <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                            Delete this event from database?
                          </h3>
                          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                            Event: <strong style={{ color: '#ffffff' }}>{confirmRemoveEvent.name}</strong>
                          </div>
                        </div>
                      </div>

                      <div style={{ fontSize: '13px', color: '#cbd5e1', lineHeight: 1.6, marginBottom: '24px' }}>
                        <p style={{ margin: 0, marginBottom: '8px' }}>
                          This permanently deletes the event gallery record, selections, and cloud preview files from Supabase.
                        </p>
                        <p style={{ margin: 0, color: '#94a3b8', fontSize: '12px' }}>
                          Original camera files and local <code>Selected {confirmRemoveEvent.name}</code> folders on your computer will <strong>NEVER</strong> be touched.
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveEvent(null)}
                          disabled={isRemovingEvent}
                          className="btn btn-secondary"
                          style={{ padding: '8px 16px', fontSize: '13px' }}
                          id="btn-cancel-remove-recent"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExecuteRemoveRecent(confirmRemoveEvent)}
                          disabled={isRemovingEvent}
                          className="btn btn-danger"
                          style={{
                            padding: '8px 16px',
                            fontSize: '13px',
                            fontWeight: 700,
                            borderRadius: 'var(--radius-sm)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                          id="btn-confirm-remove-recent"
                        >
                          <Trash2 size={15} />
                          {isRemovingEvent ? 'Deleting...' : 'Delete Event'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==============================================================
                STEP 2: CONFIGURE SELECTION COUNT
                ============================================================== */}
            {currentStep === 'step2_configure' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '20px',
                  }}
                >
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                      Configure Selection Count
                    </h2>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Set how many photos the customer needs to pick.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddFolderClick}
                    className="btn btn-outline"
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                  >
                    Change Folder
                  </button>
                </div>

                {/* Detected Folder Summary Cards */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px',
                    marginBottom: '24px',
                  }}
                >
                  <div
                    style={{
                      background: 'rgba(9, 13, 22, 0.7)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '14px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                      }}
                    >
                      Event:
                    </span>
                    <div
                      style={{
                        fontSize: '15px',
                        fontWeight: 700,
                        color: '#ffffff',
                        marginTop: '4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={folderName || ''}
                    >
                      {folderName}
                    </div>
                  </div>

                  <div
                    style={{
                      background: 'rgba(9, 13, 22, 0.7)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '14px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                      }}
                    >
                      Photos found:
                    </span>
                    <div
                      style={{
                        fontSize: '15px',
                        fontWeight: 700,
                        color: '#60a5fa',
                        marginTop: '4px',
                      }}
                    >
                      {detectedPhotos.length.toLocaleString()} photos
                    </div>
                  </div>
                </div>

                {/* Selection Limit Input Form */}
                <form onSubmit={handleGenerateGallery}>
                  <div style={{ marginBottom: '24px' }}>
                    <label
                      htmlFor="input-selection-count"
                      style={{
                        display: 'block',
                        fontSize: '13px',
                        fontWeight: 600,
                        color: '#e2e8f0',
                        marginBottom: '8px',
                      }}
                    >
                      How many photos should the customer select?
                    </label>

                    <input
                      id="input-selection-count"
                      type="number"
                      min="1"
                      max={detectedPhotos.length}
                      value={selectionLimit}
                      onChange={(e) => setSelectionLimit(e.target.value)}
                      placeholder="e.g. 300"
                      autoFocus
                      style={{
                        width: '100%',
                        padding: '14px 16px',
                        fontSize: '16px',
                        fontWeight: 700,
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(12, 17, 30, 0.95)',
                        border: '1px solid var(--border-medium)',
                        color: '#ffffff',
                        outline: 'none',
                        transition: 'border-color 0.15s ease',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        marginTop: '6px',
                        display: 'block',
                      }}
                    >
                      Customer must select exactly this number (min 1, max {detectedPhotos.length.toLocaleString()}).
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      type="button"
                      onClick={handleResetToStart}
                      className="btn btn-secondary"
                      style={{ flex: 1, padding: '12px', fontSize: '13px' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!selectionLimit.trim()}
                      className="btn btn-primary"
                      style={{
                        flex: 2,
                        padding: '12px 24px',
                        fontSize: '14px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                      }}
                      id="btn-generate-gallery"
                    >
                      <span>Generate Gallery</span>
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ==============================================================
                STEP 3: GENERATING PREVIEWS & UPLOADING PREVIEWS PROGRESS
                ============================================================== */}
            {currentStep === 'step3_processing' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: 'rgba(37, 99, 235, 0.15)',
                      border: '1px solid rgba(37, 99, 235, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {isGenerating ? (
                      <RefreshCw size={24} color="#3b82f6" className="spin" />
                    ) : (
                      <UploadCloud size={24} color="#38bdf8" className="spin" />
                    )}
                  </div>
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                      {isGenerating ? 'Generating previews...' : isUploading ? 'Uploading previews...' : 'Processing previews...'}
                    </h2>
                    <p style={{ fontSize: '13px', color: '#60a5fa', fontWeight: 600 }}>
                      {isGenerating
                        ? `${previewProgress.processed} / ${previewProgress.total}`
                        : `${uploadProgress.uploaded} / ${uploadProgress.total}`}
                    </p>
                  </div>
                </div>

                {/* Animated Progress Bar */}
                <div
                  style={{
                    width: '100%',
                    height: '8px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${
                        isGenerating
                          ? previewProgress.total > 0
                            ? (previewProgress.processed / previewProgress.total) * 100
                            : 0
                          : uploadProgress.total > 0
                          ? (uploadProgress.uploaded / uploadProgress.total) * 100
                          : 0
                      }%`,
                      height: '100%',
                      background: isGenerating
                        ? 'linear-gradient(90deg, #2563eb, #60a5fa)'
                        : 'linear-gradient(90deg, #2563eb, #38bdf8)',
                      transition: 'width 0.15s ease',
                    }}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>
                    Current file:{' '}
                    <strong style={{ color: '#ffffff' }}>
                      {isGenerating
                        ? previewProgress.currentFilename || 'Preparing image...'
                        : uploadProgress.currentFilename || 'Transferring WebP...'}
                    </strong>
                  </span>
                  <span style={{ fontWeight: 700, color: '#93c5fd' }}>
                    {Math.round(
                      isGenerating
                        ? previewProgress.total > 0
                          ? (previewProgress.processed / previewProgress.total) * 100
                          : 0
                        : uploadProgress.total > 0
                        ? (uploadProgress.uploaded / uploadProgress.total) * 100
                        : 0
                    )}
                    %
                  </span>
                </div>

                <div
                  style={{
                    padding: '12px 14px',
                    background: 'rgba(15, 23, 42, 0.4)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Info size={14} color="#60a5fa" style={{ flexShrink: 0 }} />
                  <span>
                    Small WebPs are being created in your browser and stored in private cloud storage. Originals are untouched.
                  </span>
                </div>
              </div>
            )}

            {/* ==============================================================
                STEP 4: GALLERY READY SCREEN (Customer Link & Actions)
                ============================================================== */}
            {currentStep === 'step4_ready' && gallery && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '20px',
                  }}
                >
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CheckCircle2 size={24} color="#10b981" />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff' }}>
                      ✓ Gallery Ready
                    </h2>
                    <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>
                      Customer link has been generated.
                    </p>
                  </div>
                </div>

                {/* Event Summary Details */}
                <div
                  style={{
                    background: 'rgba(9, 13, 22, 0.7)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '16px',
                    marginBottom: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    fontSize: '13px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Event:</span>
                    <strong style={{ color: '#ffffff' }}>{gallery.name}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Photos available:</span>
                    <strong style={{ color: '#ffffff' }}>{gallery.totalPhotos.toLocaleString()}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Customer must select:</span>
                    <strong style={{ color: '#60a5fa' }}>{gallery.selectionLimit} photos</strong>
                  </div>
                </div>

                {/* Customer Gallery Link Card with Actions */}
                <div
                  style={{
                    padding: '18px',
                    background: 'rgba(37, 99, 235, 0.08)',
                    border: '1px solid rgba(37, 99, 235, 0.3)',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: '24px',
                  }}
                >
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#93c5fd',
                      marginBottom: '8px',
                    }}
                  >
                    Customer Gallery Link:
                  </label>

                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <input
                      readOnly
                      value={getCustomerGalleryUrl(gallery.id)}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        fontSize: '12px',
                        background: 'rgba(15, 23, 42, 0.9)',
                        border: '1px solid var(--border-medium)',
                        borderRadius: '6px',
                        color: '#ffffff',
                      }}
                    />
                  </div>

                  {/* Primary Share Actions */}
                  <div style={{ display: 'grid', gridTemplateColumns: isWebShareSupported() ? '1fr 1fr 1fr' : '1fr 1fr', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await copyCustomerGalleryLink(gallery.id);
                        if (ok) {
                          setCopiedLink(true);
                          setTimeout(() => setCopiedLink(false), 2000);
                        }
                      }}
                      className="btn btn-primary"
                      style={{ padding: '10px', fontSize: '13px' }}
                      id="btn-copy-customer-link"
                    >
                      {copiedLink ? <Check size={15} /> : <Copy size={15} />}
                      <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        window.open(`/gallery/${gallery.id}`, '_blank');
                      }}
                      className="btn btn-secondary"
                      style={{ padding: '10px', fontSize: '13px' }}
                      id="btn-open-gallery"
                    >
                      <ExternalLink size={15} />
                      <span>Open Gallery</span>
                    </button>

                    {isWebShareSupported() && (
                      <button
                        type="button"
                        onClick={() => {
                          shareCustomerGalleryLink({ id: gallery.id, name: gallery.name });
                        }}
                        className="btn btn-outline"
                        style={{ padding: '10px', fontSize: '13px' }}
                        id="btn-share-gallery"
                      >
                        <Share2 size={15} />
                        <span>Share</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Live Customer Selection Monitor */}
                <div
                  style={{
                    padding: '16px',
                    background: 'rgba(9, 13, 22, 0.6)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Clock size={16} color="#60a5fa" className="spin" />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
                        Customer Selection Progress:
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Waiting for customer to select ({selectionsCount} / {gallery.selectionLimit})
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleCheckSelectionsManual}
                    disabled={isCheckingSelections}
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '11px' }}
                  >
                    {isCheckingSelections ? 'Checking...' : 'Check Status'}
                  </button>
                </div>
              </div>
            )}

            {/* ==============================================================
                STEP 5: CUSTOMER SELECTION RECEIVED
                ============================================================== */}
            {currentStep === 'step5_received' && gallery && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '20px',
                  }}
                >
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CheckCircle2 size={26} color="#10b981" />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff' }}>
                      ✓ Customer selection received
                    </h2>
                    <p style={{ fontSize: '14px', color: '#34d399', fontWeight: 700, marginTop: '2px' }}>
                      {gallery.selectionLimit} / {gallery.selectionLimit} photos selected
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    background: 'rgba(9, 13, 22, 0.7)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '18px',
                    marginBottom: '20px',
                    fontSize: '13px',
                    lineHeight: 1.6,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <p style={{ fontWeight: 700, color: '#ffffff', fontSize: '14px', marginBottom: '4px' }}>
                    Choose where the selected photos should be saved.
                  </p>
                  <p style={{ color: 'var(--text-muted)' }}>
                    Select the parent folder. We'll automatically create:
                  </p>
                  <div
                    style={{
                      marginTop: '8px',
                      marginBottom: '10px',
                      padding: '8px 14px',
                      background: 'rgba(15, 23, 42, 0.9)',
                      border: '1px solid rgba(59, 130, 246, 0.35)',
                      borderRadius: '6px',
                      fontFamily: 'monospace',
                      color: '#60a5fa',
                      fontSize: '14px',
                      fontWeight: 700,
                      display: 'inline-block',
                    }}
                  >
                    Selected {gallery.name}/
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    The Windows picker represents the PARENT destination folder. You do NOT have to create or select "Selected {gallery.name}" manually.
                  </p>
                </div>

                {/* Source Folder Card: Retained handle in normal workflow */}
                {sourceDirHandle ? (
                  <div
                    style={{
                      marginBottom: '16px',
                      padding: '14px 16px',
                      background: 'rgba(16, 185, 129, 0.08)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                    id="source-folder-retained-card"
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '11px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: '#6ee7b7',
                          fontWeight: 600,
                        }}
                      >
                        Source folder:
                      </div>
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: '#ffffff',
                          marginTop: '2px',
                          fontFamily: 'monospace',
                        }}
                      >
                        ✓ {sourceDirHandle.name}/
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: '12px',
                        color: '#34d399',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <CheckCircle2 size={16} color="#10b981" />
                      Original files ready
                    </div>
                  </div>
                ) : (
                  /* Recovery Notice ONLY if handle is genuinely unavailable */
                  <div
                    style={{
                      marginBottom: '16px',
                      padding: '14px 16px',
                      background: 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid rgba(245, 158, 11, 0.25)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                    id="source-folder-recovery-card"
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#fcd34d' }}>
                        Source folder access needs to be restored
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Select the original event folder ({gallery.name}) to read camera files.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleReconnectSourceFolder}
                      className="btn btn-outline"
                      style={{
                        padding: '8px 14px',
                        fontSize: '12px',
                        whiteSpace: 'nowrap',
                        borderColor: '#f59e0b',
                        color: '#fcd34d',
                      }}
                      id="btn-reconnect-source-folder"
                    >
                      Reconnect Source Folder
                    </button>
                  </div>
                )}

                {/* Destination Parent Folder Summary Card */}
                {destParentHandle && (
                  <div
                    style={{
                      marginBottom: '20px',
                      padding: '16px',
                      background: 'rgba(15, 23, 42, 0.85)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: '11px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: 'var(--text-muted)',
                          fontWeight: 600,
                        }}
                      >
                        Destination:
                      </span>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff', marginTop: '2px' }}>
                        {destParentHandle.name}/
                      </div>
                    </div>

                    <div>
                      <span
                        style={{
                          fontSize: '11px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: 'var(--text-muted)',
                          fontWeight: 600,
                        }}
                      >
                        Output folder:
                      </span>
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: '#60a5fa',
                          marginTop: '2px',
                          fontFamily: 'monospace',
                        }}
                      >
                        Selected {gallery.name}/
                      </div>
                    </div>

                    {/* Conflict Detection Banner */}
                    {destFolderAlreadyExists && (
                      <div
                        style={{
                          marginTop: '6px',
                          padding: '10px 12px',
                          background: 'rgba(245, 158, 11, 0.1)',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          borderRadius: '6px',
                          fontSize: '12px',
                        }}
                      >
                        <div style={{ color: '#f59e0b', fontWeight: 700, marginBottom: '6px' }}>
                          ⚠️ "Selected {gallery.name}" already exists inside this destination parent.
                        </div>
                        <div style={{ display: 'flex', gap: '16px', color: '#e2e8f0', flexWrap: 'wrap' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="conflict-strategy"
                              checked={conflictStrategy === 'replace'}
                              onChange={() => setConflictStrategy('replace')}
                            />
                            <span>Replace duplicate files</span>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="conflict-strategy"
                              checked={conflictStrategy === 'skip'}
                              onChange={() => setConflictStrategy('skip')}
                            />
                            <span>Skip existing files</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Primary Action Buttons */}
                {!destParentHandle ? (
                  <button
                    type="button"
                    onClick={handleChooseDestinationFolder}
                    className="btn btn-primary"
                    style={{
                      width: '100%',
                      padding: '15px 24px',
                      fontSize: '15px',
                      fontWeight: 700,
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                    }}
                    id="btn-choose-dest-folder"
                  >
                    <FolderOpen size={18} />
                    <span>Choose Destination Folder</span>
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={handleChooseDestinationFolder}
                      className="btn btn-secondary"
                      style={{
                        padding: '14px 18px',
                        fontSize: '13px',
                        borderRadius: 'var(--radius-md)',
                      }}
                      id="btn-change-dest-folder"
                    >
                      Change Folder
                    </button>
                    <button
                      type="button"
                      onClick={handleStartCopyOriginals}
                      className="btn btn-primary"
                      style={{
                        flex: 1,
                        padding: '14px 24px',
                        fontSize: '15px',
                        fontWeight: 700,
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px',
                      }}
                      id="btn-start-copy"
                    >
                      <FolderOutput size={18} />
                      <span>Start Copy</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ==============================================================
                STEP 6: COPYING SELECTED ORIGINALS PROGRESS & VERIFICATION
                ============================================================== */}
            {currentStep === 'step6_copying' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '50%',
                      background: 'rgba(37, 99, 235, 0.15)',
                      border: '1px solid rgba(37, 99, 235, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <RefreshCw size={24} color="#3b82f6" className="spin" />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                      {isCleaningUp
                        ? 'Cleaning up cloud previews...'
                        : isCopying
                        ? 'Copying selected originals...'
                        : 'Verifying files...'}
                    </h2>
                    <p style={{ fontSize: '13px', color: '#60a5fa', fontWeight: 600 }}>
                      {copyProgress.processed} / {copyProgress.total}
                    </p>
                    {outputFolderName && (
                      <p style={{ fontSize: '11px', color: '#93c5fd', marginTop: '2px' }}>
                        Folder: <code>{outputFolderName}/</code>
                      </p>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div
                  style={{
                    width: '100%',
                    height: '8px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${copyProgress.percentage}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #2563eb, #10b981)',
                      transition: 'width 0.15s ease',
                    }}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>
                    Copying:{' '}
                    <strong style={{ color: '#ffffff' }}>
                      {copyProgress.currentFilename || 'Processing originals...'}
                    </strong>
                  </span>
                  <span style={{ fontWeight: 700, color: '#93c5fd' }}>
                    {copyProgress.percentage}%
                  </span>
                </div>

                {/* Verification Status Metrics */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '12px',
                    background: 'rgba(9, 13, 22, 0.7)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '14px',
                    fontSize: '12px',
                  }}
                >
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Copied</div>
                    <div style={{ color: '#10b981', fontWeight: 700, fontSize: '16px' }}>
                      {copyProgress.copied}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Verified</div>
                    <div style={{ color: '#38bdf8', fontWeight: 700, fontSize: '16px' }}>
                      {copyResults.filter((r) => r.hashesMatch).length}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Remaining</div>
                    <div style={{ color: '#ffffff', fontWeight: 700, fontSize: '16px' }}>
                      {Math.max(0, copyProgress.total - copyProgress.processed)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ==============================================================
                STEP 7: COMPLETED (Originals Copied, Verified, Cloud Cleaned)
                ============================================================== */}
            {currentStep === 'step7_completed' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '20px',
                  }}
                >
                  <div
                    style={{
                      width: '50px',
                      height: '50px',
                      borderRadius: '50%',
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CheckCircle2 size={28} color="#10b981" />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#ffffff' }}>
                      ✓ Completed
                    </h2>
                    <p style={{ fontSize: '13px', color: '#6ee7b7', marginTop: '2px' }}>
                      Workflow finished successfully.
                    </p>
                  </div>
                </div>

                {/* Final Checklist Summary */}
                <div
                  style={{
                    background: 'rgba(9, 13, 22, 0.7)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '20px',
                    marginBottom: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    fontSize: '13px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ffffff' }}>
                    <Check size={16} color="#10b981" />
                    <span>
                      <strong style={{ color: '#10b981' }}>{completedSummary?.copiedCount || gallery?.selectionLimit}</strong> original photos copied to <code style={{ color: '#60a5fa' }}>{completedSummary?.outputFolderName || `Selected ${gallery?.name}`}</code>
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ffffff' }}>
                    <FileCheck2 size={16} color="#10b981" />
                    <span>
                      <strong style={{ color: '#10b981' }}>{completedSummary?.verifiedCount || gallery?.selectionLimit}</strong> files verified (SHA-256 integrity match)
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#94a3b8' }}>
                    <FolderCheck size={16} color="#38bdf8" />
                    <span>Original source camera files remain completely untouched</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', color: '#10b981' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <CheckCircle2 size={16} color="#10b981" />
                      <strong style={{ color: '#10b981' }}>☁ Cloud data cleanup completed</strong>
                    </div>
                    <div style={{ fontSize: '12px', color: '#6ee7b7', paddingLeft: '26px' }}>
                      Temporary WebP previews, photos records, and selections deleted from Supabase. Event history is preserved in Recent Events.
                    </div>
                  </div>
                </div>

                {/* Next Steps Actions */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={handleResetToStart}
                    className="btn btn-primary"
                    style={{ flex: 1, padding: '14px', fontSize: '14px', fontWeight: 700 }}
                    id="btn-process-another-event"
                  >
                    + Process Another Event
                  </button>
                  <button
                    type="button"
                    onClick={handleResetToStart}
                    className="btn btn-outline"
                    style={{ flex: 1, padding: '14px', fontSize: '14px', fontWeight: 600 }}
                    id="btn-all-events-history"
                    data-testid="btn-recent-events"
                  >
                    Recent Events
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
