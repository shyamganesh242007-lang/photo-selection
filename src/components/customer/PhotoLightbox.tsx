import React, { useEffect } from 'react';
import {
  X,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Circle,
} from 'lucide-react';
import type { Photo } from '../../types';

interface PhotoLightboxProps {
  photo: Photo | null;
  currentIndex: number;
  totalPhotos: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onToggleSelect: (photo: Photo) => void;
  selectionLimit: number;
  selectedCount: number;
}

export const PhotoLightbox: React.FC<PhotoLightboxProps> = ({
  photo,
  currentIndex,
  totalPhotos,
  onClose,
  onNext,
  onPrev,
  onToggleSelect,
  selectionLimit,
  selectedCount,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onNext();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === ' ' && photo) {
        e.preventDefault();
        onToggleSelect(photo);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [photo, onNext, onPrev, onClose, onToggleSelect]);

  if (!photo) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(3, 5, 9, 0.94)',
        backdropFilter: 'blur(16px)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        animation: 'fadeIn 180ms ease',
      }}
    >
      {/* Lightbox Topbar */}
      <div
        style={{
          height: '64px',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(12, 17, 30, 0.6)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Photo {currentIndex + 1} of {totalPhotos}
          </span>
          <span style={{ color: 'var(--border-strong)' }}>•</span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
            {photo.originalFilename}
          </span>
          {photo.category && (
            <span className="badge badge-active" style={{ fontSize: '10px' }}>
              {photo.category}
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Select Toggle Button */}
          <button
            onClick={() => onToggleSelect(photo)}
            className={`btn ${photo.isSelected ? 'btn-success' : 'btn-primary'}`}
            style={{ padding: '8px 18px', fontSize: '13px' }}
          >
            {photo.isSelected ? <CheckCircle size={16} /> : <Circle size={16} />}
            <span>{photo.isSelected ? 'Selected' : 'Select Photo'}</span>
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="btn btn-outline"
            style={{ padding: '8px', borderRadius: '50%' }}
            title="Close Lightbox (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Main Image View Area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          padding: '24px',
          overflow: 'hidden',
        }}
      >
        {/* Previous Button */}
        <button
          onClick={onPrev}
          style={{
            position: 'absolute',
            left: '20px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#ffffff',
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 150ms ease',
            zIndex: 10,
          }}
          title="Previous photo (Left arrow)"
        >
          <ChevronLeft size={24} />
        </button>

        {/* Next Button */}
        <button
          onClick={onNext}
          style={{
            position: 'absolute',
            right: '20px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: '#ffffff',
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 150ms ease',
            zIndex: 10,
          }}
          title="Next photo (Right arrow)"
        >
          <ChevronRight size={24} />
        </button>

        {/* High Quality WebP Image */}
        <div style={{ maxWidth: '85vw', maxHeight: '80vh', position: 'relative' }}>
          <img
            src={photo.webpPreviewUrl}
            alt={photo.originalFilename}
            style={{
              maxWidth: '100%',
              maxHeight: '80vh',
              objectFit: 'contain',
              borderRadius: '8px',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
              border: photo.isSelected ? '3px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
            }}
          />

          {photo.isSelected && (
            <div
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: '#10b981',
                color: '#ffffff',
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 700,
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
              }}
            >
              <CheckCircle size={14} />
              <span>Selected for Album</span>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Footer Bar */}
      <div
        style={{
          height: '56px',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(12, 17, 30, 0.6)',
          fontSize: '12px',
          color: 'var(--text-muted)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span>Keyboard shortcuts: <strong>← Prev</strong> | <strong>→ Next</strong> | <strong>Space</strong> to select/unselect | <strong>Esc</strong> to close</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: selectedCount === selectionLimit ? '#10b981' : '#ffffff', fontWeight: 700 }}>
            Selection Status: {selectedCount} / {selectionLimit}
          </span>
        </div>
      </div>
    </div>
  );
};
