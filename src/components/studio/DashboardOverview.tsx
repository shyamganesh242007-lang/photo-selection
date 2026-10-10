import React from 'react';
import {
  Images,
  HardDrive,
  Cloud,
  CheckCircle2,
  FolderPlus,
  ExternalLink,
  Copy,
  FolderCheck,
  Clock,
  Sparkles,
} from 'lucide-react';
import type { Gallery } from '../../types';

interface DashboardOverviewProps {
  galleries: Gallery[];
  onOpenCreateModal: () => void;
  onSelectGallery: (gallery: Gallery) => void;
  onPreviewCustomerGallery: (galleryId: string) => void;
  onCopyShareLink: (gallery: Gallery) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  galleries,
  onOpenCreateModal,
  onSelectGallery,
  onPreviewCustomerGallery,
  onCopyShareLink,
}) => {
  // Aggregate stats
  const totalPhotos = galleries.reduce((acc, g) => acc + g.totalPhotos, 0);
  const totalOriginalGB = ((totalPhotos * 15.2) / 1024).toFixed(1); // avg ~15.2 MB per photo
  const totalWebPMB = (totalPhotos * 0.15).toFixed(0); // avg ~150 KB per photo
  const submittedGalleries = galleries.filter((g) => g.status === 'submitted');
  const activeGalleries = galleries.filter((g) => g.status === 'active');

  const getStatusBadge = (status: Gallery['status']) => {
    switch (status) {
      case 'active':
        return <span className="badge badge-active"><span className="dot dot-blue" /> In Client Review</span>;
      case 'submitted':
        return <span className="badge badge-submitted"><span className="dot dot-amber" /> Ready to Sync</span>;
      case 'completed':
        return <span className="badge badge-completed"><span className="dot dot-green" /> Originals Copied</span>;
      case 'syncing':
        return <span className="badge badge-syncing"><span className="dot dot-amber" /> Syncing Local...</span>;
      default:
        return <span className="badge badge-draft">Draft</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Welcome & Quick Action Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
            Photography Studio Proofing Operations
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Manage local photo vaults, create client selection limits, and automate original camera file retrieval.
          </p>
        </div>
        <button
          onClick={onOpenCreateModal}
          className="btn btn-primary"
          style={{ padding: '11px 22px', fontSize: '14px' }}
          id="btn-dashboard-new-gallery"
        >
          <FolderPlus size={18} />
          <span>Create New Gallery</span>
        </button>
      </div>

      {/* KPI Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
        {/* Card 1 */}
        <div className="card card-elevated" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Active Client Galleries
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', marginTop: '6px' }}>
              {galleries.length}
            </div>
            <div style={{ fontSize: '12px', color: '#60a5fa', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={13} />
              <span>{activeGalleries.length} waiting client submission</span>
            </div>
          </div>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Images size={22} color="var(--primary-500)" />
          </div>
        </div>

        {/* Card 2 */}
        <div className="card card-elevated" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Local Master Storage Kept Safe
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', marginTop: '6px' }}>
              {totalOriginalGB} GB
            </div>
            <div style={{ fontSize: '12px', color: '#10b981', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle2 size={13} />
              <span>{totalPhotos.toLocaleString()} originals safe on D:\</span>
            </div>
          </div>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <HardDrive size={22} color="#10b981" />
          </div>
        </div>

        {/* Card 3 */}
        <div className="card card-elevated" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Cloudflare R2 Staging Vault
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', marginTop: '6px' }}>
              {totalWebPMB} MB
            </div>
            <div style={{ fontSize: '12px', color: 'var(--accent-cyan)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Cloud size={13} />
              <span>98.9% Bandwidth & Egress Saved</span>
            </div>
          </div>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'rgba(6, 182, 212, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Cloud size={22} color="var(--accent-cyan)" />
          </div>
        </div>

        {/* Card 4 */}
        <div className="card card-elevated" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Ready for Local Sync
            </div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: submittedGalleries.length > 0 ? '#fbbf24' : '#ffffff', marginTop: '6px' }}>
              {submittedGalleries.length}
            </div>
            <div style={{ fontSize: '12px', color: submittedGalleries.length > 0 ? '#fbbf24' : 'var(--text-muted)', marginTop: '4px' }}>
              {submittedGalleries.length > 0 ? 'Client selections ready to copy' : 'All submissions processed'}
            </div>
          </div>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FolderCheck size={22} color="#f59e0b" />
          </div>
        </div>
      </div>

      {/* Production Architecture Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(16, 22, 37, 0.9) 0%, rgba(13, 19, 32, 0.95) 100%)',
          border: '1px solid var(--border-medium)',
          borderRadius: 'var(--radius-md)',
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '24px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(37, 99, 235, 0.15)',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Sparkles size={20} color="var(--primary-500)" />
          </div>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
              Strict Proofing Workflow Active
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.4 }}>
              1. Local WebP compression → 2. Upload previews to R2 → 3. Customer picks EXACT count (e.g. 300) → 4. Local tool copies high-res originals to <code>Selected [Folder]</code> → 5. Verified R2 cleanup.
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', color: '#10b981', fontWeight: 600 }}>Zero Original File Uploads</span>
        </div>
      </div>

      {/* Recent Galleries Management Table */}
      <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>
              Proofing Galleries & Local Matching Status
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Real-time synchronization between client selections and local event folders
            </p>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'rgba(9, 13, 22, 0.6)', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '14px 24px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>
                  Event & Client
                </th>
                <th style={{ padding: '14px 20px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>
                  Local Master Folder
                </th>
                <th style={{ padding: '14px 20px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>
                  Customer Limit & Progress
                </th>
                <th style={{ padding: '14px 20px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>
                  Status
                </th>
                <th style={{ padding: '14px 24px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', textAlign: 'right' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {galleries.map((gallery) => {
                const percent = Math.min(100, Math.round((gallery.selectedCount / gallery.selectionLimit) * 100));
                return (
                  <tr
                    key={gallery.id}
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      transition: 'background var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Event & Client */}
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '14px' }}>
                        {gallery.title}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Client: {gallery.clientName}
                      </div>
                    </td>

                    {/* Local Folder */}
                    <td style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <code style={{ fontSize: '11px', color: '#93c5fd', background: 'rgba(30, 58, 138, 0.25)', padding: '2px 8px', borderRadius: '4px', fontFamily: 'var(--font-mono)' }}>
                          {gallery.localFolderPath}
                        </code>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        {gallery.totalPhotos.toLocaleString()} camera originals detected
                      </div>
                    </td>

                    {/* Limit & Progress */}
                    <td style={{ padding: '16px 20px', minWidth: '220px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                        <span style={{ fontWeight: 700, color: gallery.selectedCount === gallery.selectionLimit ? '#10b981' : '#ffffff', fontSize: '13px' }}>
                          {gallery.selectedCount} / {gallery.selectionLimit} selected
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {percent}%
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${percent}%`,
                            height: '100%',
                            background: gallery.selectedCount === gallery.selectionLimit ? '#10b981' : 'linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%)',
                            transition: 'width 300ms ease',
                          }}
                        />
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Exact limit enforced: Must equal {gallery.selectionLimit}
                      </div>
                    </td>

                    {/* Status */}
                    <td style={{ padding: '16px 20px' }}>
                      {getStatusBadge(gallery.status)}
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                        {/* Open Detail */}
                        <button
                          onClick={() => onSelectGallery(gallery)}
                          className="btn btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          title="Open gallery details & local sync"
                        >
                          Manage
                        </button>

                        {/* Customer Proofing Link */}
                        <button
                          onClick={() => onPreviewCustomerGallery(gallery.id)}
                          className="btn btn-outline"
                          style={{ padding: '6px 12px', fontSize: '12px', color: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.3)' }}
                          title="Preview customer proofing view"
                        >
                          <ExternalLink size={13} />
                          <span>Customer View</span>
                        </button>

                        {/* Copy Link */}
                        <button
                          onClick={() => onCopyShareLink(gallery)}
                          className="btn btn-outline"
                          style={{ padding: '6px 10px', fontSize: '12px' }}
                          title="Copy share link for client"
                        >
                          <Copy size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
