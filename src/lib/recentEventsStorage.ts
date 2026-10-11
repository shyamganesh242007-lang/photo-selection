/**
 * Local Recent Events Storage Helper
 * 
 * Manages minimal event display history stored in localStorage under
 * the key 'photo_selection_recent_events'.
 * 
 * Important Lifecycle Architectural Principle:
 * Recent Events is lightweight local UI history, NOT the source of truth for cloud data.
 * When cloud storage and Supabase database rows (selections, photos, galleries) are deleted,
 * the event name can still survive and be displayed in Recent Events until the photographer
 * explicitly clicks the small [ × ] button to dismiss it.
 */

export interface LocalRecentEvent {
  galleryId: string;
  galleryName: string;
  completedAt: string;
  cleanupStatus: 'scheduled' | 'deleted' | 'failed';
  cleanupAfter?: string;
}

export const RECENT_EVENTS_STORAGE_KEY = 'photo_selection_recent_events';

/**
 * Retrieves all saved recent events from localStorage.
 */
export function getRecentEventsFromStorage(): LocalRecentEvent[] {
  try {
    const raw = localStorage.getItem(RECENT_EVENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) => Boolean(item && typeof item === 'object' && item.galleryId && item.galleryName)
    );
  } catch (err) {
    console.warn('Failed to read recent events from localStorage:', err);
    return [];
  }
}

/**
 * Upserts a recent event into localStorage.
 * Places the newest/updated event at the beginning and limits total stored items to 10.
 */
export function saveRecentEventToStorage(event: LocalRecentEvent): void {
  try {
    const existing = getRecentEventsFromStorage();
    const filtered = existing.filter((e) => e.galleryId !== event.galleryId);
    const updated = [event, ...filtered].slice(0, 10);
    localStorage.setItem(RECENT_EVENTS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save recent event to localStorage:', err);
  }
}

/**
 * Updates the cleanupStatus of a recent event in localStorage.
 */
export function updateRecentEventStatusInStorage(
  galleryId: string,
  status: 'scheduled' | 'deleted' | 'failed'
): void {
  try {
    const existing = getRecentEventsFromStorage();
    const updated = existing.map((e) =>
      e.galleryId === galleryId ? { ...e, cleanupStatus: status } : e
    );
    localStorage.setItem(RECENT_EVENTS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to update recent event status in localStorage:', err);
  }
}

/**
 * Removes a recent event from localStorage (when photographer clicks [ × ]).
 * Does NOT touch any local files or cloud databases.
 */
export function removeRecentEventFromStorage(galleryId: string): void {
  try {
    const existing = getRecentEventsFromStorage();
    const updated = existing.filter((e) => e.galleryId !== galleryId);
    localStorage.setItem(RECENT_EVENTS_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to remove recent event from localStorage:', err);
  }
}
