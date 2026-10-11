import { useState } from 'react';
import {
  CheckCircle2,
  Trash2,
  AlertTriangle,
  RefreshCw,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  canCompleteGallery,
  completeGallery,
  type RetrievalVerificationSummary,
} from '../lib/galleryCompletion';

interface CompleteGallerySectionProps {
  galleryId: string;
  galleryName: string;
  galleryStatus: string;
  selectionLimit: number;
  selectionsCount: number;
  retrievalSummary: RetrievalVerificationSummary | null;
  onGalleryCompleted: () => void;
}

export function CompleteGallerySection({
  galleryId,
  galleryName: _galleryName,
  galleryStatus,
  selectionLimit,
  selectionsCount,
  retrievalSummary,
  onGalleryCompleted,
}: CompleteGallerySectionProps) {
  const [isConfirmOpen, setIsConfirmOpen] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const check = canCompleteGallery(
    galleryStatus,
    selectionsCount,
    selectionLimit,
    retrievalSummary
  );

  const isCompleted = galleryStatus === 'completed' || Boolean(successMessage);

  // Handle Confirmed Gallery Completion
  const handleConfirmComplete = async () => {
    if (!supabase || !retrievalSummary) return;

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const res = await completeGallery(supabase, galleryId, retrievalSummary);
      if (res.success) {
        setSuccessMessage('Gallery completed successfully.');
        setIsConfirmOpen(false);
        onGalleryCompleted();
      }
    } catch (err: any) {
      console.error('Error completing gallery:', err);
      setErrorMessage(err.message || 'An error occurred during gallery completion.');
    } finally {
      setIsProcessing(false);
    }
  };

  // State A: Gallery is Already Completed
  if (isCompleted) {
    return (
      <div
        style={{
          marginTop: '20px',
          padding: '20px',
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          borderRadius: 'var(--radius-sm)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: 'rgba(16, 185, 129, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <CheckCircle2 size={24} color="#10b981" />
          </div>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', margin: 0 }}>
              Gallery completed successfully.
            </h3>
            <p style={{ fontSize: '13px', color: '#6ee7b7', marginTop: '4px', lineHeight: 1.5, margin: 0 }}>
              Cloud previews, photos, and selections have been cleaned up. Local selected originals and event history are preserved.
            </p>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '10px',
                fontSize: '11px',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '4px',
                background: 'rgba(16, 185, 129, 0.2)',
                color: '#10b981',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Status: Completed
            </div>
          </div>
        </div>
      </div>
    );
  }

  // State B: Active Gallery with Completion Controls
  return (
    <div
      style={{
        marginTop: '20px',
        padding: '20px',
        background: check.canComplete ? 'rgba(37, 99, 235, 0.08)' : 'rgba(15, 23, 42, 0.5)',
        border: `1px solid ${check.canComplete ? 'rgba(37, 99, 235, 0.3)' : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-sm)',
        transition: 'all 0.2s ease',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: check.canComplete
                ? 'rgba(37, 99, 235, 0.2)'
                : 'rgba(148, 163, 184, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {check.canComplete ? (
              <CheckCircle2 size={20} color="#60a5fa" />
            ) : (
              <AlertTriangle size={18} color="#94a3b8" />
            )}
          </div>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
              {check.canComplete
                ? 'Selected originals verified. Gallery is ready to complete.'
                : 'Gallery Completion'}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px', margin: 0 }}>
              {check.reason}
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setErrorMessage(null);
            setIsConfirmOpen(true);
          }}
          disabled={!check.canComplete}
          className={`btn ${check.canComplete ? 'btn-primary' : 'btn-outline'}`}
          style={{
            padding: '9px 18px',
            fontSize: '13px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: check.canComplete ? 'pointer' : 'not-allowed',
            opacity: check.canComplete ? 1 : 0.5,
          }}
          id="btn-complete-gallery"
        >
          <Trash2 size={15} />
          <span>Complete Gallery</span>
        </button>
      </div>

      {errorMessage && (
        <div
          style={{
            marginTop: '14px',
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#f87171',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertCircle size={15} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {isConfirmOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 110,
            background: 'rgba(5, 8, 17, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            className="card card-elevated"
            style={{
              width: '100%',
              maxWidth: '480px',
              padding: '28px',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-medium)',
              background: '#0d1322',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <ShieldAlert size={22} color="#ef4444" />
              </div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                Complete this gallery?
              </h2>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '20px' }}>
              After completion, the uploaded WebP previews, photos rows, and selections rows for this gallery will be permanently deleted from the cloud. The gallery history record and local original camera files will remain untouched.
            </p>

            {errorMessage && (
              <div
                style={{
                  marginBottom: '16px',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                <span>{errorMessage}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setIsConfirmOpen(false)}
                disabled={isProcessing}
                className="btn btn-outline"
                style={{ padding: '9px 18px', fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmComplete}
                disabled={isProcessing}
                className="btn btn-primary"
                style={{
                  padding: '9px 18px',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#ef4444',
                  borderColor: '#dc2626',
                }}
                id="btn-confirm-complete"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw size={14} className="spin" />
                    <span>Cleaning up & Completing...</span>
                  </>
                ) : (
                  <span>Complete Gallery</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CompleteGallerySection;
