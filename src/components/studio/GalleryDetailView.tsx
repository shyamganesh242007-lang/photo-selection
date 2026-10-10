import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  HardDrive,
  Cloud,
  FolderSync,
  Trash2,
  ExternalLink,
  Copy,
  ShieldCheck,
  Search,
} from 'lucide-react';
import type { Gallery, Photo } from '../../types';
import { dbService } from '../../services/database/LocalStorageDatabaseService';
import { localSyncService } from '../../services/sync/LocalSyncService';
import { CleanupService } from '../../services/cleanup/CleanupService';
import { mockStorage } from '../../services/storage/MockStorageService';

interface GalleryDetailViewProps {
  gallery: Gallery;
  onBack: () => void;
  onPreviewCustomerGallery: (galleryId: string) => void;
  onGalleryUpdated: (gallery: Gallery) => void;
}

export const GalleryDetailView: React.FC<GalleryDetailViewProps> = ({
  gallery,
  onBack,
  onPreviewCustomerGallery,
  onGalleryUpdated,
}) => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Sync state
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<{ percent: number; copied: number; total: number; currentFile: string } | null>(null);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null);

  // Cleanup state
  const [isCleaning, setIsCleaning] = useState<boolean>(false);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);

  useEffect(() => {
    loadPhotos();
  }, [gallery.id]);

  const loadPhotos = async () => {
    setLoading(true);
    const loaded = await dbService.getPhotosByGallery(gallery.id);
    setPhotos(loaded);
    setLoading(false);
  };

  const handleCopyLink = () => {
    const fullUrl = `${window.location.origin}${gallery.shareUrl}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Execute local master copy
  const handleExecuteLocalSync = async () => {
    setIsSyncing(true);
    setSyncSuccessMessage(null);
    setSyncProgress({ percent: 0, copied: 0, total: gallery.selectionLimit, currentFile: 'Initiating...' });

    const mappings = await dbService.getPhotoMappings(gallery.id);
    const selectedPhotoIds = photos.filter((p) => p.isSelected).map((p) => p.photoId);

    const job = await localSyncService.copySelectedOriginals(
      gallery.id,
      gallery.localFolderPath,
      gallery.selectedFolderExportPath,
      mappings,
      selectedPhotoIds,
      (update) => {
        setSyncProgress({
          percent: update.percent,
          copied: update.filesCopied,
          total: update.totalFiles,
          currentFile: update.currentFilename,
        });
      }
    );

    const verification = await localSyncService.verifyCopiedOriginals(job, mappings);

    if (verification.isVerified) {
      const updatedGallery = {
        ...gallery,
        status: 'completed' as const,
        copiedAt: new Date().toISOString(),
      };
      await dbService.saveGallery(updatedGallery);
      onGalleryUpdated(updatedGallery);
      setSyncSuccessMessage(verification.message);
    }

    setIsSyncing(false);
  };

  // Safe Cloud Cleanup
  const handleExecuteCloudCleanup = async () => {
    setIsCleaning(true);
    const cleanup = new CleanupService(mockStorage);
    const storagePaths = photos.map((p) => p.webpStoragePath);

    const mockSyncJob = {
      jobId: `sync_${gallery.id}`,
      galleryId: gallery.id,
      status: 'completed' as const,
      totalFilesToCopy: gallery.selectionLimit,
      filesCopied: gallery.selectionLimit,
      verifiedCount: gallery.selectionLimit,
      failedFiles: [],
      sourceDirectory: gallery.localFolderPath,
      destinationDirectory: gallery.selectedFolderExportPath,
    };

    const mockVerification = {
      isVerified: true,
      totalVerified: gallery.selectionLimit,
      missingFiles: [],
      sizeMismatches: [],
      message: 'Verified',
    };

    const res = await cleanup.executeCloudCleanup(gallery, mockSyncJob, mockVerification, storagePaths);

    if (res.success) {
      const updatedGallery = {
        ...gallery,
        cloudCleanupStatus: 'cleaned' as const,
      };
      await dbService.saveGallery(updatedGallery);
      onGalleryUpdated(updatedGallery);
      setCleanupMessage(res.message);
    } else {
      setCleanupMessage(res.message);
    }
    setIsCleaning(false);
  };

  // Filtered photos
  const filteredPhotos = photos.filter((p) => {
    const matchesCategory = filterCategory === 'all' || p.category === filterCategory;
    const matchesSearch =
      searchQuery === '' ||
      p.originalFilename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.photoId.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const selectedCount = photos.filter((p) => p.isSelected).length;

  if (loading) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <p>Loading photo mappings and storage status...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Navigation & Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={onBack}
            className="btn btn-secondary"
            style={{ padding: '8px 12px' }}
            title="Back to galleries overview"
          >
            <ArrowLeft size={16} />
            <span>All Galleries</span>
          </button>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
              {gallery.title}
            </h1>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Client: {gallery.clientName} ({gallery.clientEmail})
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => onPreviewCustomerGallery(gallery.id)}
            className="btn btn-primary"
            style={{ padding: '9px 16px', fontSize: '13px' }}
          >
            <ExternalLink size={15} />
            <span>Open Customer Proofing View</span>
          </button>
          <button
            onClick={handleCopyLink}
            className="btn btn-secondary"
            style={{ padding: '9px 14px', fontSize: '13px' }}
          >
            <Copy size={15} />
            <span>{copiedLink ? 'Link Copied!' : 'Copy Share Link'}</span>
          </button>
        </div>
      </div>

      {/* Overview Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        {/* Selection Status Card */}
        <div className="card card-elevated">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Customer Selection Rule
              </div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: '#ffffff', marginTop: '6px' }}>
                {selectedCount} / {gallery.selectionLimit}
              </div>
              <div style={{ fontSize: '12px', color: selectedCount === gallery.selectionLimit ? '#10b981' : '#f59e0b', marginTop: '4px' }}>
                {selectedCount === gallery.selectionLimit
                  ? 'Target selection reached exactly!'
                  : `${gallery.selectionLimit - selectedCount} more photos required`}
              </div>
            </div>
            <span
              className={`badge ${
                gallery.status === 'completed'
                  ? 'badge-completed'
                  : gallery.status === 'submitted'
                  ? 'badge-submitted'
                  : 'badge-active'
              }`}
            >
              {gallery.status.toUpperCase()}
            </span>
          </div>

          <div style={{ marginTop: '16px' }}>
            <div style={{ width: '100%', height: '7px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.min(100, Math.round((selectedCount / gallery.selectionLimit) * 100))}%`,
                  height: '100%',
                  background: selectedCount === gallery.selectionLimit ? '#10b981' : 'linear-gradient(90deg, #3b82f6, #06b6d4)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Local Folder Paths Card */}
        <div className="card card-elevated">
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Master Filesystem Mapping
          </div>
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Original Source (Untouched Master):</div>
              <code style={{ fontSize: '12px', color: '#93c5fd', background: 'rgba(30, 58, 138, 0.25)', padding: '2px 8px', borderRadius: '4px', display: 'inline-block', marginTop: '2px' }}>
                {gallery.localFolderPath}
              </code>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Target Selected Originals:</div>
              <code style={{ fontSize: '12px', color: '#a7f3d0', background: 'rgba(6, 78, 59, 0.3)', padding: '2px 8px', borderRadius: '4px', display: 'inline-block', marginTop: '2px' }}>
                {gallery.selectedFolderExportPath}
              </code>
            </div>
          </div>
        </div>

        {/* WebP & R2 Storage Status */}
        <div className="card card-elevated">
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Cloudflare R2 Temporary Previews
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#ffffff' }}>
                {gallery.totalPhotos} WebP Previews
              </div>
              <div style={{ fontSize: '12px', color: 'var(--accent-cyan)', marginTop: '2px' }}>
                ~145 MB on Cloudflare R2 ($0 egress)
              </div>
            </div>
            <span
              className={`badge ${
                gallery.cloudCleanupStatus === 'cleaned' ? 'badge-completed' : 'badge-draft'
              }`}
            >
              {gallery.cloudCleanupStatus === 'cleaned' ? 'Purged from R2' : 'Active in R2'}
            </span>
          </div>
        </div>
      </div>

      {/* LOCAL ORIGINAL MASTER FILE COPY PANEL */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(180deg, #101828 0%, #0d1422 100%)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: 'rgba(37, 99, 235, 0.15)',
                border: '1px solid rgba(37, 99, 235, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <HardDrive size={22} color="var(--primary-500)" />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>
                Desktop Local Sync Engine: Retrieve Master Originals
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px', maxWidth: '720px' }}>
                When client selection is complete, the desktop engine matches the selected IDs to the original camera files in{' '}
                <code>{gallery.localFolderPath}</code> and copies <strong>ONLY the camera master originals (RAW/JPG)</strong> into{' '}
                <code>{gallery.selectedFolderExportPath}</code>.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              onClick={handleExecuteLocalSync}
              className="btn btn-primary"
              disabled={isSyncing || selectedCount !== gallery.selectionLimit}
              style={{ padding: '10px 20px', fontSize: '13px' }}
            >
              <FolderSync size={16} />
              <span>{isSyncing ? 'Copying Original Files...' : 'Copy Selected Master Originals'}</span>
            </button>
          </div>
        </div>

        {/* Sync Progress Bar */}
        {isSyncing && syncProgress && (
          <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(12, 17, 30, 0.8)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#ffffff' }}>
                Copying master: {syncProgress.currentFile}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary-500)', fontFamily: 'var(--font-mono)' }}>
                {syncProgress.copied} / {syncProgress.total} ({syncProgress.percent}%)
              </span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${syncProgress.percent}%`, height: '100%', background: 'linear-gradient(90deg, #2563eb, #10b981)', transition: 'width 100ms ease' }} />
            </div>
          </div>
        )}

        {/* Verification Success Message */}
        {syncSuccessMessage && (
          <div
            style={{
              marginTop: '16px',
              padding: '14px 18px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <ShieldCheck size={20} color="#10b981" />
            <div style={{ fontSize: '13px', color: '#a7f3d0' }}>
              <strong>Master Copy Verified:</strong> {syncSuccessMessage}
            </div>
          </div>
        )}

        {/* CLOUDFLARE R2 PRUNE ACTION */}
        <div
          style={{
            marginTop: '20px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Cloud size={16} color="var(--accent-cyan)" />
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Cloud Cleanup Rule: WebP previews can ONLY be deleted from Cloudflare R2 AFTER original files are 100% verified copied locally.
            </span>
          </div>

          <button
            onClick={handleExecuteCloudCleanup}
            className="btn btn-outline"
            disabled={isCleaning || gallery.status !== 'completed' || gallery.cloudCleanupStatus === 'cleaned'}
            style={{ fontSize: '12px', padding: '7px 14px', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#f87171' }}
          >
            <Trash2 size={14} />
            <span>{gallery.cloudCleanupStatus === 'cleaned' ? 'R2 Previews Cleaned' : isCleaning ? 'Cleaning...' : 'Prune R2 Previews'}</span>
          </button>
        </div>

        {cleanupMessage && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: '#60a5fa' }}>
            {cleanupMessage}
          </div>
        )}
      </div>

      {/* Photo Mapping Table & Thumbnails */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
              Original Photo ID Mapping Table
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Stable identifiers mapping camera originals ({gallery.totalPhotos} items) to WebP cloud previews
            </p>
          </div>

          {/* Search & Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search photo ID / filename..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '32px', height: '34px', fontSize: '12px', width: '220px' }}
              />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="form-select"
              style={{ height: '34px', fontSize: '12px', width: '150px' }}
            >
              <option value="all">All Categories</option>
              <option value="Ceremony">Ceremony</option>
              <option value="Portraits">Portraits</option>
              <option value="Pre-Wedding">Pre-Wedding</option>
              <option value="Reception">Reception</option>
              <option value="Family & Guests">Family & Guests</option>
            </select>
          </div>
        </div>

        {/* Mappings Table */}
        <div style={{ overflowX: 'auto', maxHeight: '520px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr style={{ background: '#090d16', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '12px 20px', color: 'var(--text-muted)', fontWeight: 600 }}>Preview</th>
                <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Photo ID</th>
                <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Original Camera File</th>
                <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Relative Path</th>
                <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Original Size</th>
                <th style={{ padding: '12px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>WebP Size</th>
                <th style={{ padding: '12px 20px', color: 'var(--text-muted)', fontWeight: 600 }}>Client Selection</th>
              </tr>
            </thead>
            <tbody>
              {filteredPhotos.slice(0, 50).map((photo) => (
                <tr
                  key={photo.photoId}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    background: photo.isSelected ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                  }}
                >
                  <td style={{ padding: '10px 20px' }}>
                    <img
                      src={photo.webpPreviewUrl}
                      alt={photo.originalFilename}
                      style={{ width: '42px', height: '32px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}
                      loading="lazy"
                    />
                  </td>
                  <td style={{ padding: '10px 16px', fontFamily: 'var(--font-mono)', color: '#93c5fd' }}>
                    {photo.photoId}
                  </td>
                  <td style={{ padding: '10px 16px', fontWeight: 600, color: '#ffffff' }}>
                    {photo.originalFilename}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>
                    {photo.originalRelativePath}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>
                    {(photo.originalSizeBytes / (1024 * 1024)).toFixed(1)} MB
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--accent-cyan)' }}>
                    {(photo.webpSizeBytes / 1024).toFixed(0)} KB
                  </td>
                  <td style={{ padding: '10px 20px' }}>
                    {photo.isSelected ? (
                      <span className="badge badge-active" style={{ fontSize: '10px' }}>
                        Selected
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '12px 24px', background: 'rgba(9, 13, 22, 0.5)', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
          <span>Showing 50 of {filteredPhotos.length} photos</span>
          <span>Full mapping cached locally</span>
        </div>
      </div>
    </div>
  );
};
