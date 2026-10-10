import type { IDatabaseService } from './IDatabaseService';
import type { Gallery, Photo, PhotoMapping } from '../../types';
import { initialGalleries, generateShyamWeddingPhotos, generatePhotoMappings } from '../../data/mockData';

const GALLERIES_STORAGE_KEY = 'zeebook_studio_galleries_v1';
const PHOTOS_STORAGE_KEY_PREFIX = 'zeebook_studio_photos_v1_';

export class LocalStorageDatabaseService implements IDatabaseService {
  private inMemoryGalleries: Gallery[] = [];
  private inMemoryPhotos: Map<string, Photo[]> = new Map();

  constructor() {
    this.initStorage();
  }

  private initStorage(): void {
    // Load galleries
    const savedGalleries = localStorage.getItem(GALLERIES_STORAGE_KEY);
    if (savedGalleries) {
      try {
        this.inMemoryGalleries = JSON.parse(savedGalleries);
      } catch {
        this.inMemoryGalleries = initialGalleries;
        this.persistGalleries();
      }
    } else {
      this.inMemoryGalleries = initialGalleries;
      this.persistGalleries();
    }

    // Initialize Shyam Wedding photos
    const shyamGalleryId = 'gal_shyam_wedding_2026';
    const savedPhotos = localStorage.getItem(`${PHOTOS_STORAGE_KEY_PREFIX}${shyamGalleryId}`);
    if (savedPhotos) {
      try {
        this.inMemoryPhotos.set(shyamGalleryId, JSON.parse(savedPhotos));
      } catch {
        const shyamPhotos = generateShyamWeddingPhotos(1000);
        this.inMemoryPhotos.set(shyamGalleryId, shyamPhotos);
        this.persistPhotos(shyamGalleryId);
      }
    } else {
      const shyamPhotos = generateShyamWeddingPhotos(1000);
      this.inMemoryPhotos.set(shyamGalleryId, shyamPhotos);
      this.persistPhotos(shyamGalleryId);
    }
  }

  private persistGalleries(): void {
    try {
      localStorage.setItem(GALLERIES_STORAGE_KEY, JSON.stringify(this.inMemoryGalleries));
    } catch (e) {
      console.warn('Storage quota exceeded, keeping in memory', e);
    }
  }

  private persistPhotos(galleryId: string): void {
    try {
      const photos = this.inMemoryPhotos.get(galleryId) || [];
      localStorage.setItem(`${PHOTOS_STORAGE_KEY_PREFIX}${galleryId}`, JSON.stringify(photos));
    } catch (e) {
      console.warn('Photos storage quota warning, using memory fallback', e);
    }
  }

  async getGalleries(): Promise<Gallery[]> {
    return [...this.inMemoryGalleries];
  }

  async getGallery(id: string): Promise<Gallery | null> {
    return this.inMemoryGalleries.find((g) => g.id === id) || null;
  }

  async saveGallery(gallery: Gallery): Promise<void> {
    const idx = this.inMemoryGalleries.findIndex((g) => g.id === gallery.id);
    if (idx >= 0) {
      this.inMemoryGalleries[idx] = { ...gallery };
    } else {
      this.inMemoryGalleries.unshift(gallery);
    }
    this.persistGalleries();
  }

  async updateGalleryStatus(galleryId: string, status: Gallery['status']): Promise<void> {
    const gallery = this.inMemoryGalleries.find((g) => g.id === galleryId);
    if (gallery) {
      gallery.status = status;
      if (status === 'submitted') {
        gallery.submittedAt = new Date().toISOString();
      }
      this.persistGalleries();
    }
  }

  async getPhotosByGallery(galleryId: string): Promise<Photo[]> {
    let photos = this.inMemoryPhotos.get(galleryId);
    if (!photos) {
      const saved = localStorage.getItem(`${PHOTOS_STORAGE_KEY_PREFIX}${galleryId}`);
      if (saved) {
        try {
          photos = JSON.parse(saved);
          this.inMemoryPhotos.set(galleryId, photos!);
        } catch {
          photos = [];
        }
      } else {
        if (galleryId === 'gal_shyam_wedding_2026') {
          photos = generateShyamWeddingPhotos(1000);
          this.inMemoryPhotos.set(galleryId, photos);
          this.persistPhotos(galleryId);
        } else {
          photos = [];
        }
      }
    }
    return photos || [];
  }

  async savePhotos(photos: Photo[]): Promise<void> {
    if (photos.length === 0) return;
    const galleryId = photos[0].galleryId;
    this.inMemoryPhotos.set(galleryId, [...photos]);
    this.persistPhotos(galleryId);
  }

  /**
   * Toggles selection of a photo with strict selection limit enforcement!
   */
  async togglePhotoSelection(
    galleryId: string,
    photoId: string
  ): Promise<{
    success: boolean;
    isSelected: boolean;
    currentCount: number;
    limit: number;
    error?: string;
  }> {
    const gallery = await this.getGallery(galleryId);
    if (!gallery) {
      return { success: false, isSelected: false, currentCount: 0, limit: 0, error: 'Gallery not found' };
    }

    if (gallery.status === 'submitted' || gallery.status === 'completed') {
      return {
        success: false,
        isSelected: false,
        currentCount: gallery.selectedCount,
        limit: gallery.selectionLimit,
        error: 'Gallery selection is locked and already submitted.',
      };
    }

    const photos = await this.getPhotosByGallery(galleryId);
    const photo = photos.find((p) => p.photoId === photoId);
    if (!photo) {
      return {
        success: false,
        isSelected: false,
        currentCount: gallery.selectedCount,
        limit: gallery.selectionLimit,
        error: 'Photo not found',
      };
    }

    const currentSelectedCount = photos.filter((p) => p.isSelected).length;

    // RULE: If attempting to select and currentCount has already reached selectionLimit
    if (!photo.isSelected && currentSelectedCount >= gallery.selectionLimit) {
      return {
        success: false,
        isSelected: false,
        currentCount: currentSelectedCount,
        limit: gallery.selectionLimit,
        error: `Selection limit reached. You can select a maximum of ${gallery.selectionLimit} photos.`,
      };
    }

    // Toggle
    photo.isSelected = !photo.isSelected;
    const newSelectedCount = photos.filter((p) => p.isSelected).length;

    gallery.selectedCount = newSelectedCount;
    this.persistPhotos(galleryId);
    this.persistGalleries();

    return {
      success: true,
      isSelected: photo.isSelected,
      currentCount: newSelectedCount,
      limit: gallery.selectionLimit,
    };
  }

  /**
   * Submits customer selection with STRICT EXACT MATCH enforcement.
   * Cannot submit if count < limit.
   */
  async submitCustomerSelection(
    galleryId: string
  ): Promise<{
    success: boolean;
    submittedCount: number;
    error?: string;
  }> {
    const gallery = await this.getGallery(galleryId);
    if (!gallery) {
      return { success: false, submittedCount: 0, error: 'Gallery not found' };
    }

    const photos = await this.getPhotosByGallery(galleryId);
    const selectedCount = photos.filter((p) => p.isSelected).length;

    // RULE: STRICT CHECK
    if (selectedCount < gallery.selectionLimit) {
      const remaining = gallery.selectionLimit - selectedCount;
      return {
        success: false,
        submittedCount: selectedCount,
        error: `Please select ${remaining} more photo${remaining > 1 ? 's' : ''} before submitting.`,
      };
    }

    if (selectedCount > gallery.selectionLimit) {
      return {
        success: false,
        submittedCount: selectedCount,
        error: `Selection limit exceeded! Maximum allowed is ${gallery.selectionLimit}.`,
      };
    }

    // Exact count reached -> Mark as submitted & lock
    gallery.status = 'submitted';
    gallery.submittedAt = new Date().toISOString();
    gallery.selectedCount = selectedCount;

    this.persistGalleries();

    return {
      success: true,
      submittedCount: selectedCount,
    };
  }

  async getPhotoMappings(galleryId: string): Promise<PhotoMapping[]> {
    const photos = await this.getPhotosByGallery(galleryId);
    return generatePhotoMappings(photos);
  }
}

export const dbService = new LocalStorageDatabaseService();
