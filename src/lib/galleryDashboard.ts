import type { SupabaseClient } from '@supabase/supabase-js';

export type GalleryStatus =
  | 'draft'
  | 'processing'
  | 'active'
  | 'submitted'
  | 'completed'
  | 'archived';

export interface DashboardGalleryItem {
  id: string;
  name: string;
  selectionLimit: number;
  totalPhotos: number;
  selectedCount: number;
  status: GalleryStatus;
  createdAt: string;
  updatedAt: string;
  progressPercentage: number;
}

export interface DashboardSummaryStats {
  totalGalleries: number;
  draftGalleries: number;
  activeGalleries: number;
  submittedGalleries: number;
  completedGalleries: number;
}

export interface GalleryDashboardData {
  galleries: DashboardGalleryItem[];
  stats: DashboardSummaryStats;
}

export const STATUS_LABELS: Record<GalleryStatus, string> = {
  draft: 'Draft',
  processing: 'Processing',
  active: 'Active',
  submitted: 'Submitted',
  completed: 'Completed',
  archived: 'Archived',
};

export const STATUS_BADGE_STYLES: Record<
  GalleryStatus,
  { bg: string; color: string; border: string }
> = {
  draft: {
    bg: 'rgba(148, 163, 184, 0.15)',
    color: '#94a3b8',
    border: 'rgba(148, 163, 184, 0.3)',
  },
  processing: {
    bg: 'rgba(56, 189, 248, 0.15)',
    color: '#38bdf8',
    border: 'rgba(56, 189, 248, 0.3)',
  },
  active: {
    bg: 'rgba(16, 185, 129, 0.15)',
    color: '#10b981',
    border: 'rgba(16, 185, 129, 0.3)',
  },
  submitted: {
    bg: 'rgba(168, 85, 247, 0.15)',
    color: '#a855f7',
    border: 'rgba(168, 85, 247, 0.3)',
  },
  completed: {
    bg: 'rgba(6, 182, 212, 0.15)',
    color: '#06b6d4',
    border: 'rgba(6, 182, 212, 0.3)',
  },
  archived: {
    bg: 'rgba(245, 158, 11, 0.15)',
    color: '#f59e0b',
    border: 'rgba(245, 158, 11, 0.3)',
  },
};

export const STATUS_DESCRIPTIONS: Record<GalleryStatus, string> = {
  draft: 'Gallery setup incomplete. Finish configuration to activate.',
  processing: 'Preview generation and upload in progress.',
  active: 'Client selection in progress. Customer link is active.',
  submitted: 'Client selection submitted. Ready for original retrieval.',
  completed: 'Originals retrieved and cloud previews cleaned up.',
  archived: 'Historical read-only gallery.',
};


/**
 * Fetches galleries, selections count, and computes summary statistics
 */
export async function fetchGalleryDashboardData(
  supabase: SupabaseClient
): Promise<GalleryDashboardData> {
  // 1. Fetch galleries ordered by creation date
  const { data: galleryRows, error: gErr } = await supabase
    .from('galleries')
    .select('id, name, selection_limit, total_photos, status, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (gErr) {
    throw new Error(`Failed to load galleries: ${gErr.message}`);
  }

  const rawGalleries = galleryRows || [];

  // 2. Fetch selections counts across galleries
  const { data: selectionRows, error: sErr } = await supabase
    .from('selections')
    .select('gallery_id');

  if (sErr) {
    console.warn('Could not query selections counts:', sErr.message);
  }

  const selectionCountsByGallery = new Map<string, number>();
  (selectionRows || []).forEach((row) => {
    const current = selectionCountsByGallery.get(row.gallery_id) || 0;
    selectionCountsByGallery.set(row.gallery_id, current + 1);
  });

  // 3. Build gallery items with progress
  const galleries: DashboardGalleryItem[] = rawGalleries.map((g) => {
    const selectedCount = selectionCountsByGallery.get(g.id) || 0;
    const limit = g.selection_limit || 1;
    const progressPercentage = Math.min(100, Math.max(0, Math.round((selectedCount / limit) * 100)));

    return {
      id: g.id,
      name: g.name,
      selectionLimit: g.selection_limit,
      totalPhotos: g.total_photos,
      selectedCount,
      status: (g.status as GalleryStatus) || 'draft',
      createdAt: g.created_at,
      updatedAt: g.updated_at,
      progressPercentage,
    };
  });

  // 4. Calculate top summary cards metrics (Total, Draft, Active, Submitted, Completed)
  let draftCount = 0;
  let activeCount = 0;
  let submittedCount = 0;
  let completedCount = 0;

  galleries.forEach((g) => {
    if (g.status === 'draft') draftCount++;
    else if (g.status === 'active') activeCount++;
    else if (g.status === 'submitted') submittedCount++;
    else if (g.status === 'completed') completedCount++;
  });

  const stats: DashboardSummaryStats = {
    totalGalleries: galleries.length,
    draftGalleries: draftCount,
    activeGalleries: activeCount,
    submittedGalleries: submittedCount,
    completedGalleries: completedCount,
  };

  return {
    galleries,
    stats,
  };
}

/**
 * Formats ISO date string to a human-readable representation
 */
export function formatGalleryDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Recently';
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Recently';
  }
}
