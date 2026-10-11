import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Camera,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Check,
  ShieldAlert,
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Image as ImageIcon,
  Lock,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface CustomerGalleryProps {
  galleryId: string;
  onBack?: () => void;
}

interface GalleryData {
  id: string;
  name: string;
  selection_limit: number;
  total_photos: number;
  status: string;
}

interface PhotoItem {
  id: string;
  gallery_id: string;
  sort_order: number;
  webp_storage_path: string | null;
  signedUrl?: string;
}

export function CustomerGallery({ galleryId, onBack }: CustomerGalleryProps) {
  // Gallery & Photos State
  const [gallery, setGallery] = useState<GalleryData | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());

  // Loading & Route States
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [notActive, setNotActive] = useState<boolean>(false);
  const [isCleanedUp, setIsCleanedUp] = useState<boolean>(false);
  const [isReadOnly, setIsReadOnly] = useState<boolean>(false);
  const [readOnlyMessage, setReadOnlyMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Selection Warnings & Modal States
  const [limitWarning, setLimitWarning] = useState<string | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  // Lightbox Modal State
  const [activeLightboxIndex, setActiveLightboxIndex] = useState<number | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  // Auto-dismiss limit warning after 4.5 seconds
  useEffect(() => {
    if (limitWarning) {
      const timer = setTimeout(() => setLimitWarning(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [limitWarning]);

  // Load Gallery Data & Existing Database Selections
  useEffect(() => {
    let isMounted = true;

    async function loadGalleryData() {
      if (!isSupabaseConfigured || !supabase) {
        setErrorMessage('Supabase is not configured.');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setNotFound(false);
      setNotActive(false);
      setIsCleanedUp(false);
      setIsReadOnly(false);
      setErrorMessage(null);

      try {
        // 1. Fetch gallery row
        const { data: galleryRow, error: galleryError } = await supabase
          .from('galleries')
          .select('id, name, selection_limit, total_photos, status')
          .eq('id', galleryId)
          .maybeSingle();

        if (galleryError) {
          throw new Error(`Database error: ${galleryError.message}`);
        }

        if (!galleryRow) {
          if (isMounted) setNotFound(true);
          return;
        }

        // Handle Inactive and Read-Only Gallery States
        if (galleryRow.status === 'draft' || galleryRow.status === 'processing') {
          if (isMounted) {
            setGallery(galleryRow);
            setNotActive(true);
          }
          return;
        }

        if (
          galleryRow.status === 'submitted' ||
          galleryRow.status === 'completed' ||
          galleryRow.status === 'archived'
        ) {
          if (isMounted) {
            setIsReadOnly(true);
            setReadOnlyMessage(
              galleryRow.status === 'submitted'
                ? 'Selection Submitted — Your choices are locked and cannot be changed.'
                : galleryRow.status === 'completed'
                ? 'This gallery has been completed by the photographer and is locked for selection.'
                : 'This gallery is archived and is read-only.'
            );
          }
        }

        if (isMounted) setGallery(galleryRow);

        // 2. Fetch photos belonging to this gallery
        const { data: photosRows, error: photosError } = await supabase
          .from('photos')
          .select('id, gallery_id, sort_order, webp_storage_path')
          .eq('gallery_id', galleryId)
          .order('sort_order', { ascending: true });

        if (photosError) {
          throw new Error(`Database error loading photos: ${photosError.message}`);
        }

        if (!photosRows || photosRows.length === 0) {
          if (isMounted) {
            setPhotos([]);
            if (galleryRow.status === 'completed' || galleryRow.status === 'archived') {
              setIsCleanedUp(true);
            }
          }
          return;
        }

        // 3. Batch generate temporary signed URLs for private WebP previews
        const validPaths = photosRows
          .map((p) => p.webp_storage_path)
          .filter((p): p is string => Boolean(p));

        const signedUrlMap = new Map<string, string>();

        if (validPaths.length > 0) {
          const { data: signedData, error: signedError } = await supabase.storage
            .from('photo-previews')
            .createSignedUrls(validPaths, 3600); // 1 hour expiration

          if (signedError) {
            console.warn('Signed URLs batch generation error:', signedError);
          } else if (signedData) {
            signedData.forEach((item) => {
              if (item.signedUrl && item.path) {
                signedUrlMap.set(item.path, item.signedUrl);
              }
            });
          }
        }

        const enrichedPhotos: PhotoItem[] = photosRows.map((p) => ({
          ...p,
          signedUrl: p.webp_storage_path ? signedUrlMap.get(p.webp_storage_path) : undefined,
        }));

        if (isMounted) {
          setPhotos(enrichedPhotos);
        }

        // 4. Load existing database selections (DATABASE IS THE SOURCE OF TRUTH)
        // Query selections using gallery_id + photo_id
        const { data: existingSelections, error: selError } = await supabase
          .from('selections')
          .select('gallery_id, photo_id')
          .eq('gallery_id', galleryId);

        if (selError) {
          console.warn('Error fetching existing selections from Supabase:', selError);
          if (isMounted) {
            setErrorMessage('Unable to verify existing selections from server.');
          }
        } else if (existingSelections && isMounted) {
          const dbSelectedSet = new Set<string>(existingSelections.map((s) => s.photo_id));
          if (dbSelectedSet.size > 0) {
            // Rebuild selected photo Set from database records
            setSelectedPhotoIds(dbSelectedSet);
            // Clean up unneeded local draft when database already has persisted selections
            try {
              localStorage.removeItem(`photo_selection_draft_${galleryId}`);
            } catch {
              // Ignore localStorage errors
            }
          } else if (galleryRow.status === 'active') {
            // If database has 0 selections and gallery is active, recover unsubmitted draft from localStorage
            try {
              const savedDraft = localStorage.getItem(`photo_selection_draft_${galleryId}`);
              if (savedDraft) {
                const parsed = JSON.parse(savedDraft);
                if (Array.isArray(parsed)) {
                  const validPhotoIds = new Set(photosRows.map((p) => p.id));
                  const recovered = new Set<string>();
                  for (const pid of parsed) {
                    if (typeof pid === 'string' && validPhotoIds.has(pid)) {
                      if (recovered.size < galleryRow.selection_limit) {
                        recovered.add(pid);
                      }
                    }
                  }
                  if (recovered.size > 0) {
                    setSelectedPhotoIds(recovered);
                  }
                }
              }
            } catch (draftErr) {
              console.warn('Error recovering draft selections:', draftErr);
            }
          }
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('Error loading customer gallery:', err);
          setErrorMessage(err.message || 'An unexpected error occurred.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadGalleryData();

    return () => {
      isMounted = false;
    };
  }, [galleryId]);

  // Handle Photo Selection Toggle with Exact Limit Guard
  const handleTogglePhoto = useCallback(
    (photoId: string) => {
      if (isSubmitted || isReadOnly || !gallery) return;

      setLimitWarning(null);

      setSelectedPhotoIds((prev) => {
        const next = new Set(prev);
        if (next.has(photoId)) {
          next.delete(photoId);
        } else {
          if (next.size >= gallery.selection_limit) {
            setLimitWarning(
              `Selection limit reached. You can select a maximum of ${gallery.selection_limit} photos.`
            );
            return prev;
          }
          next.add(photoId);
        }

        // Persist in-progress unsubmitted draft to localStorage
        try {
          if (next.size > 0) {
            localStorage.setItem(
              `photo_selection_draft_${gallery.id}`,
              JSON.stringify(Array.from(next))
            );
          } else {
            localStorage.removeItem(`photo_selection_draft_${gallery.id}`);
          }
        } catch {
          // Ignore localStorage errors (e.g. private browsing restrictions)
        }

        return next;
      });
    },
    [isSubmitted, isReadOnly, gallery]
  );

  // Lightbox Keyboard Navigation
  useEffect(() => {
    if (activeLightboxIndex === null) return;

    // Prevent body background scroll while lightbox is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveLightboxIndex(null);
      } else if (e.key === 'ArrowLeft') {
        setActiveLightboxIndex((prev) =>
          prev !== null && prev > 0 ? prev - 1 : photos.length - 1
        );
      } else if (e.key === 'ArrowRight') {
        setActiveLightboxIndex((prev) =>
          prev !== null && prev < photos.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        const currentPhoto = photos[activeLightboxIndex];
        if (currentPhoto) {
          handleTogglePhoto(currentPhoto.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [activeLightboxIndex, photos, handleTogglePhoto]);

  // Open Confirmation Modal (Blocked if below exact limit)
  const handleOpenSubmitModal = () => {
    if (!gallery || isSubmitted || isReadOnly || isSubmitting) return;

    if (selectedPhotoIds.size !== gallery.selection_limit) {
      setLimitWarning(
        `Please select exactly ${gallery.selection_limit} photos before submitting.`
      );
      return;
    }

    setShowSubmitModal(true);
  };

  // Submit Selections to Database
  const handleSubmitSelections = async () => {
    if (!gallery || isSubmitted || isReadOnly || !supabase || isSubmitting) return;

    // Strict exact count validation
    if (selectedPhotoIds.size !== gallery.selection_limit) {
      setErrorMessage(
        `Please select exactly ${gallery.selection_limit} photos before submitting.`
      );
      setShowSubmitModal(false);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // 1. Check existing selections in Supabase first (prevents duplicate retry records)
      const { data: existingInDb, error: fetchExistingErr } = await supabase
        .from('selections')
        .select('photo_id')
        .eq('gallery_id', gallery.id);

      if (fetchExistingErr) {
        throw new Error(`Network error checking selections: ${fetchExistingErr.message}`);
      }

      const existingIds = new Set((existingInDb || []).map((r) => r.photo_id));
      const rowsToInsert = Array.from(selectedPhotoIds)
        .filter((id) => !existingIds.has(id))
        .map((photoId) => ({
          gallery_id: gallery.id,
          photo_id: photoId,
        }));

      // 2. Insert missing selections if any
      if (rowsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('selections')
          .insert(rowsToInsert);

        if (insertError) {
          throw new Error(`Failed to submit selections: ${insertError.message}`);
        }
      }

      // 3. Transition gallery status to 'submitted' via secure database RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc('submit_gallery', {
        p_gallery_id: gallery.id,
      });

      if (rpcError) {
        if (rpcError.code === 'PGRST202') {
          // Fallback if submit_gallery RPC is pending in SQL Editor
          console.warn('Notice: submit_gallery RPC not found in schema cache, using direct update fallback:', rpcError.message);
          const { error: statusError } = await supabase
            .from('galleries')
            .update({ status: 'submitted' })
            .eq('id', gallery.id);

          if (statusError) {
            throw new Error(`Failed to update gallery status: ${statusError.message}`);
          }
        } else {
          throw new Error(`Failed to submit gallery: ${rpcError.message}`);
        }
      } else if (rpcData && rpcData.success === false) {
        throw new Error(rpcData.error || 'Failed to submit gallery selections.');
      }

      // 4. Clean up local unsubmitted draft upon confirmed persistence
      try {
        localStorage.removeItem(`photo_selection_draft_${gallery.id}`);
      } catch {
        // Ignore
      }

      setGallery((prev) => (prev ? { ...prev, status: 'submitted' } : null));
      setIsReadOnly(true);
      setReadOnlyMessage('This gallery is no longer accepting selections.');
      setIsSubmitted(true);
      setShowSubmitModal(false);
    } catch (err: any) {
      console.error('Error submitting selections:', err);
      // NEVER silently show action as successfully saved: keep isSubmitted false
      setIsSubmitted(false);
      // Keep selected state in memory so the customer does not lose selection
      setErrorMessage(
        err.message || 'Unable to submit your selection due to a network error. Please try again.'
      );
      setShowSubmitModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Image load error fallback tracker
  const handleImageError = (photoId: string) => {
    setFailedImages((prev) => new Set(prev).add(photoId));
  };

  // Computed metrics
  const selectedCount = selectedPhotoIds.size;
  const targetLimit = gallery?.selection_limit || 0;
  const isTargetReached = targetLimit > 0 && selectedCount === targetLimit;
  const remainingCount = Math.max(0, targetLimit - selectedCount);

  const progressPercentage = useMemo(() => {
    if (targetLimit <= 0) return 0;
    const pct = (selectedCount / targetLimit) * 100;
    return Math.min(100, Math.max(0, pct));
  }, [selectedCount, targetLimit]);

  // LOADING STATE
  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--bg-app)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <RefreshCw size={36} color="#3b82f6" className="spin" />
        <span style={{ fontSize: '15px', color: 'var(--text-muted)', fontWeight: 600 }}>
          Loading gallery...
        </span>
      </div>
    );
  }

  // GALLERY NOT FOUND STATE
  if (notFound) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--bg-app)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div
          className="card"
          style={{
            maxWidth: '480px',
            width: '100%',
            padding: '40px 32px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ShieldAlert size={28} color="#ef4444" />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff' }}>
            Gallery not found.
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            The requested photo gallery does not exist or may have been removed. Please check the link.
          </p>
          {onBack && (
            <button
              onClick={onBack}
              className="btn btn-secondary"
              style={{ marginTop: '12px', padding: '10px 20px', fontSize: '13px' }}
            >
              Return to Studio
            </button>
          )}
        </div>
      </div>
    );
  }

  // GALLERY NOT ACTIVE YET
  if (notActive) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--bg-app)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div
          className="card"
          style={{
            maxWidth: '480px',
            width: '100%',
            padding: '40px 32px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AlertTriangle size={28} color="#f59e0b" />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff' }}>
            This gallery is not currently available for selection.
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            The photographer is still preparing the photos for this gallery. Please check back later.
          </p>
          {onBack && (
            <button
              onClick={onBack}
              className="btn btn-secondary"
              style={{ marginTop: '12px', padding: '10px 20px', fontSize: '13px' }}
            >
              Return to Studio
            </button>
          )}
        </div>
      </div>
    );
  }

  // GALLERY PREVIEW EXPIRED / CLEANED UP STATE
  if (isCleanedUp && gallery) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--bg-app)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div
          className="card card-elevated"
          style={{
            maxWidth: '520px',
            width: '100%',
            padding: '44px 36px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '18px',
          }}
          id="gallery-preview-expired-card"
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(96, 165, 250, 0.12)',
              border: '1px solid rgba(96, 165, 250, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CheckCircle2 size={36} color="#60a5fa" />
          </div>

          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
            Gallery preview has expired
          </h2>

          <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: 1.6, maxWidth: '420px', margin: 0 }}>
            This event&apos;s photo selection has been completed and cloud previews have been securely cleaned up.
          </p>

          <div
            style={{
              marginTop: '8px',
              padding: '16px 20px',
              background: 'rgba(9, 13, 22, 0.7)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-sm)',
              width: '100%',
              fontSize: '13px',
              color: 'var(--text-muted)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              textAlign: 'left',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Event:</span>
              <strong style={{ color: '#ffffff' }}>{gallery.name}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Status:</span>
              <strong style={{ color: '#10b981' }}>✓ Completed</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Cloud Previews:</span>
              <strong style={{ color: '#94a3b8' }}>☁ Cloud previews deleted</strong>
            </div>
          </div>

          {onBack && (
            <button
              onClick={onBack}
              className="btn btn-secondary"
              style={{ marginTop: '12px', padding: '10px 20px', fontSize: '13px' }}
            >
              Return to Studio
            </button>
          )}
        </div>
      </div>
    );
  }

  // SUCCESS CONFIRMATION SCREEN
  if (isSubmitted && gallery) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--bg-app)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div
          className="card card-elevated"
          style={{
            maxWidth: '520px',
            width: '100%',
            padding: '44px 36px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '18px',
          }}
          id="customer-submission-success-card"
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CheckCircle2 size={36} color="#10b981" />
          </div>

          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
            Selection Submitted Successfully
          </h2>

          <p style={{ fontSize: '16px', color: '#60a5fa', fontWeight: 700, margin: 0 }}>
            {gallery.selection_limit} / {gallery.selection_limit} photos selected
          </p>

          <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '420px', margin: 0 }}>
            Your selection has been submitted to the photographer. Your choices are now locked and can no longer be changed.
          </p>

          <div
            style={{
              marginTop: '8px',
              padding: '16px 20px',
              background: 'rgba(9, 13, 22, 0.7)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-sm)',
              width: '100%',
              fontSize: '13px',
              color: 'var(--text-muted)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              textAlign: 'left',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Gallery:</span>
              <strong style={{ color: '#ffffff' }}>{gallery.name}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Photos Selected:</span>
              <strong style={{ color: '#10b981' }}>{gallery.selection_limit} photos (Complete)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Status:</span>
              <strong style={{ color: '#a855f7' }}>Submitted (Locked)</strong>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsSubmitted(false)}
            className="btn btn-outline"
            style={{ marginTop: '12px', padding: '10px 24px', fontSize: '13px' }}
            id="btn-view-submitted-gallery"
          >
            View Gallery & Selections
          </button>
        </div>
      </div>
    );
  }

  if (!gallery) return null;

  const currentLightboxPhoto =
    activeLightboxIndex !== null ? photos[activeLightboxIndex] : null;
  const isCurrentLightboxPhotoSelected =
    currentLightboxPhoto ? selectedPhotoIds.has(currentLightboxPhoto.id) : false;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-app)',
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
        maxWidth: '100%',
      }}
    >
      {/* 1. CUSTOMER HEADER */}
      <header
        style={{
          background: 'rgba(12, 17, 30, 0.95)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '24px 28px 20px',
          position: 'sticky',
          top: 0,
          zIndex: 40,
        }}
      >
        <div
          style={{
            maxWidth: '1440px',
            margin: '0 auto',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* Top Row: Gallery Title & Counter */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div>
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
                <h1
                  style={{
                    fontSize: '22px',
                    fontWeight: 800,
                    color: '#ffffff',
                    letterSpacing: '-0.02em',
                  }}
                  id="customer-gallery-title"
                >
                  {gallery.name}
                </h1>
              </div>
              <p
                style={{
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  marginTop: '4px',
                  marginLeft: '42px',
                }}
              >
                Select your favorite photos
              </p>
            </div>

            {/* Counter & Meta */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  background: 'rgba(255, 255, 255, 0.04)',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                }}
                id="customer-gallery-total-photos"
              >
                {photos.length.toLocaleString()} photos
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-sm)',
                  background: isReadOnly
                    ? 'rgba(168, 85, 247, 0.15)'
                    : isTargetReached
                    ? 'rgba(16, 185, 129, 0.15)'
                    : 'rgba(37, 99, 235, 0.12)',
                  border: `1px solid ${
                    isReadOnly
                      ? 'rgba(168, 85, 247, 0.35)'
                      : isTargetReached
                      ? 'rgba(16, 185, 129, 0.35)'
                      : 'rgba(37, 99, 235, 0.3)'
                  }`,
                }}
                id="customer-selection-counter-badge"
              >
                <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Selected:
                </span>
                <span
                  style={{
                    fontSize: '16px',
                    fontWeight: 800,
                    color: isReadOnly ? '#a855f7' : isTargetReached ? '#10b981' : '#60a5fa',
                  }}
                  id="customer-selection-counter-text"
                >
                  {selectedCount} / {gallery.selection_limit}
                  {isReadOnly && (
                    <span style={{ fontSize: '11px', marginLeft: '6px', fontWeight: 700, color: '#c084fc' }}>
                      (Finalized)
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* 2. SELECTION PROGRESS BAR */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '12px',
                marginBottom: '6px',
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  color: isReadOnly ? '#c084fc' : isTargetReached ? '#10b981' : '#94a3b8',
                }}
                id="selection-status-label"
              >
                {isReadOnly
                  ? 'Selection submitted & locked (read-only)'
                  : isTargetReached
                  ? 'Selection complete'
                  : `Select ${remainingCount} more photo${remainingCount === 1 ? '' : 's'}`}
              </span>
              <span style={{ fontWeight: 800, color: isReadOnly ? '#c084fc' : isTargetReached ? '#10b981' : '#60a5fa' }}>
                {progressPercentage.toFixed(1)}%
              </span>
            </div>

            <div
              style={{
                width: '100%',
                height: '7px',
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${progressPercentage}%`,
                  height: '100%',
                  background: isReadOnly
                    ? 'linear-gradient(90deg, #9333ea, #c084fc)'
                    : isTargetReached
                    ? '#10b981'
                    : 'linear-gradient(90deg, #2563eb, #60a5fa)',
                  transition: 'width 0.2s ease',
                }}
                id="selection-progress-bar-fill"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Read-Only State Banner */}
      {isReadOnly && (
        <div
          style={{
            background: 'rgba(168, 85, 247, 0.15)',
            borderBottom: '1px solid rgba(168, 85, 247, 0.35)',
            padding: '12px 28px',
            color: '#e9d5ff',
            fontSize: '13px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
          id="gallery-readonly-banner"
        >
          <Lock size={15} color="#c084fc" />
          <span>{readOnlyMessage || 'This gallery is locked for selection.'}</span>
        </div>
      )}

      {/* Floating Limit Warning Banner */}
      {limitWarning && (
        <div
          style={{
            position: 'sticky',
            top: '120px',
            zIndex: 45,
            background: 'rgba(239, 68, 68, 0.96)',
            color: '#ffffff',
            padding: '12px 24px',
            fontSize: '13px',
            fontWeight: 700,
            textAlign: 'center',
            boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
          id="customer-limit-warning-banner"
        >
          <AlertCircle size={16} />
          <span>{limitWarning}</span>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div
          style={{
            maxWidth: '1440px',
            margin: '16px auto 0',
            width: 'calc(100% - 56px)',
            padding: '12px 18px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
          id="customer-error-banner"
        >
          <AlertCircle size={16} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 3. PHOTO GRID */}
      <main
        style={{
          flex: 1,
          padding: '32px 28px 120px',
          maxWidth: '1440px',
          margin: '0 auto',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '20px',
          }}
          id="customer-photo-grid"
        >
          {photos.map((photo, index) => {
            const isSelected = selectedPhotoIds.has(photo.id);
            const isImageFailed = failedImages.has(photo.id);

            return (
              <div
                key={photo.id}
                onClick={() => {
                  if (isReadOnly) {
                    setActiveLightboxIndex(index);
                  } else {
                    handleTogglePhoto(photo.id);
                  }
                }}
                style={{
                  position: 'relative',
                  aspectRatio: '1',
                  background: 'rgba(15, 23, 42, 0.85)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  border: isSelected
                    ? isReadOnly
                      ? '2px solid #10b981'
                      : '2px solid #3b82f6'
                    : '1px solid var(--border-medium)',
                  boxShadow: isSelected
                    ? isReadOnly
                      ? '0 0 16px rgba(16, 185, 129, 0.4)'
                      : '0 0 18px rgba(59, 130, 246, 0.45)'
                    : '0 2px 8px rgba(0, 0, 0, 0.3)',
                  transition: 'border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease',
                  userSelect: 'none',
                }}
                className="customer-photo-card"
                id={`photo-card-${index}`}
                data-photo-id={photo.id}
                data-selected={isSelected}
              >
                {/* Photo Thumbnail */}
                {photo.signedUrl && !isImageFailed ? (
                  <img
                    src={photo.signedUrl}
                    alt={`Photo #${index + 1}`}
                    loading="lazy"
                    onError={() => handleImageError(photo.id)}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      background: '#040711',
                      filter: isSelected ? 'brightness(1.04)' : 'brightness(0.92)',
                      transition: 'filter 0.15s ease',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      background: 'rgba(9, 13, 22, 0.9)',
                      color: 'var(--text-muted)',
                      fontSize: '12px',
                    }}
                  >
                    <ImageIcon size={24} style={{ opacity: 0.5 }} />
                    <span>{isImageFailed ? 'Image unavailable' : 'Loading preview...'}</span>
                  </div>
                )}

                {/* Photo Number / Order Tag */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '10px',
                    left: '10px',
                    background: 'rgba(0, 0, 0, 0.75)',
                    backdropFilter: 'blur(4px)',
                    color: '#e2e8f0',
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    pointerEvents: 'none',
                  }}
                >
                  #{index + 1}
                </div>

                {/* Enlarge / Preview Button (Opens Lightbox) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveLightboxIndex(index);
                  }}
                  title="Open larger preview"
                  style={{
                    position: 'absolute',
                    bottom: '10px',
                    right: '10px',
                    background: 'rgba(12, 17, 30, 0.85)',
                    backdropFilter: 'blur(6px)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '5px 9px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    zIndex: 2,
                  }}
                  id={`btn-preview-photo-${index}`}
                >
                  <Maximize2 size={12} />
                  <span>Preview</span>
                </button>

                {/* Selection Indicator Checkbox / Badge (Top-Right) */}
                {!isReadOnly ? (
                  <div
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '10px',
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: isSelected ? '#2563eb' : 'rgba(0, 0, 0, 0.65)',
                      border: `2px solid ${
                        isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.5)'
                      }`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s ease',
                      zIndex: 2,
                    }}
                    id={`photo-check-${index}`}
                  >
                    {isSelected && <Check size={18} color="#ffffff" strokeWidth={3} />}
                  </div>
                ) : isSelected ? (
                  <div
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '10px',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: '#10b981',
                      border: '2px solid #ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 2,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                    }}
                    id={`photo-selected-badge-${index}`}
                    title="Selected photo (Locked)"
                  >
                    <Check size={16} color="#ffffff" strokeWidth={3} />
                  </div>
                ) : null}

                {/* Selected Overlay Tint */}
                {isSelected && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: isReadOnly
                        ? 'rgba(16, 185, 129, 0.08)'
                        : 'rgba(37, 99, 235, 0.12)',
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* 8. STICKY SELECTION BAR */}
      {!isReadOnly && (
        <aside
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 40,
            background: 'rgba(12, 17, 30, 0.95)',
            backdropFilter: 'blur(16px)',
            borderTop: '1px solid var(--border-medium)',
            padding: '16px 28px',
            boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.5)',
          }}
          aria-label="Selection Submission Bar"
        >
          <div
            style={{
              maxWidth: '1440px',
              margin: '0 auto',
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            {/* Status & Counter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Selected:
                  </span>
                  <strong
                    style={{
                      fontSize: '18px',
                      color: isTargetReached ? '#10b981' : '#60a5fa',
                    }}
                    id="sticky-selection-counter"
                  >
                    {selectedCount} / {gallery.selection_limit}
                  </strong>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {isTargetReached
                    ? 'Ready for submission'
                    : `Select ${remainingCount} more photo${remainingCount === 1 ? '' : 's'}`}
                </div>
              </div>
            </div>

            {/* Submit Selection Action Button */}
            <button
              type="button"
              onClick={handleOpenSubmitModal}
              disabled={!isTargetReached || isSubmitting}
              className={`btn ${isTargetReached ? 'btn-primary' : 'btn-outline'}`}
              style={{
                padding: '12px 28px',
                fontSize: '14px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                minWidth: '200px',
                opacity: isTargetReached ? 1 : 0.5,
                cursor: isTargetReached && !isSubmitting ? 'pointer' : 'not-allowed',
              }}
              id="btn-sticky-submit-selection"
              title={
                !isTargetReached
                  ? `Select exactly ${gallery.selection_limit} photos to enable submission`
                  : 'Submit selected photos'
              }
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={16} className="spin" />
                  <span>Submitting selection...</span>
                </>
              ) : (
                <>
                  <span>Submit Selection</span>
                  <Check size={16} />
                </>
              )}
            </button>
          </div>
        </aside>
      )}

      {/* 6. FULL-SCREEN PHOTO PREVIEW (LIGHTBOX) */}
      {activeLightboxIndex !== null && currentLightboxPhoto && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(3, 5, 9, 0.96)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            flexDirection: 'column',
          }}
          role="dialog"
          aria-modal="true"
          id="customer-photo-lightbox"
        >
          {/* Lightbox Top Header Bar */}
          <div
            style={{
              padding: '16px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(12, 17, 30, 0.8)',
            }}
          >
            {/* Photo Index Info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
                Photo {activeLightboxIndex + 1} of {photos.length}
              </span>

              {/* Selected / Not Selected Badge */}
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '3px 10px',
                  borderRadius: '12px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  background: isCurrentLightboxPhotoSelected
                    ? 'rgba(16, 185, 129, 0.2)'
                    : 'rgba(255, 255, 255, 0.08)',
                  color: isCurrentLightboxPhotoSelected ? '#10b981' : 'var(--text-muted)',
                  border: `1px solid ${
                    isCurrentLightboxPhotoSelected
                      ? 'rgba(16, 185, 129, 0.4)'
                      : 'rgba(255, 255, 255, 0.12)'
                  }`,
                }}
                id="lightbox-status-pill"
              >
                {isCurrentLightboxPhotoSelected ? 'Selected' : 'Not Selected'}
              </span>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setActiveLightboxIndex(null)}
              className="btn btn-outline"
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                borderColor: 'rgba(255, 255, 255, 0.2)',
              }}
              id="btn-close-lightbox"
              title="Close preview (Esc)"
            >
              <X size={16} />
              <span>Close</span>
            </button>
          </div>

          {/* Lightbox Stage */}
          <div
            style={{
              flex: 1,
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 60px',
              overflow: 'hidden',
            }}
          >
            {/* Previous Button */}
            <button
              type="button"
              onClick={() =>
                setActiveLightboxIndex((prev) =>
                  prev !== null && prev > 0 ? prev - 1 : photos.length - 1
                )
              }
              style={{
                position: 'absolute',
                left: '20px',
                zIndex: 10,
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              id="btn-lightbox-prev"
              title="Previous photo (Left Arrow)"
            >
              <ChevronLeft size={24} />
            </button>

            {/* Active Photo Container */}
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {currentLightboxPhoto.signedUrl ? (
                <img
                  src={currentLightboxPhoto.signedUrl}
                  alt={`Photo #${activeLightboxIndex + 1}`}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    borderRadius: '8px',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
                  }}
                  id="lightbox-main-image"
                />
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                  Preview unavailable
                </div>
              )}
            </div>

            {/* Next Button */}
            <button
              type="button"
              onClick={() =>
                setActiveLightboxIndex((prev) =>
                  prev !== null && prev < photos.length - 1 ? prev + 1 : 0
                )
              }
              style={{
                position: 'absolute',
                right: '20px',
                zIndex: 10,
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              id="btn-lightbox-next"
              title="Next photo (Right Arrow)"
            >
              <ChevronRight size={24} />
            </button>
          </div>

          {/* 7. LIGHTBOX BOTTOM CONTROLS & SELECTION ACTION */}
          <div
            style={{
              padding: '16px 24px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(12, 17, 30, 0.95)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            {/* Counter inside lightbox */}
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Selected:{' '}
              <strong style={{ color: isTargetReached ? '#10b981' : '#60a5fa' }}>
                {selectedCount} / {gallery.selection_limit}
              </strong>
            </div>

            {/* Select / Deselect Action Button (or Read-only Indicator) */}
            {!isReadOnly ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => handleTogglePhoto(currentLightboxPhoto.id)}
                  className={`btn ${isCurrentLightboxPhotoSelected ? 'btn-outline' : 'btn-primary'}`}
                  style={{
                    padding: '10px 24px',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    borderColor: isCurrentLightboxPhotoSelected
                      ? 'rgba(239, 68, 68, 0.4)'
                      : undefined,
                    color: isCurrentLightboxPhotoSelected ? '#f87171' : undefined,
                  }}
                  id="btn-lightbox-toggle-select"
                >
                  {isCurrentLightboxPhotoSelected ? (
                    <>
                      <X size={15} />
                      <span>Deselect Photo</span>
                    </>
                  ) : (
                    <>
                      <Check size={15} />
                      <span>Select Photo</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: isCurrentLightboxPhotoSelected ? '#10b981' : 'var(--text-muted)',
                  fontSize: '13px',
                  fontWeight: 700,
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: isCurrentLightboxPhotoSelected
                    ? 'rgba(16, 185, 129, 0.12)'
                    : 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${
                    isCurrentLightboxPhotoSelected
                      ? 'rgba(16, 185, 129, 0.3)'
                      : 'rgba(255, 255, 255, 0.1)'
                  }`,
                }}
                id="lightbox-readonly-status"
              >
                <Lock size={14} />
                <span>
                  {isCurrentLightboxPhotoSelected
                    ? 'Selected (Locked)'
                    : 'Not Selected (Locked)'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 9. SUBMIT CONFIRMATION MODAL */}
      {showSubmitModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'var(--bg-modal-backdrop)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
            padding: '20px',
          }}
          role="dialog"
          aria-modal="true"
          id="submit-confirmation-modal"
        >
          <div
            className="card card-elevated"
            style={{
              maxWidth: '460px',
              width: '100%',
              padding: '32px 28px',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-md)',
              background: '#0d1322',
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
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: 'rgba(37, 99, 235, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <CheckCircle2 size={22} color="#3b82f6" />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                Submit your selection?
              </h3>
            </div>

            <p
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
                marginBottom: '24px',
              }}
            >
              You have selected {gallery.selection_limit} photos. After submission, your selection
              will be sent to the photographer.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                disabled={isSubmitting}
                className="btn btn-outline"
                style={{ padding: '9px 18px', fontSize: '13px' }}
                id="btn-cancel-submit-modal"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitSelections}
                disabled={isSubmitting}
                className="btn btn-primary"
                style={{ padding: '9px 20px', fontSize: '13px' }}
                id="btn-confirm-submit-modal"
              >
                {isSubmitting ? 'Submitting selection...' : 'Submit Selection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomerGallery;
