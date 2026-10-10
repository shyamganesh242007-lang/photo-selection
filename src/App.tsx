import { useState, useEffect } from 'react';
import { Sidebar } from './components/studio/Sidebar';
import { Header } from './components/studio/Header';
import { DashboardOverview } from './components/studio/DashboardOverview';
import { CreateGalleryModal } from './components/studio/CreateGalleryModal';
import { GalleryDetailView } from './components/studio/GalleryDetailView';
import { StorageSettingsView } from './components/studio/StorageSettingsView';
import { CustomerGalleryView } from './components/customer/CustomerGalleryView';
import {
  initialStudioProfile,
  initialR2Config,
} from './data/mockData';
import { dbService } from './services/database/LocalStorageDatabaseService';
import type { Gallery, StudioProfile, CloudflareR2Config } from './types';
import {
  Laptop,
  Users,
  CheckCircle2,
  HardDrive,
} from 'lucide-react';

export function App() {
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [selectedGallery, setSelectedGallery] = useState<Gallery | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [studioProfile, setStudioProfile] = useState<StudioProfile>(initialStudioProfile);
  const [r2Config, setR2Config] = useState<CloudflareR2Config>(initialR2Config);

  // View Mode: 'studio' (Photographer Desktop ERP) vs 'customer' (Client Proofing Link)
  const [viewMode, setViewMode] = useState<'studio' | 'customer'>('studio');
  const [activeCustomerGalleryId, setActiveCustomerGalleryId] = useState<string>('gal_shyam_wedding_2026');

  // Copy toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    loadGalleries();
    // Check if URL specifies gallery
    const path = window.location.pathname;
    if (path.startsWith('/gallery/')) {
      const gId = path.replace('/gallery/', '');
      if (gId) {
        setActiveCustomerGalleryId(gId);
        setViewMode('customer');
      }
    }
  }, []);

  const loadGalleries = async () => {
    const list = await dbService.getGalleries();
    setGalleries(list);
  };

  const handleSaveNewGallery = async (gallery: Gallery) => {
    await dbService.saveGallery(gallery);
    await loadGalleries();
    setSelectedGallery(gallery);
  };

  const handleSelectGallery = (gallery: Gallery) => {
    setSelectedGallery(gallery);
    setCurrentTab('gallery-detail');
  };

  const handlePreviewCustomerGallery = (galleryId?: string) => {
    const targetId = galleryId || selectedGallery?.id || 'gal_shyam_wedding_2026';
    setActiveCustomerGalleryId(targetId);
    setViewMode('customer');
    window.history.pushState({}, '', `/gallery/${targetId}`);
  };

  const handleBackToStudio = () => {
    setViewMode('studio');
    window.history.pushState({}, '', '/');
    loadGalleries();
  };

  const handleCopyShareLink = (gallery: Gallery) => {
    const fullUrl = `${window.location.origin}${gallery.shareUrl}`;
    navigator.clipboard.writeText(fullUrl);
    setToastMessage(`Copied share link for "${gallery.title}" to clipboard!`);
    setTimeout(() => setToastMessage(null), 3000);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* PERSPECTIVE SWITCHER BAR */}
      <div className="view-mode-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontWeight: 700, color: '#ffffff', letterSpacing: '0.02em' }}>
            ZEEBOOK PROOFING PLATFORM
          </span>
          <span style={{ color: 'var(--border-strong)' }}>|</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {viewMode === 'studio' ? (
              <Laptop size={14} color="#60a5fa" />
            ) : (
              <Users size={14} color="#34d399" />
            )}
            <span style={{ color: viewMode === 'studio' ? '#93c5fd' : '#a7f3d0', fontWeight: 600 }}>
              Viewing As: {viewMode === 'studio' ? 'Photographer Studio ERP (Desktop)' : 'Customer Proofing Link (/gallery/...)'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {viewMode === 'studio' ? (
            <button
              onClick={() => handlePreviewCustomerGallery()}
              className="btn btn-primary"
              style={{ padding: '4px 12px', fontSize: '11px', height: '26px' }}
              id="switch-to-customer-view"
            >
              <Users size={12} />
              <span>Switch to Customer Experience</span>
            </button>
          ) : (
            <button
              onClick={handleBackToStudio}
              className="btn btn-secondary"
              style={{ padding: '4px 12px', fontSize: '11px', height: '26px' }}
              id="switch-to-studio-view"
            >
              <Laptop size={12} />
              <span>Back to Studio Dashboard</span>
            </button>
          )}
        </div>
      </div>

      {/* GLOBAL TOAST */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: '#101726',
            border: '1px solid #3b82f6',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-xl)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          <CheckCircle2 size={16} color="#3b82f6" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* VIEW CONDITIONAL RENDERING */}
      {viewMode === 'customer' ? (
        <CustomerGalleryView
          galleryId={activeCustomerGalleryId}
          onBackToStudio={handleBackToStudio}
        />
      ) : (
        <div className="studio-layout">
          {/* Studio ERP Sidebar */}
          <Sidebar
            currentTab={currentTab}
            onTabChange={(tab) => {
              setCurrentTab(tab);
              if (tab !== 'gallery-detail') setSelectedGallery(null);
            }}
            onOpenCreateModal={() => setIsCreateModalOpen(true)}
            studioProfile={studioProfile}
            galleries={galleries}
          />

          {/* Main ERP Canvas */}
          <div className="studio-main-content">
            <Header
              studioProfile={studioProfile}
              onPreviewCustomerGallery={() => handlePreviewCustomerGallery()}
              activeGalleryCount={galleries.filter((g) => g.status === 'active').length}
            />

            <main className="studio-body">
              {/* Tab 1: Dashboard Overview */}
              {currentTab === 'dashboard' && (
                <DashboardOverview
                  galleries={galleries}
                  onOpenCreateModal={() => setIsCreateModalOpen(true)}
                  onSelectGallery={handleSelectGallery}
                  onPreviewCustomerGallery={handlePreviewCustomerGallery}
                  onCopyShareLink={handleCopyShareLink}
                />
              )}

              {/* Tab 2: Galleries List */}
              {currentTab === 'galleries' && (
                <DashboardOverview
                  galleries={galleries}
                  onOpenCreateModal={() => setIsCreateModalOpen(true)}
                  onSelectGallery={handleSelectGallery}
                  onPreviewCustomerGallery={handlePreviewCustomerGallery}
                  onCopyShareLink={handleCopyShareLink}
                />
              )}

              {/* Tab 3: Local Sync / Export */}
              {currentTab === 'sync' && (
                <div>
                  <div style={{ marginBottom: '24px' }}>
                    <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#ffffff' }}>
                      Local Master Sync & Original Retrieval
                    </h1>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Select any submitted gallery below to execute verified copying of original camera files to disk.
                    </p>
                  </div>

                  <div style={{ display: 'grid', gap: '16px' }}>
                    {galleries.map((gal) => (
                      <div
                        key={gal.id}
                        className="card"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>{gal.title}</h3>
                            <span className={`badge ${gal.status === 'completed' ? 'badge-completed' : gal.status === 'submitted' ? 'badge-submitted' : 'badge-active'}`}>
                              {gal.status.toUpperCase()}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Source: <code>{gal.localFolderPath}</code> → Destination: <code>{gal.selectedFolderExportPath}</code>
                          </div>
                          <div style={{ fontSize: '12px', color: '#60a5fa', marginTop: '4px' }}>
                            Client selected {gal.selectedCount} / {gal.selectionLimit} required photos
                          </div>
                        </div>

                        <button
                          onClick={() => handleSelectGallery(gal)}
                          className="btn btn-primary"
                        >
                          <HardDrive size={15} />
                          <span>Manage Original Sync</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab 4: Cloudflare R2 Vault */}
              {currentTab === 'storage' && (
                <StorageSettingsView
                  r2Config={r2Config}
                  onSaveConfig={(cfg) => setR2Config(cfg)}
                />
              )}

              {/* Tab 5: Settings */}
              {currentTab === 'settings' && (
                <div style={{ maxWidth: '800px' }}>
                  <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#ffffff', marginBottom: '8px' }}>
                    Studio Profile & Watermark Settings
                  </h1>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
                    Customize your photography branding shown on customer proofing links.
                  </p>

                  <div className="card">
                    <div className="form-group">
                      <label className="form-label">Studio Name</label>
                      <input
                        type="text"
                        className="form-input"
                        value={studioProfile.studioName}
                        onChange={(e) => setStudioProfile({ ...studioProfile, studioName: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Tagline</label>
                      <input
                        type="text"
                        className="form-input"
                        value={studioProfile.tagline}
                        onChange={(e) => setStudioProfile({ ...studioProfile, tagline: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Contact Email</label>
                      <input
                        type="email"
                        className="form-input"
                        value={studioProfile.contactEmail}
                        onChange={(e) => setStudioProfile({ ...studioProfile, contactEmail: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Client Watermark Text</label>
                      <input
                        type="text"
                        className="form-input"
                        value={studioProfile.watermarkText || ''}
                        onChange={(e) => setStudioProfile({ ...studioProfile, watermarkText: e.target.value })}
                      />
                    </div>

                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        setToastMessage('Studio profile updated successfully.');
                        setTimeout(() => setToastMessage(null), 2500);
                      }}
                      style={{ marginTop: '10px' }}
                    >
                      Save Profile
                    </button>
                  </div>
                </div>
              )}

              {/* Gallery Detail View */}
              {currentTab === 'gallery-detail' && selectedGallery && (
                <GalleryDetailView
                  gallery={selectedGallery}
                  onBack={() => {
                    setCurrentTab('dashboard');
                    setSelectedGallery(null);
                  }}
                  onPreviewCustomerGallery={handlePreviewCustomerGallery}
                  onGalleryUpdated={(updated) => {
                    setSelectedGallery(updated);
                    loadGalleries();
                  }}
                />
              )}
            </main>
          </div>

          {/* Create Gallery Multi-Step Modal */}
          <CreateGalleryModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onSaveGallery={handleSaveNewGallery}
          />
        </div>
      )}
    </div>
  );
}
export default App;
