import React from 'react';
import {
  LayoutDashboard,
  Images,
  FolderPlus,
  HardDriveDownload,
  Cloud,
  Settings,
  ShieldCheck,
  Camera,
} from 'lucide-react';
import type { StudioProfile, Gallery } from '../../types';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onOpenCreateModal: () => void;
  studioProfile: StudioProfile;
  galleries: Gallery[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  onOpenCreateModal,
  studioProfile,
  galleries,
}) => {
  const activeCount = galleries.filter((g) => g.status === 'active').length;
  const submittedCount = galleries.filter((g) => g.status === 'submitted').length;

  return (
    <aside className="studio-sidebar">
      {/* Brand & Studio Profile */}
      <div style={{ padding: '24px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: 'var(--radius-sm)',
              background: 'linear-gradient(135deg, #2563eb 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
            }}
          >
            <Camera size={22} color="#ffffff" />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {studioProfile.studioName}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
              <span className="dot dot-green" />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                Studio Proofing Hub
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Action: Create Gallery */}
      <div style={{ padding: '16px 20px 8px 20px' }}>
        <button
          onClick={onOpenCreateModal}
          className="btn btn-primary"
          style={{ width: '100%', padding: '11px 16px', fontSize: '13px', borderRadius: 'var(--radius-sm)' }}
          id="btn-sidebar-create-gallery"
        >
          <FolderPlus size={16} />
          <span>New Proofing Gallery</span>
        </button>
      </div>

      {/* Navigation List */}
      <nav style={{ flex: 1, padding: '12px 12px', overflowY: 'auto' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '8px 12px 4px 12px' }}>
          Platform Management
        </div>

        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <li>
            <button
              onClick={() => onTabChange('dashboard')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: currentTab === 'dashboard' ? 'rgba(59, 130, 246, 0.14)' : 'transparent',
                color: currentTab === 'dashboard' ? '#ffffff' : 'var(--text-secondary)',
                border: currentTab === 'dashboard' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '13px',
                fontWeight: currentTab === 'dashboard' ? 600 : 500,
                textAlign: 'left',
                transition: 'all var(--transition-fast)',
              }}
              id="nav-dashboard"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <LayoutDashboard size={18} color={currentTab === 'dashboard' ? 'var(--primary-500)' : 'var(--text-muted)'} />
                <span>Dashboard Overview</span>
              </div>
            </button>
          </li>

          <li>
            <button
              onClick={() => onTabChange('galleries')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: currentTab === 'galleries' ? 'rgba(59, 130, 246, 0.14)' : 'transparent',
                color: currentTab === 'galleries' ? '#ffffff' : 'var(--text-secondary)',
                border: currentTab === 'galleries' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '13px',
                fontWeight: currentTab === 'galleries' ? 600 : 500,
                textAlign: 'left',
                transition: 'all var(--transition-fast)',
              }}
              id="nav-galleries"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Images size={18} color={currentTab === 'galleries' ? 'var(--primary-500)' : 'var(--text-muted)'} />
                <span>Client Galleries</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {activeCount > 0 && (
                  <span
                    style={{
                      background: 'rgba(59, 130, 246, 0.2)',
                      color: '#60a5fa',
                      padding: '1px 6px',
                      borderRadius: '10px',
                      fontSize: '10px',
                      fontWeight: 700,
                    }}
                  >
                    {activeCount} active
                  </span>
                )}
                {galleries.length > 0 && (
                  <span
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: 'var(--text-secondary)',
                      padding: '2px 7px',
                      borderRadius: '10px',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    {galleries.length}
                  </span>
                )}
              </div>
            </button>
          </li>

          <li>
            <button
              onClick={() => onTabChange('sync')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: currentTab === 'sync' ? 'rgba(59, 130, 246, 0.14)' : 'transparent',
                color: currentTab === 'sync' ? '#ffffff' : 'var(--text-secondary)',
                border: currentTab === 'sync' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '13px',
                fontWeight: currentTab === 'sync' ? 600 : 500,
                textAlign: 'left',
                transition: 'all var(--transition-fast)',
              }}
              id="nav-sync"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <HardDriveDownload size={18} color={currentTab === 'sync' ? 'var(--primary-500)' : 'var(--text-muted)'} />
                <span>Original Master Sync</span>
              </div>
              {submittedCount > 0 && (
                <span
                  style={{
                    background: 'rgba(245, 158, 11, 0.2)',
                    color: '#fbbf24',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  {submittedCount} ready
                </span>
              )}
            </button>
          </li>

          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '16px 12px 4px 12px' }}>
            Infrastructure
          </div>

          <li>
            <button
              onClick={() => onTabChange('storage')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: currentTab === 'storage' ? 'rgba(59, 130, 246, 0.14)' : 'transparent',
                color: currentTab === 'storage' ? '#ffffff' : 'var(--text-secondary)',
                border: currentTab === 'storage' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '13px',
                fontWeight: currentTab === 'storage' ? 600 : 500,
                textAlign: 'left',
                transition: 'all var(--transition-fast)',
              }}
              id="nav-storage"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Cloud size={18} color={currentTab === 'storage' ? 'var(--primary-500)' : 'var(--text-muted)'} />
                <span>Cloudflare R2 Vault</span>
              </div>
              <span
                style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  fontSize: '10px',
                  fontWeight: 600,
                }}
              >
                0 Egress
              </span>
            </button>
          </li>

          <li>
            <button
              onClick={() => onTabChange('settings')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: currentTab === 'settings' ? 'rgba(59, 130, 246, 0.14)' : 'transparent',
                color: currentTab === 'settings' ? '#ffffff' : 'var(--text-secondary)',
                border: currentTab === 'settings' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '13px',
                fontWeight: currentTab === 'settings' ? 600 : 500,
                textAlign: 'left',
                transition: 'all var(--transition-fast)',
              }}
              id="nav-settings"
            >
              <Settings size={18} color={currentTab === 'settings' ? 'var(--primary-500)' : 'var(--text-muted)'} />
              <span>Studio Configuration</span>
            </button>
          </li>
        </ul>
      </nav>

      {/* Local Processing Engine Status Banner */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-subtle)' }}>
        <div
          style={{
            background: 'rgba(17, 24, 39, 0.7)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '12px 14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <ShieldCheck size={16} color="#10b981" />
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#ffffff' }}>Local Engine Active</span>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
            Original files remain safe on PC. Only WebP previews staged to Cloudflare R2.
          </p>
        </div>
      </div>
    </aside>
  );
};
