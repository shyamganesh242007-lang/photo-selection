import type { Gallery, Photo, PhotoMapping } from '../../types';

export interface IDatabaseService {
  getGalleries(): Promise<Gallery[]>;
  getGallery(id: string): Promise<Gallery | null>;
  saveGallery(gallery: Gallery): Promise<void>;
  updateGalleryStatus(galleryId: string, status: Gallery['status']): Promise<void>;
  getPhotosByGallery(galleryId: string): Promise<Photo[]>;
  savePhotos(photos: Photo[]): Promise<void>;
  togglePhotoSelection(
    galleryId: string,
    photoId: string
  ): Promise<{
    success: boolean;
    isSelected: boolean;
    currentCount: number;
    limit: number;
    error?: string;
  }>;
  submitCustomerSelection(
    galleryId: string
  ): Promise<{
    success: boolean;
    submittedCount: number;
    error?: string;
  }>;
  getPhotoMappings(galleryId: string): Promise<PhotoMapping[]>;
}
