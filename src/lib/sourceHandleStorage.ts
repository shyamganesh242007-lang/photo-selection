/**
 * Source Directory Handle Persistence & Permission Management
 * Uses memory cache and browser IndexedDB to retain FileSystemDirectoryHandle instances
 * across workflow steps and page reloads.
 */

const memoryHandleCache = new Map<string, any>();

const DB_NAME = 'photo_selection_handles_db';
const STORE_NAME = 'directory_handles';

function openHandleDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Stores a FileSystemDirectoryHandle in memory cache and IndexedDB
 */
export async function storeSourceDirectoryHandle(
  key: string,
  handle: any
): Promise<void> {
  if (!key || !handle) return;
  const normalizedKey = key.trim().toLowerCase();
  memoryHandleCache.set(normalizedKey, handle);

  try {
    const db = await openHandleDb();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, normalizedKey);
  } catch (e) {
    console.warn('Could not persist directory handle to IndexedDB:', e);
  }
}

/**
 * Retrieves a retained FileSystemDirectoryHandle by galleryId or galleryName
 */
export async function getStoredSourceDirectoryHandle(
  key: string
): Promise<any | null> {
  if (!key) return null;
  const normalizedKey = key.trim().toLowerCase();
  const inMem = memoryHandleCache.get(normalizedKey);
  if (inMem) return inMem;

  try {
    const db = await openHandleDb();
    if (!db) return null;
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(normalizedKey);
    return new Promise((resolve) => {
      req.onsuccess = () => {
        const result = req.result || null;
        if (result) {
          memoryHandleCache.set(normalizedKey, result);
        }
        resolve(result);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Verifies or requests permission on an existing stored FileSystemDirectoryHandle
 * without opening a folder picker dialog.
 */
export async function verifyHandlePermission(
  handle: any,
  mode: 'read' | 'readwrite' = 'read'
): Promise<boolean> {
  if (!handle || typeof handle.queryPermission !== 'function') return false;
  try {
    const status = await handle.queryPermission({ mode });
    if (status === 'granted') {
      return true;
    }
    // Requests permission on the SAME handle without opening a new folder picker
    const req = await handle.requestPermission({ mode });
    return req === 'granted';
  } catch (err) {
    console.warn('Error checking handle permission:', err);
    return false;
  }
}
