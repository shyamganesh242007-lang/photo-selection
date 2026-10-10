import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  Circle,
  Maximize2,
  Lock,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Search,
  Send,
  Camera,
  Info,
  Grid,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import type { Gallery, Photo } from '../../types';
import { dbService } from '../../services/database/LocalStorageDatabaseService';
import { PhotoLightbox } from './PhotoLightbox';

interface CustomerGalleryViewProps {
  galleryId: string;
  onBackToStudio?: () => void;
}

export const CustomerGalleryView: React.FC<CustomerGalleryViewProps> = ({
  galleryId,
  onBackToStudio,
}) => {
  const [gallery, setGallery] = useState<Gallery | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters & layout
  const [viewTab, setViewTab] = useState<'all' | 'selected' | 'unselected'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [gridSize, setGridSize] = useState<'normal' | 'dense'>('normal');

  // Lightbox
  const [activeLightboxIndex, setActiveLightboxIndex] = useState<number | null>(null);

  // User alerts & feedback
  const [toastMessage, setToastMessage] = useState<{ type: 'error' | 'warning' | 'success'; text: string } | null>(null);
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    loadGalleryData();
  }, [galleryId]);

  const loadGalleryData = async () => {
    setLoading(true);
    const gal = await dbService.getGallery(galleryId);
    if (gal) {
      setGallery(gal);
      const items = await dbService.getPhotosByGallery(galleryId);
      setPhotos(items);
    }
    setLoading(false);
  };

  const showToast = (type: 'error' | 'warning' | 'success', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  const selectedCount = photos.filter((p) => p.isSelected).length;
  const isTargetMet = gallery ? selectedCount === gallery.selectionLimit : false;
  const isSubmitted = gallery ? gallery.status === 'submitted' || gallery.status === 'completed' : false;

  // Toggle selection with STRICT LIMIT CHECK
  const handleToggleSelect = async (photo: Photo) => {
    if (!gallery) return;

    if (isSubmitted) {
      showToast('warning', 'Your photo selection is locked and has already been submitted to the studio.');
      return;
    }

    const res = await dbService.togglePhotoSelection(gallery.id, photo.photoId);

    if (!res.success) {
      // RULE: Selection limit reached (e.g. 301 attempted)
      showToast('error', res.error || `Selection limit reached. You can select a maximum of ${gallery.selectionLimit} photos.`);
      return;
    }

    // Update local state
    setPhotos((prev) =>
      prev.map((p) => (p.photoId === photo.photoId ? { ...p, isSelected: res.isSelected } : p))
    );

    if (res.isSelected && res.currentCount === gallery.selectionLimit) {
      showToast('success', `Goal reached! You have selected exactly ${gallery.selectionLimit} photos. You can now submit!`);
    }
  };

  // Click Submit
  const handleClickSubmit = () => {
    if (!gallery) return;

    if (isSubmitted) {
      showToast('warning', 'Your selection is already submitted and locked.');
      return;
    }

    // STRICT VALIDATION
    if (selectedCount < gallery.selectionLimit) {
      const remaining = gallery.selectionLimit - selectedCount;
      showToast(
        'warning',
        `Please select ${remaining} more photo${remaining > 1 ? 's' : ''} before submitting. (Current: ${selectedCount} / ${gallery.selectionLimit})`
      );
      return;
    }

    if (selectedCount > gallery.selectionLimit) {
      showToast('error', `Selection limit exceeded! Maximum allowed is ${gallery.selectionLimit}.`);
      return;
    }

    // Exactly 300 / 300 -> Open submit confirmation modal
    setIsSubmitModalOpen(true);
  };

  // Confirm final submission
  const handleConfirmSubmit = async () => {
    if (!gallery) return;
    setIsSubmitting(true);

    const res = await dbService.submitCustomerSelection(gallery.id);
    if (res.success) {
      const updated = await dbService.getGallery(gallery.id);
      if (updated) setGallery(updated);

      setIsSubmitModalOpen(false);
      setIsSubmitting(false);

      // Celebrate with confetti!
      try {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#2563eb', '#10b981', '#38bdf8', '#fbbf24'],
        });
      } catch (e) {
        // ignore
      }

      showToast('success', `Success! Your selection of exactly ${gallery.selectionLimit} photos has been sent to the studio!`);
    } else {
      setIsSubmitting(false);
      showToast('error', res.error || 'Submission failed');
    }
  };

  // Filter photos
  const filteredPhotos = photos.filter((p) => {
    if (viewTab === 'selected' && !p.isSelected) return false;
    if (viewTab === 'unselected' && p.isSelected) return false;
    if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
    if (
      searchQuery &&
      !p.originalFilename.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !p.photoId.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  if (loading || !gallery) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="dot dot-blue" style={{ width: '16px', height: '16px', marginBottom: '14px' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Loading Proofing Gallery...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', display: 'flex', flexDirection: 'column' }}>
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '84px',
            right: '24px',
            zIndex: 150,
            padding: '14px 20px',
            borderRadius: 'var(--radius-sm)',
            background:
              toastMessage.type === 'error'
                ? '#1e1115'
                : toastMessage.type === 'warning'
                ? '#1e1b12'
                : '#0f1d19',
            border:
              toastMessage.type === 'error'
                ? '1px solid #ef4444'
                : toastMessage.type === 'warning'
                ? '1px solid #f59e0b'
                : '1px solid #10b981',
            color:
              toastMessage.type === 'error'
                ? '#fca5a5'
                : toastMessage.type === 'warning'
                ? '#fef08a'
                : '#6ee7b7',
            boxShadow: 'var(--shadow-xl)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            maxWidth: '440px',
            animation: 'slideUp 200ms ease',
          }}
        >
          {toastMessage.type === 'error' && <AlertCircle size={20} color="#ef4444" />}
          {toastMessage.type === 'warning' && <AlertCircle size={20} color="#f59e0b" />}
          {toastMessage.type === 'success' && <CheckCircle2 size={20} color="#10b981" />}
          <div style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.4 }}>
            {toastMessage.text}
          </div>
        </div>
      )}

      {/* CUSTOMER STICKY TOPBAR */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 80,
          background: 'rgba(9, 13, 22, 0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--border-medium)',
          padding: '0 28px',
          height: '74px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        {/* Branding & Event Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: 'var(--radius-sm)',
              background: 'linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Camera size={20} color="#ffffff" />
          </div>
          <div>
            <h1 style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {gallery.title}
            </h1>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Proofing Portal • {gallery.totalPhotos} photos total
            </div>
          </div>
        </div>

        {/* PROMINENT EXACT SELECTION COUNTER */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            background: isSubmitted
              ? 'rgba(16, 185, 129, 0.15)'
              : isTargetMet
              ? 'rgba(16, 185, 129, 0.18)'
              : 'rgba(30, 58, 138, 0.25)',
            border: isSubmitted
              ? '1px solid rgba(16, 185, 129, 0.4)'
              : isTargetMet
              ? '1px solid #10b981'
              : '1px solid rgba(59, 130, 246, 0.35)',
            padding: '8px 20px',
            borderRadius: 'var(--radius-full)',
            boxShadow: isTargetMet ? '0 0 20px rgba(16, 185, 129, 0.35)' : 'none',
          }}
          id="client-selection-counter-badge"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isSubmitted ? (
              <Lock size={16} color="#10b981" />
            ) : isTargetMet ? (
              <Sparkles size={16} color="#10b981" />
            ) : (
              <Circle size={15} color="var(--primary-500)" />
            )}

            <div style={{ fontSize: '14px', fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
              Selected: <span style={{ color: isTargetMet || isSubmitted ? '#34d399' : '#60a5fa' }}>{selectedCount}</span> / {gallery.selectionLimit}
            </div>
          </div>

          <span style={{ color: 'var(--border-strong)' }}>|</span>

          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: isSubmitted ? '#34d399' : isTargetMet ? '#34d399' : '#94a3b8',
            }}
          >
            {isSubmitted
              ? 'Selection Locked'
              : isTargetMet
              ? 'Exact Goal Reached!'
              : `${gallery.selectionLimit - selectedCount} more needed`}
          </span>
        </div>

        {/* Right Action: Submit Button or Lock Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {onBackToStudio && (
            <button
              onClick={onBackToStudio}
              className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '8px 14px' }}
            >
              <span>Back to Studio ERP</span>
            </button>
          )}

          {isSubmitted ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                padding: '9px 18px',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 700,
                fontSize: '13px',
              }}
            >
              <CheckCircle size={16} />
              <span>Selection Submitted</span>
            </div>
          ) : (
            <button
              onClick={handleClickSubmit}
              className={`btn ${isTargetMet ? 'btn-success' : 'btn-primary'}`}
              style={{
                padding: '10px 22px',
                fontSize: '13px',
                fontWeight: 700,
                boxShadow: isTargetMet ? '0 0 20px rgba(16, 185, 129, 0.4)' : undefined,
              }}
              id="btn-customer-submit-selection"
              title={
                isTargetMet
                  ? 'Submit your final photo selection'
                  : `Please select exactly ${gallery.selectionLimit} photos before submitting`
              }
            >
              <Send size={15} />
              <span>Submit Selection ({selectedCount}/{gallery.selectionLimit})</span>
            </button>
          )}
        </div>
      </header>

      {/* FILTER & CATEGORY TOOLBAR */}
      <div
        style={{
          background: 'rgba(12, 17, 30, 0.7)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '14px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        {/* Tab Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setViewTab('all')}
            className={`btn ${viewTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 14px', fontSize: '12px' }}
          >
            <span>All Photos ({photos.length})</span>
          </button>
          <button
            onClick={() => setViewTab('selected')}
            className={`btn ${viewTab === 'selected' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 14px', fontSize: '12px' }}
          >
            <CheckCircle size={13} />
            <span>Selected ({selectedCount})</span>
          </button>
          <button
            onClick={() => setViewTab('unselected')}
            className={`btn ${viewTab === 'unselected' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 14px', fontSize: '12px' }}
          >
            <span>Remaining ({photos.length - selectedCount})</span>
          </button>
        </div>

        {/* Category & Search Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search filename or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '32px', height: '34px', fontSize: '12px', width: '200px' }}
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="form-select"
            style={{ height: '34px', fontSize: '12px', width: '140px' }}
          >
            <option value="all">All Categories</option>
            <option value="Ceremony">Ceremony</option>
            <option value="Portraits">Portraits</option>
            <option value="Pre-Wedding">Pre-Wedding</option>
            <option value="Reception">Reception</option>
            <option value="Family & Guests">Family & Guests</option>
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setGridSize(gridSize === 'normal' ? 'dense' : 'normal')}
              className="btn btn-outline"
              style={{ padding: '6px 10px', height: '34px', fontSize: '12px' }}
              title="Toggle grid density"
            >
              <Grid size={14} />
              <span>{gridSize === 'normal' ? 'Dense Grid' : 'Comfortable'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* PHOTO GALLERY GRID */}
      <main style={{ flex: 1, padding: '24px 28px' }}>
        {/* Instructions banner */}
        <div
          style={{
            background: 'rgba(16, 22, 37, 0.7)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 18px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Info size={16} color="var(--primary-500)" />
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Click on the checkmark or photo card to select. Tap any photo to open full-screen preview. Limit: <strong>EXACTLY {gallery.selectionLimit} photos</strong>.
            </span>
          </div>

          <div style={{ fontSize: '12px', color: isTargetMet ? '#10b981' : '#f59e0b', fontWeight: 600 }}>
            {isSubmitted
              ? 'Submission locked by studio'
              : isTargetMet
              ? `All ${gallery.selectionLimit} photos chosen — Ready to Submit!`
              : `${gallery.selectionLimit - selectedCount} photos needed before submission is allowed`}
          </div>
        </div>

        {/* Photos Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: gridSize === 'dense' ? 'repeat(auto-fill, minmax(180px, 1fr))' : 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '16px',
          }}
        >
          {filteredPhotos.map((photo, index) => (
            <div
              key={photo.photoId}
              style={{
                position: 'relative',
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                background: 'var(--bg-card)',
                border: photo.isSelected ? '2px solid #10b981' : '1px solid var(--border-subtle)',
                boxShadow: photo.isSelected ? '0 0 16px rgba(16, 185, 129, 0.25)' : 'var(--shadow-sm)',
                transition: 'all 180ms ease',
                cursor: 'pointer',
              }}
              onClick={() => handleToggleSelect(photo)}
            >
              {/* Image Preview */}
              <div style={{ position: 'relative', width: '100%', paddingTop: '68%', background: '#090d16' }}>
                <img
                  src={photo.webpPreviewUrl}
                  alt={photo.originalFilename}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transition: 'transform 250ms ease',
                  }}
                  loading="lazy"
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.04)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                />

                {/* Selection Checkmark Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleSelect(photo);
                  }}
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: photo.isSelected ? '#10b981' : 'rgba(15, 23, 42, 0.75)',
                    border: photo.isSelected ? '2px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.3)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
                    transition: 'all 150ms ease',
                    zIndex: 10,
                  }}
                  title={photo.isSelected ? 'Unselect photo' : 'Select photo'}
                >
                  {photo.isSelected ? <CheckCircle size={18} /> : <Circle size={16} />}
                </button>

                {/* Lightbox Trigger Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const globalIdx = photos.findIndex((p) => p.photoId === photo.photoId);
                    setActiveLightboxIndex(globalIdx >= 0 ? globalIdx : index);
                  }}
                  style={{
                    position: 'absolute',
                    bottom: '10px',
                    right: '10px',
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    zIndex: 10,
                  }}
                  title="Open full-screen view"
                >
                  <Maximize2 size={14} />
                </button>
              </div>

              {/* Photo Card Footer */}
              <div
                style={{
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--bg-card)',
                }}
              >
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                    {photo.originalFilename}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {photo.category || 'General'}
                  </div>
                </div>

                {photo.isSelected ? (
                  <span
                    style={{
                      fontSize: '11px',
                      color: '#34d399',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <CheckCircle size={13} />
                    <span>Selected</span>
                  </span>
                ) : (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Click to pick</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* SUBMISSION CONFIRMATION MODAL */}
      {isSubmitModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-dialog" style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                Confirm Final Album Selection
              </h2>
            </div>
            <div className="modal-body">
              <div style={{ textAlign: 'center', padding: '10px 0 20px 0' }}>
                <div
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px auto',
                  }}
                >
                  <CheckCircle2 size={32} color="#10b981" />
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#ffffff' }}>
                  Exactly {gallery.selectionLimit} Photos Selected!
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.5 }}>
                  You have fulfilled the required selection limit for <strong>{gallery.title}</strong>. Submitting will lock your selection and notify the studio to retrieve your high-resolution original files.
                </p>
              </div>

              <div
                style={{
                  background: 'rgba(9, 13, 22, 0.8)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  fontSize: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Event:</span>
                  <span style={{ color: '#ffffff', fontWeight: 600 }}>{gallery.title}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Total Photos in Gallery:</span>
                  <span style={{ color: '#ffffff' }}>{gallery.totalPhotos}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Final Selected Count:</span>
                  <span style={{ color: '#10b981', fontWeight: 700 }}>{selectedCount} photos</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setIsSubmitModalOpen(false)}
                disabled={isSubmitting}
              >
                <span>Review More</span>
              </button>
              <button
                type="button"
                className="btn btn-success"
                onClick={handleConfirmSubmit}
                disabled={isSubmitting}
                id="btn-confirm-final-submit"
              >
                <CheckCircle size={16} />
                <span>{isSubmitting ? 'Submitting...' : 'Yes, Lock & Submit Selection'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULLSCREEN LIGHTBOX */}
      {activeLightboxIndex !== null && photos[activeLightboxIndex] && (
        <PhotoLightbox
          photo={photos[activeLightboxIndex]}
          currentIndex={activeLightboxIndex}
          totalPhotos={photos.length}
          onClose={() => setActiveLightboxIndex(null)}
          onNext={() => setActiveLightboxIndex((prev) => (prev !== null && prev < photos.length - 1 ? prev + 1 : 0))}
          onPrev={() => setActiveLightboxIndex((prev) => (prev !== null && prev > 0 ? prev - 1 : photos.length - 1))}
          onToggleSelect={handleToggleSelect}
          selectionLimit={gallery.selectionLimit}
          selectedCount={selectedCount}
        />
      )}
    </div>
  );
};
