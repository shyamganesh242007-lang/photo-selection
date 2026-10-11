import { useState, useEffect, useMemo } from 'react';
import {
  Camera,
  Plus,
  RefreshCw,
  Search,
  ExternalLink,
  Copy,
  Check,
  FolderOpen,
  DownloadCloud,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  ArrowUpDown,
  X,
  Share2,
  ArrowLeft,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  fetchGalleryDashboardData,
  formatGalleryDate,
  STATUS_LABELS,
  STATUS_BADGE_STYLES,
  STATUS_DESCRIPTIONS,
  type DashboardGalleryItem,
  type DashboardSummaryStats,
} from '../lib/galleryDashboard';
import {
  copyCustomerGalleryLink,
  shareCustomerGalleryLink,
  getCustomerGalleryUrl,
  isWebShareSupported,
} from '../lib/gallerySharing';

interface GalleryDashboardProps {
  onCreateGallery: () => void;
  onOpenGallery: (galleryId: string) => void;
  onOpenRetrieval?: (galleryId: string) => void;
  onBackToWorkflow?: () => void;
}

export function GalleryDashboard({
  onCreateGallery,
  onOpenGallery,
  onOpenRetrieval,
  onBackToWorkflow,
}: GalleryDashboardProps) {
  const [galleries, setGalleries] = useState<DashboardGalleryItem[]>([]);
  const [stats, setStats] = useState<DashboardSummaryStats>({
    totalGalleries: 0,
    draftGalleries: 0,
    activeGalleries: 0,
    submittedGalleries: 0,
    completedGalleries: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filter, Search, Sort States
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');

  // Copy Link State & Feedback Toast
  const [copiedGalleryId, setCopiedGalleryId] = useState<string | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<{
    message: string;
    type: 'success' | 'info' | 'error';
  } | null>(null);
  const [hasWebShare, setHasWebShare] = useState<boolean>(false);

  useEffect(() => {
    setHasWebShare(isWebShareSupported());
  }, []);

  useEffect(() => {
    if (feedbackToast) {
      const timer = setTimeout(() => setFeedbackToast(null), 3200);
      return () => clearTimeout(timer);
    }
  }, [feedbackToast]);

  // Fetch Dashboard Data (Preserves existing data on refresh error)
  const loadDashboardData = async (isManualRefresh = false) => {
    if (!supabase) {
      setErrorMessage('Supabase is not configured.');
      setIsLoading(false);
      return;
    }

    if (isManualRefresh) setIsRefreshing(true);
    else setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await fetchGalleryDashboardData(supabase);
      setGalleries(data.galleries);
      setStats(data.stats);
    } catch (err: any) {
      console.error('Error loading gallery dashboard:', err);
      // NOTE: Do not wipe existing galleries if a background/manual refresh fails!
      setErrorMessage(err.message || 'Failed to load gallery dashboard.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Filtered & Sorted Galleries (AND logic between status filter & search query)
  const filteredGalleries = useMemo(() => {
    return galleries
      .filter((g) => {
        // Status Filter
        if (statusFilter !== 'All' && g.status.toLowerCase() !== statusFilter.toLowerCase()) {
          return false;
        }
        // Search Filter (by gallery name only, case-insensitive)
        if (searchQuery.trim()) {
          const query = searchQuery.trim().toLowerCase();
          if (!g.name.toLowerCase().includes(query)) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
      });
  }, [galleries, statusFilter, searchQuery, sortOrder]);

  const handleCopyCustomerLink = async (e: React.MouseEvent, galleryId: string) => {
    e.stopPropagation();
    const success = await copyCustomerGalleryLink(galleryId);
    if (success) {
      setCopiedGalleryId(galleryId);
      setFeedbackToast({ message: 'Gallery link copied', type: 'success' });
      setTimeout(() => setCopiedGalleryId(null), 2500);
    } else {
      setFeedbackToast({
        message: 'Unable to copy link. Please copy manually.',
        type: 'error',
      });
    }
  };

  const handleOpenCustomerLink = (e: React.MouseEvent, galleryId: string) => {
    e.stopPropagation();
    setFeedbackToast({ message: 'Opening customer gallery...', type: 'info' });
    window.open(`/gallery/${galleryId}`, '_blank');
  };

  const handleShareCustomerLink = async (
    e: React.MouseEvent,
    gallery: { id: string; name: string }
  ) => {
    e.stopPropagation();
    const result = await shareCustomerGalleryLink(gallery);
    if (result === 'shared') {
      setFeedbackToast({ message: 'Gallery link shared', type: 'success' });
    } else if (result === 'cancelled') {
      setFeedbackToast({ message: 'Share cancelled', type: 'info' });
    } else if (result === 'failed') {
      // Graceful fallback to clipboard copy
      const copied = await copyCustomerGalleryLink(gallery.id);
      if (copied) {
        setCopiedGalleryId(gallery.id);
        setFeedbackToast({ message: 'Gallery link copied', type: 'success' });
        setTimeout(() => setCopiedGalleryId(null), 2500);
      } else {
        setFeedbackToast({
          message: 'Unable to share link.',
          type: 'error',
        });
      }
    }
  };

  const statusTabOptions = [
    'All',
    'Draft',
    'Processing',
    'Active',
    'Submitted',
    'Completed',
    'Archived',
  ];

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
      {/* Top Navigation Bar */}
      <header
        style={{
          height: '64px',
          background: 'rgba(12, 17, 30, 0.95)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 30,
          backdropFilter: 'blur(12px)',
        }}
      >
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
          <span style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>
            Photo Studio
          </span>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '2px 8px',
              borderRadius: '12px',
              fontWeight: 600,
            }}
          >
            Dashboard
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {onBackToWorkflow && (
            <button
              type="button"
              onClick={onBackToWorkflow}
              className="btn btn-secondary"
              style={{
                padding: '7px 14px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              id="btn-back-to-workflow"
            >
              <ArrowLeft size={14} />
              <span>Back to Workflow</span>
            </button>
          )}

          {/* Refresh Action */}
          <button
            type="button"
            onClick={() => loadDashboardData(true)}
            disabled={isLoading || isRefreshing}
            className="btn btn-outline"
            style={{
              padding: '7px 14px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            id="btn-refresh-dashboard"
            title="Refresh galleries from database"
          >
            <RefreshCw size={13} className={isRefreshing ? 'spin' : ''} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>

          {/* New Gallery Primary Action */}
          <button
            type="button"
            onClick={onCreateGallery}
            className="btn btn-primary"
            style={{
              padding: '7px 16px',
              fontSize: '13px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
            id="btn-create-gallery-header"
          >
            <Plus size={16} />
            <span>New Gallery</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main
        style={{
          flex: 1,
          maxWidth: '1360px',
          margin: '0 auto',
          width: '100%',
          padding: '28px 24px 64px',
          boxSizing: 'border-box',
        }}
      >
        {/* Title Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '24px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <h1
              style={{
                fontSize: '22px',
                fontWeight: 800,
                color: '#ffffff',
                letterSpacing: '-0.02em',
                margin: 0,
              }}
              id="dashboard-title"
            >
              Gallery Management
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Manage client events, track selection progress, and retrieve final chosen photos.
            </p>
          </div>
        </div>

        {/* Global Error Banner (When refresh fails but previous data remains visible) */}
        {errorMessage && galleries.length > 0 && (
          <div
            style={{
              padding: '12px 18px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-sm)',
              color: '#f87171',
              fontSize: '13px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
            }}
            id="dashboard-error-banner"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => loadDashboardData(true)}
              className="btn btn-outline"
              style={{ padding: '4px 10px', fontSize: '11px', borderColor: 'rgba(239, 68, 68, 0.4)' }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Top Summary Cards (5 Cards: Total, Draft, Active, Submitted, Completed) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '14px',
            marginBottom: '28px',
          }}
          id="dashboard-summary-cards"
        >
          {/* Card 1: Total Galleries */}
          <div
            className="card card-elevated"
            style={{
              padding: '18px 20px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Layers size={20} color="#3b82f6" />
            </div>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>
                Total Galleries
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#ffffff', marginTop: '2px' }} id="stat-total-galleries">
                {stats.totalGalleries}
              </div>
            </div>
          </div>

          {/* Card 2: Draft Galleries */}
          <div
            className="card card-elevated"
            style={{
              padding: '18px 20px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(148, 163, 184, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <FolderOpen size={20} color="#94a3b8" />
            </div>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>
                Draft
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#cbd5e1', marginTop: '2px' }} id="stat-draft-galleries">
                {stats.draftGalleries}
              </div>
            </div>
          </div>

          {/* Card 3: Active Galleries */}
          <div
            className="card card-elevated"
            style={{
              padding: '18px 20px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Clock size={20} color="#10b981" />
            </div>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>
                Active
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#10b981', marginTop: '2px' }} id="stat-active-galleries">
                {stats.activeGalleries}
              </div>
            </div>
          </div>

          {/* Card 4: Submitted Galleries */}
          <div
            className="card card-elevated"
            style={{
              padding: '18px 20px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(168, 85, 247, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <CheckCircle2 size={20} color="#a855f7" />
            </div>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>
                Submitted
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#a855f7', marginTop: '2px' }} id="stat-submitted-galleries">
                {stats.submittedGalleries}
              </div>
            </div>
          </div>

          {/* Card 5: Completed Galleries */}
          <div
            className="card card-elevated"
            style={{
              padding: '18px 20px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
            }}
          >
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                background: 'rgba(6, 182, 212, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <CheckCircle2 size={20} color="#06b6d4" />
            </div>
            <div>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700 }}>
                Completed
              </div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#06b6d4', marginTop: '2px' }} id="stat-completed-galleries">
                {stats.completedGalleries}
              </div>
            </div>
          </div>
        </div>

        {/* Filter, Search, and Sort Toolbar */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            marginBottom: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
          id="dashboard-toolbar"
        >
          {/* Top Bar: Search Box and Sort Controls */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Search Input (Searches case-insensitively by gallery name) */}
            <div
              style={{
                flex: 1,
                minWidth: '220px',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Search
                size={16}
                color="var(--text-muted)"
                style={{ position: 'absolute', left: '12px', pointerEvents: 'none' }}
              />
              <input
                type="text"
                placeholder="Search galleries by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 36px 9px 36px',
                  fontSize: '13px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(12, 17, 30, 0.85)',
                  border: '1px solid var(--border-medium)',
                  color: '#ffffff',
                  outline: 'none',
                }}
                id="search-galleries-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  title="Clear search"
                  style={{
                    position: 'absolute',
                    right: '10px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2px',
                  }}
                  id="btn-clear-search-input"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            {/* Sort Toggle (Newest / Oldest) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ArrowUpDown size={13} />
                <span>Sort:</span>
              </span>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
                style={{
                  background: 'rgba(12, 17, 30, 0.85)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  color: '#ffffff',
                  fontSize: '12px',
                  padding: '8px 12px',
                  outline: 'none',
                  cursor: 'pointer',
                }}
                id="sort-galleries-select"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>
          </div>

          {/* Bottom Bar: Status Filter Tabs */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }} id="status-filter-tabs">
            <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginRight: '4px' }}>
              Filter:
            </span>
            {statusTabOptions.map((tab) => {
              const isSelected = statusFilter.toLowerCase() === tab.toLowerCase();
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  style={{
                    padding: '5px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    borderRadius: '20px',
                    background: isSelected ? '#2563eb' : 'rgba(15, 23, 42, 0.6)',
                    color: isSelected ? '#ffffff' : 'var(--text-muted)',
                    border: `1px solid ${isSelected ? '#3b82f6' : 'var(--border-subtle)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  id={`filter-tab-${tab.toLowerCase()}`}
                >
                  {tab}
                </button>
              );
            })}
          </div>
        </div>

        {/* LOADING STATE */}
        {isLoading && (
          <div
            style={{
              padding: '64px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}
            id="dashboard-loading-state"
          >
            <RefreshCw size={28} color="#3b82f6" className="spin" />
            <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              Loading galleries...
            </span>
          </div>
        )}

        {/* INITIAL ERROR STATE (When no galleries loaded) */}
        {!isLoading && errorMessage && galleries.length === 0 && (
          <div
            className="card"
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-lg)',
              background: 'rgba(239, 68, 68, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '14px',
              maxWidth: '480px',
              margin: '32px auto',
            }}
            id="dashboard-initial-error-state"
          >
            <AlertCircle size={32} color="#ef4444" />
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', margin: 0 }}>
              Unable to load galleries
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              {errorMessage}
            </p>
            <button
              onClick={() => loadDashboardData(false)}
              className="btn btn-primary"
              style={{ marginTop: '8px', padding: '9px 18px', fontSize: '13px' }}
            >
              Try Again
            </button>
          </div>
        )}

        {/* EMPTY STATE: NO GALLERIES AT ALL */}
        {!isLoading && !errorMessage && galleries.length === 0 && (
          <div
            className="card"
            style={{
              padding: '60px 24px',
              textAlign: 'center',
              border: '1px dashed var(--border-medium)',
              borderRadius: 'var(--radius-lg)',
              background: 'rgba(12, 17, 30, 0.4)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '14px',
            }}
            id="dashboard-empty-galleries-state"
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: 'rgba(59, 130, 246, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Camera size={26} color="#60a5fa" />
            </div>

            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', margin: 0 }}>
              No galleries yet
            </h3>

            <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '420px', lineHeight: 1.5, margin: 0 }}>
              Create your first gallery to start collecting customer selections.
            </p>

            <button
              onClick={onCreateGallery}
              className="btn btn-primary"
              style={{ marginTop: '8px', padding: '10px 20px', fontSize: '13px' }}
              id="btn-create-first-gallery"
            >
              + Create Gallery
            </button>
          </div>
        )}

        {/* EMPTY STATE: FILTER OR SEARCH YIELDED ZERO RESULTS */}
        {!isLoading && galleries.length > 0 && filteredGalleries.length === 0 && (
          <div
            className="card"
            style={{
              padding: '50px 24px',
              textAlign: 'center',
              border: '1px dashed var(--border-medium)',
              borderRadius: 'var(--radius-lg)',
              background: 'rgba(12, 17, 30, 0.4)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '14px',
            }}
            id="dashboard-no-results-state"
          >
            <div
              style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Search size={22} color="var(--text-muted)" />
            </div>

            <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#ffffff', margin: 0 }}>
              {searchQuery && statusFilter !== 'All'
                ? `No ${statusFilter.toLowerCase()} galleries matching "${searchQuery}"`
                : searchQuery
                ? `No galleries matching "${searchQuery}"`
                : `No ${statusFilter.toLowerCase()} galleries found`}
            </h3>

            <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '420px', lineHeight: 1.5, margin: 0 }}>
              Try adjusting your search query or selecting a different status filter.
            </p>

            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('All');
              }}
              className="btn btn-outline"
              style={{ marginTop: '6px', padding: '8px 18px', fontSize: '12px' }}
              id="btn-clear-filters"
            >
              Clear Filters
            </button>
          </div>
        )}

        {/* GALLERY LIST */}
        {!isLoading && filteredGalleries.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
            id="dashboard-gallery-list"
          >
            {filteredGalleries.map((gallery) => {
              const badgeStyle = STATUS_BADGE_STYLES[gallery.status] || STATUS_BADGE_STYLES.draft;
              const isSelectionComplete = gallery.selectedCount === gallery.selectionLimit;
              const canAccessCustomerLink = gallery.status === 'active' || gallery.status === 'submitted';

              return (
                <div
                  key={gallery.id}
                  onClick={() => onOpenGallery(gallery.id)}
                  className="card card-elevated"
                  style={{
                    padding: '20px 24px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  id={`gallery-item-${gallery.id}`}
                >
                  {/* Top Row: Gallery Name, Status Badge, Date */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          background: 'rgba(37, 99, 235, 0.12)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <FolderOpen size={18} color="#60a5fa" />
                      </div>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                          {gallery.name}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          ID: <code style={{ color: '#93c5fd', fontSize: '11px' }}>{gallery.id}</code>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {/* Status Badge */}
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '3px 10px',
                          borderRadius: '20px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          background: badgeStyle.bg,
                          color: badgeStyle.color,
                          border: `1px solid ${badgeStyle.border}`,
                        }}
                        id={`badge-status-${gallery.id}`}
                      >
                        {STATUS_LABELS[gallery.status] || gallery.status}
                      </span>

                      {/* Created Date */}
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Created: {formatGalleryDate(gallery.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Status Meaning Description */}
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      lineHeight: 1.4,
                    }}
                    id={`status-description-${gallery.id}`}
                  >
                    {STATUS_DESCRIPTIONS[gallery.status] || ''}
                  </div>

                  {/* Middle Row: Photo Count & Selection Progress */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '20px',
                      padding: '12px 16px',
                      background: 'rgba(9, 13, 22, 0.6)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {/* Photos Count */}
                    <div style={{ minWidth: '120px' }}>
                      <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
                        Photos
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', marginTop: '2px' }}>
                        {gallery.totalPhotos} photos
                      </div>
                    </div>

                    {/* Selection Progress */}
                    <div style={{ flex: 1, minWidth: '220px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Selection Progress:
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '13px',
                              fontWeight: 800,
                              color: isSelectionComplete ? '#10b981' : '#60a5fa',
                            }}
                            id={`progress-count-${gallery.id}`}
                          >
                            Selected: {gallery.selectedCount} / {gallery.selectionLimit}
                          </span>
                          {/* Exact status indicators */}
                          {gallery.status === 'active' && isSelectionComplete && (
                            <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 700 }}>
                              (Limit reached - Awaiting submission)
                            </span>
                          )}
                          {gallery.status === 'submitted' && (
                            <span style={{ fontSize: '11px', color: '#a855f7', fontWeight: 700 }}>
                              (Selection complete)
                            </span>
                          )}
                          {gallery.status === 'completed' && (
                            <span style={{ fontSize: '11px', color: '#06b6d4', fontWeight: 700 }}>
                              (Completed)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Visual Progress Bar (Max 100%) */}
                      <div
                        style={{
                          width: '100%',
                          height: '6px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          borderRadius: '3px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${gallery.progressPercentage}%`,
                            height: '100%',
                            background: isSelectionComplete
                              ? '#10b981'
                              : 'linear-gradient(90deg, #2563eb, #60a5fa)',
                            transition: 'width 0.2s ease',
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Customer Gallery Link Section (Dedicated for Active & Submitted) */}
                  {canAccessCustomerLink && (
                    <div
                      style={{
                        padding: '12px 16px',
                        background: 'rgba(15, 23, 42, 0.75)',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}
                      id={`customer-link-section-${gallery.id}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#93c5fd',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          flexWrap: 'wrap',
                          gap: '6px',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <ExternalLink size={13} />
                          <span>Customer Gallery Link</span>
                        </span>
                        <span style={{ color: 'var(--text-muted)', textTransform: 'none', fontWeight: 500, fontSize: '11px' }}>
                          Public link — No login required
                        </span>
                      </div>

                      {/* URL & Action Controls (Wraps / stacks naturally on mobile) */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          flexWrap: 'wrap',
                        }}
                      >
                        {/* Readonly Truncated URL box */}
                        <div
                          style={{
                            flex: '1 1 200px',
                            minWidth: 0,
                            background: 'rgba(9, 13, 22, 0.85)',
                            border: '1px solid var(--border-medium)',
                            borderRadius: '6px',
                            padding: '7px 10px',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <code
                            style={{
                              fontSize: '12px',
                              color: '#e2e8f0',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: 'block',
                              width: '100%',
                              fontFamily: 'monospace',
                            }}
                            id={`url-display-${gallery.id}`}
                            title={getCustomerGalleryUrl(gallery.id)}
                          >
                            {getCustomerGalleryUrl(gallery.id)}
                          </code>
                        </div>

                        {/* Action buttons */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            flexWrap: 'wrap',
                            flexShrink: 0,
                          }}
                        >
                          <button
                            type="button"
                            onClick={(e) => handleCopyCustomerLink(e, gallery.id)}
                            className={`btn ${copiedGalleryId === gallery.id ? 'btn-primary' : 'btn-outline'}`}
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              whiteSpace: 'nowrap',
                            }}
                            title="Copy customer gallery link"
                            id={`btn-copy-link-${gallery.id}`}
                          >
                            {copiedGalleryId === gallery.id ? (
                              <>
                                <Check size={13} color="#10b981" />
                                <span style={{ color: '#10b981', fontWeight: 700 }}>Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy size={13} />
                                <span>Copy Link</span>
                              </>
                            )}
                          </button>

                          {hasWebShare && (
                            <button
                              type="button"
                              onClick={(e) => handleShareCustomerLink(e, { id: gallery.id, name: gallery.name })}
                              className="btn btn-outline"
                              style={{
                                padding: '6px 12px',
                                fontSize: '12px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                whiteSpace: 'nowrap',
                              }}
                              title="Share customer gallery"
                              id={`btn-share-link-${gallery.id}`}
                            >
                              <Share2 size={13} />
                              <span>Share</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => handleOpenCustomerLink(e, gallery.id)}
                            className="btn btn-outline"
                            style={{
                              padding: '6px 12px',
                              fontSize: '12px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              whiteSpace: 'nowrap',
                            }}
                            title="Open customer view in new tab"
                            id={`btn-customer-view-${gallery.id}`}
                          >
                            <ExternalLink size={13} />
                            <span>Open Gallery</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Bottom Row: Actions */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                      paddingTop: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {/* Retrieve Selected Originals Action (Available for Submitted, or Active with complete selections) */}
                      {((gallery.status === 'submitted') || (gallery.status === 'active' && isSelectionComplete)) &&
                        onOpenRetrieval && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenRetrieval(gallery.id);
                            }}
                            className="btn btn-outline"
                            style={{
                              padding: '6px 14px',
                              fontSize: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              borderColor: gallery.status === 'submitted' ? '#a855f7' : 'rgba(16, 185, 129, 0.4)',
                              color: gallery.status === 'submitted' ? '#a855f7' : '#10b981',
                              fontWeight: 700,
                            }}
                            id={`btn-retrieve-originals-${gallery.id}`}
                          >
                            <DownloadCloud size={13} />
                            <span>Retrieve Originals</span>
                          </button>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {/* Complete Gallery Indicator */}
                      {gallery.status === 'completed' && (
                        <span
                          style={{
                            fontSize: '12px',
                            color: '#06b6d4',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                          }}
                          id={`badge-completed-indicator-${gallery.id}`}
                        >
                          <CheckCircle2 size={13} />
                          <span>Completed</span>
                        </span>
                      )}

                      {/* Action Button: Status-aware label */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenGallery(gallery.id);
                        }}
                        className="btn btn-primary"
                        style={{ padding: '6px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}
                        id={`btn-open-gallery-${gallery.id}`}
                      >
                        {gallery.status === 'draft' ? (
                          <span>Continue Setup</span>
                        ) : gallery.status === 'completed' ? (
                          <span>View Gallery</span>
                        ) : gallery.status === 'archived' ? (
                          <span>View Details</span>
                        ) : (
                          <span>Open Gallery</span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Link / Share Feedback Toast */}
      {feedbackToast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 100,
            padding: '10px 18px',
            borderRadius: 'var(--radius-sm)',
            background:
              feedbackToast.type === 'error'
                ? 'rgba(239, 68, 68, 0.95)'
                : 'rgba(15, 23, 42, 0.95)',
            border: `1px solid ${
              feedbackToast.type === 'error'
                ? '#ef4444'
                : feedbackToast.type === 'success'
                ? '#10b981'
                : '#3b82f6'
            }`,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backdropFilter: 'blur(8px)',
          }}
          id="dashboard-feedback-toast"
        >
          {feedbackToast.type === 'success' && <Check size={15} color="#10b981" />}
          {feedbackToast.type === 'info' && <ExternalLink size={15} color="#60a5fa" />}
          {feedbackToast.type === 'error' && <AlertCircle size={15} color="#ffffff" />}
          <span>{feedbackToast.message}</span>
        </div>
      )}
    </div>
  );
}

export default GalleryDashboard;
