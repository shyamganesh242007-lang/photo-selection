import { useState, useRef, useEffect } from 'react';
import {
  Camera,
  ArrowLeft,
  ArrowRight,
  FolderOpen,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Check,
  Copy,
  ExternalLink,
  UploadCloud,
  ShieldAlert,
  Share2,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  processPreviewQueue,
  type WebPPreviewResult,
  type PreviewGenerationProgress,
} from '../lib/previewGenerator';
import {
  processUploadQueue,
  type UploadProgress,
  type UploadItemResult,
  type UploadQueueItem,
} from '../lib/storageUploader';
import { type DetectedPhoto, SUPPORTED_EXTENSIONS } from '../types';
import {
  copyCustomerGalleryLink,
  shareCustomerGalleryLink,
  getCustomerGalleryUrl,
  isWebShareSupported,
} from '../lib/gallerySharing';

export type WorkflowProcessingState =
  | 'idle'
  | 'selecting-folder'
  | 'folder-selected'
  | 'configured'
  | 'generating'
  | 'uploading'
  | 'completed'
  | 'error';

interface CompletedGalleryInfo {
  id: string;
  name: string;
  totalPhotos: number;
  selectionLimit: number;
  status: string;
}

interface CreateGalleryWorkflowProps {
  onBackToDashboard: () => void;
  onOpenCustomerGallery: (galleryId: string) => void;
  onOpenGalleryDetail?: (galleryId: string) => void;
}

const STEP_LABELS = [
  { step: 1, label: 'Select Folder' },
  { step: 2, label: 'Configure' },
  { step: 3, label: 'Generate Previews' },
  { step: 4, label: 'Upload' },
  { step: 5, label: 'Complete' },
];

export function CreateGalleryWorkflow({
  onBackToDashboard,
  onOpenCustomerGallery,
  onOpenGalleryDetail,
}: CreateGalleryWorkflowProps) {
  // Stepper state (1..5)
  const [activeStep, setActiveStep] = useState<number>(1);
  const [processingState, setProcessingState] = useState<WorkflowProcessingState>('idle');

  // Step 1: Folder Selection
  const [folderName, setFolderName] = useState<string | null>(null);
  const [detectedPhotos, setDetectedPhotos] = useState<DetectedPhoto[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Step 2: Configuration
  const [galleryName, setGalleryName] = useState<string>('');
  const [selectionLimit, setSelectionLimit] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Step 3: Preview Generation
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [previewProgress, setPreviewProgress] = useState<PreviewGenerationProgress>({
    processed: 0,
    total: 0,
    successCount: 0,
    failedCount: 0,
  });
  const [previewError, setPreviewError] = useState<string | null>(null);
  const generatedPreviewsRef = useRef<WebPPreviewResult[]>([]);

  // Step 4: Storage Upload
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    uploaded: 0,
    total: 0,
    failed: 0,
  });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadResultsRef = useRef<UploadItemResult[]>([]);

  // Created Database Record Tracking (Safe for retries)
  const createdGalleryIdRef = useRef<string | null>(null);
  const photoDbMapRef = useRef<Map<string, string>>(new Map());

  // Step 5: Completed Gallery
  const [completedGallery, setCompletedGallery] = useState<CompletedGalleryInfo | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [hasWebShare, setHasWebShare] = useState<boolean>(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  useEffect(() => {
    setHasWebShare(isWebShareSupported());
  }, []);

  useEffect(() => {
    if (shareFeedback) {
      const timer = setTimeout(() => setShareFeedback(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [shareFeedback]);

  // Exit Confirmation Modal
  const [showExitConfirmModal, setShowExitConfirmModal] = useState<boolean>(false);

  // Hidden directory input for HTML5 fallback
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isProcessing = isGenerating || isUploading;

  // Window beforeunload protection while processing
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isProcessing) {
        e.preventDefault();
        e.returnValue =
          'Processing is still in progress. Leaving now may interrupt the gallery creation.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isProcessing]);

  // Cleanup object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      generatedPreviewsRef.current.forEach((p) => {
        if (p.previewUrl) {
          try {
            URL.revokeObjectURL(p.previewUrl);
          } catch {
            // Ignore revocation errors
          }
        }
      });
    };
  }, []);

  // Helper: Read File without touching original
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

  // Helper: Recursive directory scanner for File System Access API
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
          console.warn('Subdirectory scan error:', e);
        }
      }
    }

    results.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
    return results;
  };

  // STEP 1: Select Event Folder Trigger
  const handleSelectFolderClick = async () => {
    setScanError(null);
    setValidationError(null);

    // 1. Try File System Access API (Native OS folder picker)
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
        setIsScanning(true);
        setProcessingState('selecting-folder');

        const scanned = await scanDirectoryHandle(dirHandle, dirHandle.name);
        setIsScanning(false);

        if (scanned.length === 0) {
          setScanError('No supported photos were found in this folder.');
          setProcessingState('idle');
          return;
        }

        setFolderName(dirHandle.name);
        setGalleryName(dirHandle.name);
        setDetectedPhotos(scanned);
        setProcessingState('folder-selected');
        return;
      } catch (err: any) {
        setIsScanning(false);
        if (err.name === 'AbortError') {
          return; // User cancelled OS folder picker
        }
        console.warn('showDirectoryPicker error, falling back to input:', err);
      }
    }

    // 2. Fallback to HTML5 directory input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // Fallback directory input change handler
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsScanning(true);
    setScanError(null);
    setValidationError(null);
    setProcessingState('selecting-folder');

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
      setScanError('No supported photos were found in this folder.');
      setProcessingState('idle');
      return;
    }

    setFolderName(detectedName);
    setGalleryName(detectedName);
    setDetectedPhotos(scanned);
    setProcessingState('folder-selected');
  };

  // Advance from Step 1 to Step 2
  const handleProceedToConfigure = () => {
    if (!folderName || detectedPhotos.length === 0) {
      setScanError('Please select a folder with valid photos first.');
      return;
    }
    setActiveStep(2);
    setProcessingState('configured');
    setValidationError(null);
  };

  // Back from Step 2 to Step 1
  const handleBackToFolderSelect = () => {
    setActiveStep(1);
    setProcessingState('folder-selected');
    setValidationError(null);
  };

  // STEP 2: Validate inputs
  const validateConfiguration = (): { valid: boolean; name: string; limit: number } => {
    const trimmedName = galleryName.trim();
    if (!trimmedName) {
      setValidationError('Gallery name is required and cannot be empty.');
      return { valid: false, name: '', limit: 0 };
    }

    const trimmedLimit = selectionLimit.trim();
    if (!trimmedLimit) {
      setValidationError('Customer selection limit is required.');
      return { valid: false, name: '', limit: 0 };
    }

    // Integer only validation
    if (!/^\d+$/.test(trimmedLimit)) {
      setValidationError('Selection limit must be a positive integer.');
      return { valid: false, name: '', limit: 0 };
    }

    const limitNumber = parseInt(trimmedLimit, 10);
    if (isNaN(limitNumber) || limitNumber <= 0) {
      setValidationError('Selection limit must be greater than 0.');
      return { valid: false, name: '', limit: 0 };
    }

    if (limitNumber > detectedPhotos.length) {
      setValidationError(
        `Selection limit cannot exceed total photo count (${detectedPhotos.length.toLocaleString()}).`
      );
      return { valid: false, name: '', limit: 0 };
    }

    setValidationError(null);
    return { valid: true, name: trimmedName, limit: limitNumber };
  };

  // STEP 3: Preview Generation Runner
  const runPreviewGeneration = async () => {
    setIsGenerating(true);
    setPreviewError(null);
    setActiveStep(3);
    setProcessingState('generating');

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

    try {
      const results = await processPreviewQueue(
        queueItems,
        (progress) => {
          setPreviewProgress({ ...progress });
        },
        2 // Concurrency of 2 to preserve UI responsiveness & bounded memory
      );

      generatedPreviewsRef.current = results;
      const successCount = results.filter((r) => r.success && r.blob).length;

      if (successCount === 0) {
        throw new Error('All preview generations failed. Please check image permissions or formats.');
      }

      setIsGenerating(false);

      // Automatic transition after generation fully succeeds
      setTimeout(() => {
        runUploadProcess();
      }, 600);
    } catch (err: any) {
      console.error('Preview generation error:', err);
      setIsGenerating(false);
      setPreviewError(err.message || 'Preview generation failed.');
      setProcessingState('error');
    }
  };

  // STEP 4: Upload Runner (Duplicate-safe & Retry-safe)
  const runUploadProcess = async () => {
    if (!supabase || !isSupabaseConfigured) {
      setUploadError('Supabase is not configured yet. Check your environment settings.');
      setProcessingState('error');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setActiveStep(4);
    setProcessingState('uploading');

    try {
      let galleryId = createdGalleryIdRef.current;

      // 1. Create gallery & photo rows ONLY IF not already created
      if (!galleryId) {
        const { valid, name: finalName, limit: finalLimit } = validateConfiguration();
        if (!valid) {
          throw new Error('Gallery configuration is invalid.');
        }

        // Insert gallery with initial status 'draft'
        const { data: galleryRow, error: gErr } = await supabase
          .from('galleries')
          .insert({
            name: finalName,
            selection_limit: finalLimit,
            total_photos: detectedPhotos.length,
            status: 'draft',
          })
          .select('id, name, selection_limit, total_photos, status')
          .single();

        if (gErr || !galleryRow) {
          throw new Error(`Database error creating gallery: ${gErr?.message || 'Unknown error'}`);
        }

        galleryId = galleryRow.id;
        createdGalleryIdRef.current = galleryId;

        // Insert photos in batches of 250
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
          const { error: pErr } = await supabase.from('photos').insert(batch);
          if (pErr) {
            throw new Error(
              `Database error saving photos (batch ${Math.floor(i / BATCH_SIZE) + 1}): ${pErr.message}`
            );
          }
        }

        // Query saved photos to build exact relativePath -> photoId mapping
        const { data: savedPhotos, error: fetchErr } = await supabase
          .from('photos')
          .select('id, original_relative_path')
          .eq('gallery_id', galleryId)
          .order('sort_order', { ascending: true });

        if (fetchErr || !savedPhotos) {
          throw new Error(`Failed to query created photos: ${fetchErr?.message}`);
        }

        photoDbMapRef.current = new Map(savedPhotos.map((p) => [p.original_relative_path, p.id]));
      }

      // 2. Prepare upload items from generated WebP Blobs
      const previews = generatedPreviewsRef.current.filter((p) => p.success && p.blob);
      const uploadItems: UploadQueueItem[] = [];

      for (const item of previews) {
        const photoId = photoDbMapRef.current.get(item.relativePath);
        if (photoId && item.blob) {
          uploadItems.push({
            photoId,
            filename: item.filename,
            blob: item.blob,
          });
        }
      }

      setUploadProgress({
        uploaded: 0,
        total: uploadItems.length,
        failed: 0,
      });

      if (!galleryId) {
        throw new Error('Gallery record was not created.');
      }
      const activeGalleryId: string = galleryId;

      // 3. Concurrently upload previews (concurrency = 4)
      const { results: uploadResults, galleryActive } = await processUploadQueue(
        supabase,
        activeGalleryId,
        uploadItems,
        (prog) => {
          setUploadProgress({ ...prog });
        },
        4
      );

      uploadResultsRef.current = uploadResults;

      const failedUploads = uploadResults.filter((r) => !r.success);

      if (!galleryActive || failedUploads.length > 0) {
        throw new Error(
          `Failed to upload ${failedUploads.length} preview(s). Retry upload to complete gallery activation.`
        );
      }

      // 4. STEP 5 — Complete state
      setIsUploading(false);
      setActiveStep(5);
      setProcessingState('completed');

      const { name, limit } = validateConfiguration();
      setCompletedGallery({
        id: activeGalleryId,
        name: name || galleryName.trim(),
        totalPhotos: detectedPhotos.length,
        selectionLimit: limit || parseInt(selectionLimit, 10),
        status: 'active',
      });
    } catch (err: any) {
      console.error('Upload process error:', err);
      setIsUploading(false);
      setUploadError(err.message || 'Preview upload failed.');
      setProcessingState('error');
    }
  };

  // Start workflow from Step 2 to Step 3
  const handleStartProcessing = () => {
    const { valid } = validateConfiguration();
    if (!valid) return;
    runPreviewGeneration();
  };

  // Retry Preview Generation
  const handleRetryGeneration = () => {
    runPreviewGeneration();
  };

  // Retry Upload
  const handleRetryUpload = () => {
    runUploadProcess();
  };

  // Safe navigation handler
  const handleBackToDashboardClicked = () => {
    if (isProcessing) {
      setShowExitConfirmModal(true);
      return;
    }

    if (createdGalleryIdRef.current && activeStep < 5) {
      setShowExitConfirmModal(true);
      return;
    }

    onBackToDashboard();
  };

  // Confirm exit from modal
  const handleConfirmExit = () => {
    setShowExitConfirmModal(false);
    onBackToDashboard();
  };

  // Copy customer link
  const handleCopyCustomerLink = async () => {
    if (!completedGallery) return;
    const ok = await copyCustomerGalleryLink(completedGallery.id);
    if (ok) {
      setCopiedLink(true);
      setShareFeedback('Gallery link copied');
      setTimeout(() => setCopiedLink(false), 2500);
    } else {
      setShareFeedback('Unable to copy link. Please copy manually.');
    }
  };

  // Share customer link via Web Share API
  const handleShareCustomerLink = async () => {
    if (!completedGallery) return;
    const res = await shareCustomerGalleryLink({
      id: completedGallery.id,
      name: completedGallery.name,
    });
    if (res === 'shared') {
      setShareFeedback('Gallery link shared');
    } else if (res === 'cancelled') {
      setShareFeedback('Share cancelled');
    } else if (res === 'failed') {
      const ok = await copyCustomerGalleryLink(completedGallery.id);
      if (ok) {
        setCopiedLink(true);
        setShareFeedback('Gallery link copied');
        setTimeout(() => setCopiedLink(false), 2500);
      } else {
        setShareFeedback('Unable to share link.');
      }
    }
  };

  // Number input helper
  const parsedLimitNumber = parseInt(selectionLimit.trim(), 10);
  const isValidLimit =
    /^\d+$/.test(selectionLimit.trim()) &&
    parsedLimitNumber > 0 &&
    parsedLimitNumber <= detectedPhotos.length;

  return (
    <div
      data-processing-state={processingState}
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

      {/* Top Header Bar */}
      <header
        style={{
          height: '64px',
          background: 'rgba(12, 17, 30, 0.95)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: '#2563eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Camera size={18} color="#ffffff" />
          </div>
          <span style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff' }}>
            Photo Selection
          </span>
        </div>

        <button
          type="button"
          onClick={handleBackToDashboardClicked}
          className="btn btn-outline"
          disabled={isProcessing}
          style={{
            padding: '6px 14px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            opacity: isProcessing ? 0.5 : 1,
            cursor: isProcessing ? 'not-allowed' : 'pointer',
          }}
          id="btn-nav-back-to-dashboard"
          title={isProcessing ? 'Processing in progress...' : 'Return to Gallery Dashboard'}
        >
          <ArrowLeft size={14} />
          <span>Back to Dashboard</span>
        </button>
      </header>

      {/* Main Content Area */}
      <main
        style={{
          flex: 1,
          padding: '40px 24px 80px',
          maxWidth: '840px',
          margin: '0 auto',
          width: '100%',
        }}
      >
        {/* Header Block */}
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <h1
            style={{
              fontSize: '26px',
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}
          >
            Create New Gallery
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--text-muted)',
              marginTop: '8px',
              lineHeight: 1.5,
              maxWidth: '560px',
              margin: '8px auto 0',
            }}
          >
            Select an event folder, configure the customer selection limit, and prepare the gallery.
          </p>
        </div>

        {/* Step Indicator (Only the current step appears active) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '36px',
            flexWrap: 'wrap',
          }}
          aria-label="Creation Progress Stepper"
        >
          {STEP_LABELS.map((item, index) => {
            const isActive = activeStep === item.step;
            return (
              <div
                key={item.step}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px',
                    borderRadius: '24px',
                    background: isActive ? '#2563eb' : 'rgba(255, 255, 255, 0.04)',
                    border: `1px solid ${
                      isActive ? '#3b82f6' : 'var(--border-subtle)'
                    }`,
                    color: isActive ? '#ffffff' : 'var(--text-muted)',
                    fontWeight: isActive ? 700 : 500,
                    fontSize: '13px',
                    boxShadow: isActive ? '0 0 16px rgba(37, 99, 235, 0.35)' : 'none',
                    transition: 'all 0.2s ease',
                  }}
                  id={`step-indicator-${item.step}`}
                >
                  <span
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.1)',
                      color: isActive ? '#1d4ed8' : 'var(--text-muted)',
                      fontSize: '11px',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {item.step}
                  </span>
                  <span>{item.label}</span>
                </div>
                {index < STEP_LABELS.length - 1 && (
                  <div
                    style={{
                      width: '16px',
                      height: '1px',
                      background: 'var(--border-subtle)',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* STEP 1: SELECT FOLDER */}
        {activeStep === 1 && (
          <div
            className="card card-elevated"
            style={{
              padding: '36px 32px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-card)',
            }}
          >
            <div style={{ marginBottom: '24px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '8px',
                }}
              >
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(37, 99, 235, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <FolderOpen size={18} color="#60a5fa" />
                </div>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                    Select Event Folder
                  </h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Choose your local photo folder. Original files remain completely untouched.
                  </p>
                </div>
              </div>
            </div>

            {/* Error Message if scan failed or 0 images */}
            {scanError && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '13px',
                  marginBottom: '24px',
                }}
                id="scan-error-alert"
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{scanError}</span>
              </div>
            )}

            {/* Detected Folder Summary Card if folder already selected */}
            {folderName && detectedPhotos.length > 0 ? (
              <div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '16px',
                    marginBottom: '28px',
                  }}
                >
                  <div
                    style={{
                      background: 'rgba(9, 13, 22, 0.8)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '18px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--text-muted)',
                        fontWeight: 700,
                      }}
                    >
                      Folder
                    </span>
                    <div
                      style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        color: '#ffffff',
                        marginTop: '6px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={folderName}
                      id="detected-folder-name"
                    >
                      {folderName}
                    </div>
                  </div>

                  <div
                    style={{
                      background: 'rgba(9, 13, 22, 0.8)',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '18px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--text-muted)',
                        fontWeight: 700,
                      }}
                    >
                      Photos found
                    </span>
                    <div
                      style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        color: '#60a5fa',
                        marginTop: '6px',
                      }}
                      id="detected-photos-count"
                    >
                      {detectedPhotos.length.toLocaleString()} photos
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={handleSelectFolderClick}
                    disabled={isScanning}
                    className="btn btn-outline"
                    style={{ flex: 1, padding: '12px 20px', fontSize: '13px' }}
                    id="btn-change-folder"
                  >
                    Change Folder
                  </button>

                  <button
                    type="button"
                    onClick={handleProceedToConfigure}
                    className="btn btn-primary"
                    style={{
                      flex: 2,
                      padding: '12px 24px',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                    id="btn-proceed-to-configure"
                  >
                    <span>Continue to Configure</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div
                  style={{
                    padding: '36px 20px',
                    border: '2px dashed var(--border-medium)',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(9, 13, 22, 0.4)',
                    textAlign: 'center',
                    marginBottom: '24px',
                  }}
                >
                  <FolderOpen
                    size={40}
                    color="#60a5fa"
                    style={{ margin: '0 auto 16px', opacity: 0.9 }}
                  />
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
                    Select an Event Folder
                  </h3>
                  <p
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      maxWidth: '420px',
                      margin: '6px auto 20px',
                    }}
                  >
                    Supported formats: JPG, PNG, WebP, HEIC, and standard RAW camera files.
                  </p>

                  <button
                    type="button"
                    onClick={handleSelectFolderClick}
                    disabled={isScanning}
                    className="btn btn-primary"
                    style={{
                      padding: '12px 28px',
                      fontSize: '14px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                    id="btn-select-event-folder"
                  >
                    {isScanning ? (
                      <>
                        <RefreshCw size={16} className="spin" />
                        <span>Scanning Folder...</span>
                      </>
                    ) : (
                      <>
                        <FolderOpen size={18} />
                        <span>Select Event Folder</span>
                      </>
                    )}
                  </button>
                </div>

                <div
                  style={{
                    padding: '12px 16px',
                    background: 'rgba(15, 23, 42, 0.6)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <ShieldAlert size={16} color="#60a5fa" style={{ flexShrink: 0 }} />
                  <span>
                    Original photos remain on your computer and are completely untouched. Previews
                    are generated locally.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: CONFIGURE */}
        {activeStep === 2 && (
          <div
            className="card card-elevated"
            style={{
              padding: '36px 32px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-card)',
            }}
          >
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                Configure Gallery
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Set the customer gallery title and the exact photo selection count.
              </p>
            </div>

            {/* Validation Message */}
            {validationError && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '13px',
                  marginBottom: '20px',
                }}
                id="config-validation-alert"
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{validationError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleStartProcessing();
              }}
            >
              {/* Field 1: Gallery Name */}
              <div style={{ marginBottom: '20px' }}>
                <label
                  htmlFor="gallery-name-input"
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#e2e8f0',
                    marginBottom: '8px',
                  }}
                >
                  Gallery Name
                </label>
                <input
                  id="gallery-name-input"
                  type="text"
                  value={galleryName}
                  onChange={(e) => {
                    setGalleryName(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder="e.g. Shyam Wedding"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    fontSize: '14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(12, 17, 30, 0.9)',
                    border: '1px solid var(--border-medium)',
                    color: '#ffffff',
                    outline: 'none',
                  }}
                />
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    marginTop: '4px',
                    display: 'block',
                  }}
                >
                  Required. Enter a friendly name for your client.
                </span>
              </div>

              {/* Field 2: Customer Selection Limit */}
              <div style={{ marginBottom: '24px' }}>
                <label
                  htmlFor="customer-selection-limit-input"
                  style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#e2e8f0',
                    marginBottom: '8px',
                  }}
                >
                  Customer Selection Limit
                </label>
                <input
                  id="customer-selection-limit-input"
                  type="number"
                  min="1"
                  max={detectedPhotos.length}
                  value={selectionLimit}
                  onChange={(e) => {
                    setSelectionLimit(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder={`e.g. ${Math.min(
                    300,
                    Math.max(1, Math.round(detectedPhotos.length * 0.3))
                  )}`}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    fontSize: '14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(12, 17, 30, 0.9)',
                    border: '1px solid var(--border-medium)',
                    color: '#ffffff',
                    outline: 'none',
                  }}
                />
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    marginTop: '4px',
                    display: 'block',
                  }}
                >
                  Must be between 1 and {detectedPhotos.length.toLocaleString()} photos.
                </span>
              </div>

              {/* Summary Card */}
              <div
                style={{
                  background: 'rgba(9, 13, 22, 0.7)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '18px 20px',
                  marginBottom: '28px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  fontSize: '13px',
                }}
                id="gallery-config-summary"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Gallery:</span>
                  <strong style={{ color: '#ffffff' }}>
                    {galleryName.trim() || '—'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Photos:</span>
                  <strong style={{ color: '#ffffff' }}>
                    {detectedPhotos.length.toLocaleString()}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Customer will select:</span>
                  <strong style={{ color: isValidLimit ? '#60a5fa' : 'var(--text-muted)' }}>
                    {isValidLimit ? `${parsedLimitNumber.toLocaleString()} photos` : '—'}
                  </strong>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={handleBackToFolderSelect}
                  className="btn btn-outline"
                  style={{ flex: 1, padding: '12px 20px', fontSize: '13px' }}
                  id="btn-back-to-step1"
                >
                  Back
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    flex: 2,
                    padding: '12px 24px',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                  id="btn-continue-config"
                >
                  <span>Continue</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 3: GENERATE PREVIEWS */}
        {activeStep === 3 && (
          <div
            className="card card-elevated"
            style={{
              padding: '36px 32px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-card)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                marginBottom: '24px',
              }}
            >
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  background: isGenerating
                    ? 'rgba(37, 99, 235, 0.15)'
                    : previewError
                    ? 'rgba(239, 68, 68, 0.15)'
                    : 'rgba(16, 185, 129, 0.15)',
                  border: `1px solid ${
                    isGenerating
                      ? 'rgba(37, 99, 235, 0.3)'
                      : previewError
                      ? 'rgba(239, 68, 68, 0.3)'
                      : 'rgba(16, 185, 129, 0.3)'
                  }`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isGenerating ? (
                  <RefreshCw size={22} color="#3b82f6" className="spin" />
                ) : previewError ? (
                  <AlertTriangle size={22} color="#ef4444" />
                ) : (
                  <CheckCircle2 size={22} color="#10b981" />
                )}
              </div>

              <div>
                <h2
                  style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff' }}
                  id="preview-step-header"
                >
                  {isGenerating
                    ? 'Generating previews...'
                    : previewError
                    ? 'Preview generation failed.'
                    : 'Preview generation complete.'}
                </h2>
                <p style={{ fontSize: '13px', color: '#60a5fa', fontWeight: 600, marginTop: '2px' }}>
                  Progress: {previewProgress.processed} / {previewProgress.total}
                </p>
              </div>
            </div>

            {/* Error Message if preview generation failed */}
            {previewError && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '13px',
                  marginBottom: '24px',
                }}
                id="preview-error-alert"
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{previewError}</span>
              </div>
            )}

            {/* Progress Bar */}
            <div
              style={{
                width: '100%',
                height: '8px',
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: '4px',
                overflow: 'hidden',
                marginBottom: '12px',
              }}
            >
              <div
                style={{
                  width: `${
                    previewProgress.total > 0
                      ? (previewProgress.processed / previewProgress.total) * 100
                      : 0
                  }%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #2563eb, #60a5fa)',
                  transition: 'width 0.15s ease',
                }}
                id="preview-progress-bar"
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '12px',
                color: 'var(--text-muted)',
                marginBottom: '24px',
              }}
            >
              <span>
                {previewProgress.currentFilename ? (
                  <>
                    Processing:{' '}
                    <strong style={{ color: '#ffffff' }}>
                      {previewProgress.currentFilename}
                    </strong>
                  </>
                ) : (
                  'Preparing image files...'
                )}
              </span>
              <span style={{ fontWeight: 700, color: '#93c5fd' }}>
                {previewProgress.total > 0
                  ? ((previewProgress.processed / previewProgress.total) * 100).toFixed(1)
                  : '0.0'}
                %
              </span>
            </div>

            {/* Counters */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                background: 'rgba(9, 13, 22, 0.7)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                padding: '16px',
                fontSize: '12px',
                marginBottom: previewError ? '24px' : '0',
              }}
            >
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Generated</div>
                <div style={{ color: '#10b981', fontWeight: 700, fontSize: '18px', marginTop: '2px' }}>
                  {previewProgress.processed} / {previewProgress.total}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Remaining</div>
                <div style={{ color: '#ffffff', fontWeight: 700, fontSize: '18px', marginTop: '2px' }}>
                  {Math.max(0, previewProgress.total - previewProgress.processed)}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Failed</div>
                <div
                  style={{
                    color: previewProgress.failedCount > 0 ? '#ef4444' : 'var(--text-muted)',
                    fontWeight: 700,
                    fontSize: '18px',
                    marginTop: '2px',
                  }}
                >
                  {previewProgress.failedCount}
                </div>
              </div>
            </div>

            {/* Error Actions: Retry & Cancel */}
            {previewError && (
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={handleBackToDashboardClicked}
                  className="btn btn-outline"
                  style={{ flex: 1, padding: '12px 20px', fontSize: '13px' }}
                  id="btn-cancel-preview"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleRetryGeneration}
                  className="btn btn-primary"
                  style={{
                    flex: 2,
                    padding: '12px 24px',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                  id="btn-retry-preview"
                >
                  <RefreshCw size={16} />
                  <span>Retry</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: UPLOAD */}
        {activeStep === 4 && (
          <div
            className="card card-elevated"
            style={{
              padding: '36px 32px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-card)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                marginBottom: '24px',
              }}
            >
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  background: isUploading
                    ? 'rgba(37, 99, 235, 0.15)'
                    : uploadError
                    ? 'rgba(239, 68, 68, 0.15)'
                    : 'rgba(16, 185, 129, 0.15)',
                  border: `1px solid ${
                    isUploading
                      ? 'rgba(37, 99, 235, 0.3)'
                      : uploadError
                      ? 'rgba(239, 68, 68, 0.3)'
                      : 'rgba(16, 185, 129, 0.3)'
                  }`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isUploading ? (
                  <UploadCloud size={24} color="#3b82f6" className="spin" />
                ) : uploadError ? (
                  <AlertTriangle size={24} color="#ef4444" />
                ) : (
                  <CheckCircle2 size={24} color="#10b981" />
                )}
              </div>

              <div>
                <h2
                  style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff' }}
                  id="upload-step-header"
                >
                  {isUploading
                    ? 'Uploading previews...'
                    : uploadError
                    ? 'Preview upload failed.'
                    : 'Upload complete.'}
                </h2>
                <p style={{ fontSize: '13px', color: '#60a5fa', fontWeight: 600, marginTop: '2px' }}>
                  Progress: {uploadProgress.uploaded} / {uploadProgress.total}
                </p>
              </div>
            </div>

            {/* Upload Error Banner */}
            {uploadError && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 16px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '13px',
                  marginBottom: '24px',
                }}
                id="upload-error-alert"
              >
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Progress Bar */}
            <div
              style={{
                width: '100%',
                height: '8px',
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: '4px',
                overflow: 'hidden',
                marginBottom: '12px',
              }}
            >
              <div
                style={{
                  width: `${
                    uploadProgress.total > 0
                      ? (uploadProgress.uploaded / uploadProgress.total) * 100
                      : 0
                  }%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #2563eb, #38bdf8)',
                  transition: 'width 0.15s ease',
                }}
                id="upload-progress-bar"
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '12px',
                color: 'var(--text-muted)',
                marginBottom: '24px',
              }}
            >
              <span>
                {uploadProgress.currentFilename ? (
                  <>
                    Uploading:{' '}
                    <strong style={{ color: '#ffffff' }}>
                      {uploadProgress.currentFilename}
                    </strong>
                  </>
                ) : (
                  'Synchronizing with storage bucket...'
                )}
              </span>
              <span style={{ fontWeight: 700, color: '#38bdf8' }}>
                {uploadProgress.total > 0
                  ? ((uploadProgress.uploaded / uploadProgress.total) * 100).toFixed(1)
                  : '0.0'}
                %
              </span>
            </div>

            {/* Counters */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                background: 'rgba(9, 13, 22, 0.7)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                padding: '16px',
                fontSize: '12px',
                marginBottom: uploadError ? '24px' : '0',
              }}
            >
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Uploaded</div>
                <div style={{ color: '#10b981', fontWeight: 700, fontSize: '18px', marginTop: '2px' }}>
                  {uploadProgress.uploaded}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Remaining</div>
                <div style={{ color: '#ffffff', fontWeight: 700, fontSize: '18px', marginTop: '2px' }}>
                  {Math.max(0, uploadProgress.total - uploadProgress.uploaded)}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Failed</div>
                <div
                  style={{
                    color: uploadProgress.failed > 0 ? '#ef4444' : 'var(--text-muted)',
                    fontWeight: 700,
                    fontSize: '18px',
                    marginTop: '2px',
                  }}
                >
                  {uploadProgress.failed}
                </div>
              </div>
            </div>

            {/* Error Actions: Retry Upload & Cancel */}
            {uploadError && (
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={handleBackToDashboardClicked}
                  className="btn btn-outline"
                  style={{ flex: 1, padding: '12px 20px', fontSize: '13px' }}
                  id="btn-cancel-upload"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleRetryUpload}
                  className="btn btn-primary"
                  style={{
                    flex: 2,
                    padding: '12px 24px',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                  id="btn-retry-upload"
                >
                  <RefreshCw size={16} />
                  <span>Retry Upload</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 5: COMPLETE */}
        {activeStep === 5 && completedGallery && (
          <div
            className="card card-elevated"
            style={{
              padding: '36px 32px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-card)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                marginBottom: '24px',
              }}
            >
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CheckCircle2 size={24} color="#10b981" />
              </div>

              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff' }}>
                  Gallery Ready
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      background: 'rgba(16, 185, 129, 0.2)',
                      color: '#10b981',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                    }}
                  >
                    Active
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    All WebP previews stored in <code style={{ color: '#93c5fd' }}>photo-previews</code>
                  </span>
                </div>
              </div>
            </div>

            {/* Gallery Details Card */}
            <div
              style={{
                background: 'rgba(9, 13, 22, 0.7)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                fontSize: '13px',
                marginBottom: '24px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Gallery:</span>
                <strong style={{ color: '#ffffff' }}>{completedGallery.name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Photos:</span>
                <strong style={{ color: '#ffffff' }}>
                  {completedGallery.totalPhotos.toLocaleString()}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Customer Selection:</span>
                <strong style={{ color: '#60a5fa' }}>
                  {completedGallery.selectionLimit.toLocaleString()} photos
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                <strong style={{ color: '#10b981' }}>Active</strong>
              </div>
            </div>

            {/* Customer Link Box */}
            <div
              style={{
                padding: '18px',
                background: 'rgba(37, 99, 235, 0.08)',
                border: '1px solid rgba(37, 99, 235, 0.25)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '28px',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#93c5fd',
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <ExternalLink size={14} />
                <span>Customer Link</span>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  readOnly
                  value={getCustomerGalleryUrl(completedGallery.id)}
                  style={{
                    flex: '1 1 220px',
                    minWidth: 0,
                    padding: '10px 12px',
                    fontSize: '13px',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    outline: 'none',
                    textOverflow: 'ellipsis',
                  }}
                  id="customer-link-input"
                />
                <button
                  type="button"
                  onClick={handleCopyCustomerLink}
                  className="btn btn-secondary"
                  style={{
                    padding: '10px 16px',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap',
                  }}
                  id="btn-copy-customer-link-complete"
                >
                  {copiedLink ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
                </button>
                {hasWebShare && (
                  <button
                    type="button"
                    onClick={handleShareCustomerLink}
                    className="btn btn-outline"
                    style={{
                      padding: '10px 16px',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap',
                    }}
                    id="btn-share-customer-link-complete"
                  >
                    <Share2 size={14} />
                    <span>Share</span>
                  </button>
                )}
              </div>
              {shareFeedback && (
                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '12px',
                    color: shareFeedback.includes('Unable') ? '#f87171' : '#10b981',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Check size={13} />
                  <span>{shareFeedback}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button
                type="button"
                onClick={() => onOpenCustomerGallery(completedGallery.id)}
                className="btn btn-outline"
                style={{
                  padding: '12px 20px',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
                id="btn-open-customer-gallery"
              >
                <ExternalLink size={14} />
                <span>Open Customer Gallery</span>
              </button>

              <button
                type="button"
                onClick={onBackToDashboard}
                className="btn btn-primary"
                style={{
                  padding: '12px 20px',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
                id="btn-back-to-dashboard-complete"
              >
                <span>Back to Dashboard</span>
                <ArrowRight size={14} />
              </button>

              {onOpenGalleryDetail && (
                <button
                  type="button"
                  onClick={() => onOpenGalleryDetail(completedGallery.id)}
                  className="btn btn-secondary"
                  style={{
                    gridColumn: '1 / -1',
                    padding: '10px 16px',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    marginTop: '4px',
                  }}
                  id="btn-inspect-gallery-details"
                >
                  <span>Inspect Gallery Details</span>
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Confirmation Modal: Prevent Accidental Exit */}
      {showExitConfirmModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--bg-modal-backdrop)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '20px',
          }}
        >
          <div
            className="card card-elevated"
            style={{
              maxWidth: '460px',
              width: '100%',
              padding: '28px',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: 'var(--radius-md)',
              background: '#0e1424',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={20} color="#ef4444" />
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#ffffff' }}>
                {isProcessing
                  ? 'Processing in Progress'
                  : 'Gallery Created in Supabase'}
              </h3>
            </div>

            <p
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                marginBottom: '24px',
              }}
            >
              {isProcessing
                ? 'Processing is still in progress. Leaving now may interrupt the gallery creation.'
                : 'A gallery record has already been created in Supabase. Returning to the dashboard will keep the existing record.'}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowExitConfirmModal(false)}
                className="btn btn-outline"
                style={{ padding: '8px 16px', fontSize: '13px' }}
                id="btn-modal-stay"
              >
                Stay on Page
              </button>
              <button
                type="button"
                onClick={handleConfirmExit}
                className="btn btn-danger"
                style={{ padding: '8px 16px', fontSize: '13px' }}
                id="btn-modal-leave"
              >
                Leave Anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CreateGalleryWorkflow;
