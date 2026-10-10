import React from 'react';
import { Search, ExternalLink, HardDrive, User } from 'lucide-react';
import type { StudioProfile } from '../../types';

interface HeaderProps {
  studioProfile: StudioProfile;
  onPreviewCustomerGallery: (galleryId?: string) => void;
  activeGalleryCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  studioProfile,
  onPreviewCustomerGallery,
  activeGalleryCount,
}) => {
  return (
    <header className="studio-header">
      {/* Search Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, maxWidth: '440px' }}>
        <div style={{ position: 'relative', width: '100%' }}>
          <Search
            size={16}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            type="text"
            placeholder="Search events, clients, or photo IDs (e.g. Shyam Wedding)..."
            className="form-input"
            style={{ paddingLeft: '38px', height: '38px', fontSize: '13px' }}
          />
        </div>
      </div>

      {/* Right Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
        {/* Local Security Status Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            padding: '6px 12px',
            borderRadius: 'var(--radius-full)',
          }}
        >
          <HardDrive size={14} color="#10b981" />
          <span style={{ fontSize: '12px', color: '#34d399', fontWeight: 600 }}>
            Master Originals: Local D:\
          </span>
        </div>

        {/* View Switcher Button */}
        <button
          onClick={() => onPreviewCustomerGallery()}
          className="btn btn-secondary"
          style={{
            height: '38px',
            padding: '0 16px',
            fontSize: '12px',
            borderColor: 'var(--border-primary)',
            background: 'rgba(37, 99, 235, 0.12)',
            color: '#60a5fa',
          }}
          title="Open the client-facing proofing portal"
          id="btn-header-client-preview"
        >
          <ExternalLink size={14} />
          <span>Customer Proofing View</span>
        </button>

        {/* Studio User Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingLeft: '12px', borderLeft: '1px solid var(--border-subtle)' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
              border: '1px solid var(--border-medium)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <User size={18} color="var(--text-secondary)" />
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', lineHeight: 1.2 }}>
              {studioProfile.studioName}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {activeGalleryCount} Active Proofing{activeGalleryCount !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
