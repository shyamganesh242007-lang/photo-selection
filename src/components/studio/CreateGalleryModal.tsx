import React, { useState } from 'react';
import {
  X,
  Folder,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  CloudUpload,
  Sparkles,
  Link2,
  Copy,
  AlertCircle,
  HardDrive,
} from 'lucide-react';
import type { Gallery } from '../../types';

interface CreateGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveGallery: (gallery: Gallery) => void;
}

export const CreateGalleryModal: React.FC<CreateGalleryModalProps> = ({
  isOpen,
  onClose,
  onSaveGallery,
}) => {
  const [step, setStep] = useState<number>(1);
  const [title, setTitle] = useState('Ananya & Vikram Wedding');
  const [clientName, setClientName] = useState('Vikram Malhotra');
  const [clientEmail, setClientEmail] = useState('vikram.malhotra@example.com');
  const [clientPhone, setClientPhone] = useState('+91 98200 44556');
  const [localFolderPath, setLocalFolderPath] = useState('D:\\Events\\Vikram Wedding\\');
  const [detectedPhotoCount, setDetectedPhotoCount] = useState<number>(1200);
  const [selectionLimit, setSelectionLimit] = useState<number>(300);
  const [webpQuality, setWebpQuality] = useState<number>(82);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processProgress, setProcessProgress] = useState<number>(0);
  const [createdGallery, setCreatedGallery] = useState<Gallery | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleStartProcessing = async () => {
    setIsProcessing(true);
    setProcessProgress(0);

    // Simulate local WebP conversion and Cloudflare R2 preview upload
    for (let p = 0; p <= 100; p += 5) {
      await new Promise((r) => setTimeout(r, 70));
      setProcessProgress(p);
    }

    const galleryId = `gal_${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString(36)}`;
    const newGallery: Gallery = {
      id: galleryId,
      title,
      clientName,
      clientEmail,
      clientPhone,
      localFolderPath,
      selectedFolderExportPath: `D:\\Events\\Selected ${title}\\`,
      totalPhotos: detectedPhotoCount,
      selectionLimit,
      selectedCount: 0,
      status: 'active',
      createdAt: new Date().toISOString(),
      submittedAt: null,
      copiedAt: null,
      cloudCleanupStatus: 'pending',
      webpCompressionQuality: webpQuality,
      shareToken: Math.random().toString(36).substring(2, 12),
      shareUrl: `/gallery/${galleryId}`,
      coverPhotoUrl: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
      notes: `Event folder configured. Customer must select exactly ${selectionLimit} photos.`,
    };

    setCreatedGallery(newGallery);
    onSaveGallery(newGallery);
    setIsProcessing(false);
    setStep(4); // Link ready step
  };

  const handleCopyLink = () => {
    if (createdGallery) {
      const fullUrl = `${window.location.origin}${createdGallery.shareUrl}`;
      navigator.clipboard.writeText(fullUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-dialog" style={{ maxWidth: '640px' }}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
              Create Proofing Gallery
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Step {step} of 4: {step === 1 ? 'Event & Client Info' : step === 2 ? 'Folder & Selection Limit' : step === 3 ? 'Local WebP Processing' : 'Gallery Shareable Link'}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {/* STEP 1: Details */}
          {step === 1 && (
            <div>
              <div className="form-group">
                <label className="form-label">Event / Project Title</label>
                <input
                  type="text"
                  className="form-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Shyam & Ananya Wedding"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Client Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="e.g. Shyam Kumar"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Client Phone / WhatsApp</label>
                  <input
                    type="text"
                    className="form-input"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="+91 98450 11223"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Client Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="client@example.com"
                />
              </div>

              <div
                style={{
                  background: 'rgba(37, 99, 235, 0.08)',
                  border: '1px solid rgba(37, 99, 235, 0.25)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginTop: '10px',
                }}
              >
                <Sparkles size={18} color="var(--primary-500)" />
                <span style={{ fontSize: '12px', color: '#93c5fd' }}>
                  The client will only see the proofing gallery URL. Local file paths and studio settings are completely private.
                </span>
              </div>
            </div>
          )}

          {/* STEP 2: Local Folder & Strict Selection Limit */}
          {step === 2 && (
            <div>
              <div className="form-group">
                <label className="form-label">Local Event Master Folder Path</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    className="form-input"
                    value={localFolderPath}
                    onChange={(e) => setLocalFolderPath(e.target.value)}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '13px' }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      // Simulating folder pick
                      setLocalFolderPath('D:\\Events\\Shyam Wedding\\');
                      setDetectedPhotoCount(1000);
                    }}
                    style={{ flexShrink: 0 }}
                  >
                    <Folder size={15} />
                    <span>Browse...</span>
                  </button>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Contains high-resolution original RAW/JPG files. These remain on your PC and are NEVER uploaded.
                </span>
              </div>

              {/* Detected Photos Callout */}
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <HardDrive size={22} color="#10b981" />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                      {detectedPhotoCount.toLocaleString()} Camera Photos Detected
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      CR3 / ARW / JPG originals (~18.4 GB total on disk)
                    </div>
                  </div>
                </div>
                <span className="badge badge-completed">Ready for WebP</span>
              </div>

              {/* STRICT SELECTION LIMIT INPUT */}
              <div
                style={{
                  background: 'rgba(17, 24, 39, 0.8)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '18px',
                }}
              >
                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label className="form-label" style={{ color: '#60a5fa' }}>
                      Required Customer Selection Limit
                    </label>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono)' }}>
                      {selectionLimit} photos
                    </span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max={detectedPhotoCount}
                    className="form-input"
                    value={selectionLimit}
                    onChange={(e) => setSelectionLimit(Math.max(1, parseInt(e.target.value) || 1))}
                    style={{ fontSize: '16px', fontWeight: 700, padding: '12px 14px' }}
                  />
                </div>

                <div
                  style={{
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                    borderRadius: 'var(--radius-xs)',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                  }}
                >
                  <AlertCircle size={16} color="#fbbf24" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '12px', color: '#fef3c7', lineHeight: 1.4 }}>
                    <strong>Strict Enforcement Rule:</strong> The customer must select <strong>EXACTLY {selectionLimit}</strong> photos. They will be blocked from selecting {selectionLimit + 1}, and cannot submit with {selectionLimit - 1}.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Local WebP Compression & Cloud Upload */}
          {step === 3 && (
            <div>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
                  Local Preview Conversion & Cloudflare R2 Upload
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Converts {detectedPhotoCount} original files to lightweight WebP previews (~150 KB each) and uploads ONLY previews to R2.
                </p>
              </div>

              {/* Compression Quality Slider */}
              <div className="card" style={{ padding: '16px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    WebP Compression Quality
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-500)', fontFamily: 'var(--font-mono)' }}>
                    {webpQuality}% (Target ~150 KB / photo)
                  </span>
                </div>
                <input
                  type="range"
                  min="65"
                  max="92"
                  value={webpQuality}
                  onChange={(e) => setWebpQuality(parseInt(e.target.value))}
                  style={{ width: '100%' }}
                  disabled={isProcessing}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                  <span>Smaller filesize (faster client load)</span>
                  <span>Maximum preview crispness</span>
                </div>
              </div>

              {/* Storage Savings Comparison */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '11px', color: '#f87171', fontWeight: 600 }}>Original RAW/JPGs</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>~18.4 GB</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Kept strictly on local PC</div>
                </div>
                <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '12px', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ fontSize: '11px', color: '#34d399', fontWeight: 600 }}>Cloudflare R2 Previews</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>~180 MB</div>
                  <div style={{ fontSize: '11px', color: '#10b981' }}>99% Bandwidth Saved</div>
                </div>
              </div>

              {/* Processing Progress */}
              {isProcessing && (
                <div style={{ background: 'rgba(12, 17, 30, 0.8)', border: '1px solid var(--border-primary)', padding: '16px', borderRadius: 'var(--radius-sm)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
                      Processing WebP & Uploading to R2...
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary-500)', fontFamily: 'var(--font-mono)' }}>
                      {processProgress}%
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${processProgress}%`, height: '100%', background: 'linear-gradient(90deg, #2563eb, #06b6d4)', transition: 'width 100ms ease' }} />
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    Generating stable photo ID mappings and uploading lightweight previews...
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Link Ready */}
          {step === 4 && createdGallery && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px auto',
                }}
              >
                <CheckCircle2 size={36} color="#10b981" />
              </div>

              <h3 style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff' }}>
                Proofing Gallery Live!
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '440px', margin: '4px auto 20px auto' }}>
                {detectedPhotoCount} WebP previews uploaded to Cloudflare R2. Client must select <strong>EXACTLY {selectionLimit}</strong> photos before submitting.
              </p>

              {/* Share URL Box */}
              <div
                style={{
                  background: 'rgba(9, 13, 22, 0.8)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  <Link2 size={16} color="var(--primary-500)" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', color: '#93c5fd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {window.location.origin}{createdGallery.shareUrl}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="btn btn-secondary"
                  style={{ flexShrink: 0, padding: '7px 14px', fontSize: '12px' }}
                >
                  <Copy size={13} />
                  <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
                </button>
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Target output folder on submission:{' '}
                <code style={{ color: '#cbd5e1' }}>{createdGallery.selectedFolderExportPath}</code>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          {step > 1 && step < 4 && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setStep(step - 1)}
              disabled={isProcessing}
            >
              <ArrowLeft size={14} />
              <span>Back</span>
            </button>
          )}

          {step < 3 && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(step + 1)}
            >
              <span>Next Step</span>
              <ArrowRight size={14} />
            </button>
          )}

          {step === 3 && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleStartProcessing}
              disabled={isProcessing}
            >
              <CloudUpload size={16} />
              <span>{isProcessing ? 'Processing...' : 'Process WebP & Stage to R2'}</span>
            </button>
          )}

          {step === 4 && (
            <button
              type="button"
              className="btn btn-success"
              onClick={onClose}
            >
              <span>Done & Open Dashboard</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
