import type { Gallery, Photo, PhotoMapping, StudioProfile, CloudflareR2Config } from '../types';

export const initialStudioProfile: StudioProfile = {
  studioName: 'ZeeBook Studio Pro',
  tagline: 'High-End Wedding & Fashion Photography ERP',
  contactEmail: 'contact@zeebookstudio.com',
  phone: '+91 98765 43210',
  currency: 'INR',
  watermarkText: 'ZEEBOOK STUDIO PROOF',
};

export const initialR2Config: CloudflareR2Config = {
  accountId: 'e92fa84b1136b9e288921cf8923a1',
  bucketName: 'zeebook-proofing-vault',
  accessKeyId: 'r2_ak_84719284710293847',
  secretAccessKey: '********************************',
  publicDomain: 'https://proofing.zeebookstudio.com',
  isConnected: true,
  lifecycleDays: 30,
};

// Curated high quality photography images for realistic rendering
const samplePhotoUrls = [
  'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1520854221256-17451cc331bf?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1606800052052-a08af7148866?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1532712938310-34cb3982ef74?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1544078751-58fee2d8a03b?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1529636798458-92182e662485?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1523438885200-e635ba2c371e?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1545232979-8bf68ee9b1af?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1509927083803-4bd519298ac4?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1520854221256-17451cc331bf?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?auto=format&fit=crop&w=1200&q=80',
];

const categories = ['Ceremony', 'Portraits', 'Pre-Wedding', 'Reception', 'Family & Guests', 'Rituals'];

// Helper to generate 1000 photos for Shyam Wedding
export function generateShyamWeddingPhotos(count = 1000): Photo[] {
  const photos: Photo[] = [];
  const galleryId = 'gal_shyam_wedding_2026';

  for (let i = 1; i <= count; i++) {
    const pad = String(i).padStart(4, '0');
    const photoId = `p_shyam_${pad}_${Math.random().toString(36).substring(2, 7)}`;
    const originalExt = i % 3 === 0 ? 'CR3' : i % 2 === 0 ? 'ARW' : 'JPG';
    const originalFilename = `IMG_${pad}.${originalExt}`;
    const category = categories[i % categories.length];
    const originalRelativePath = `${category}/${originalFilename}`;
    const imgUrl = samplePhotoUrls[(i - 1) % samplePhotoUrls.length];

    // Pre-select 298 photos to let the user immediately test the exact 300 / 300 condition!
    // (selecting 2 more will reach 300, attempting to select 3rd will block with 301 limit)
    const isSelected = i <= 298;

    photos.push({
      photoId,
      galleryId,
      originalFilename,
      originalRelativePath,
      originalSizeBytes: 14 * 1024 * 1024 + (i * 13107) % (8 * 1024 * 1024), // ~14MB - 22MB
      webpStoragePath: `galleries/${galleryId}/${photoId}.webp`,
      webpPreviewUrl: imgUrl,
      webpSizeBytes: 135000 + (i * 97) % 45000, // ~135KB - 180KB
      dimensions: { width: 2400, height: 1600 },
      category,
      isSelected,
      originalCopied: false,
      copyVerified: false,
    });
  }

  return photos;
}

export const initialGalleries: Gallery[] = [
  {
    id: 'gal_shyam_wedding_2026',
    title: 'Shyam & Ananya Wedding',
    clientName: 'Shyam Kumar',
    clientEmail: 'shyam.kumar@example.com',
    clientPhone: '+91 98450 11223',
    localFolderPath: 'D:\\Events\\Shyam Wedding\\',
    selectedFolderExportPath: 'D:\\Events\\Selected Shyam Wedding\\',
    totalPhotos: 1000,
    selectionLimit: 300,
    selectedCount: 298,
    status: 'active',
    createdAt: '2026-10-08T10:30:00Z',
    submittedAt: null,
    copiedAt: null,
    cloudCleanupStatus: 'pending',
    webpCompressionQuality: 82,
    shareToken: 'shyam-w-300-proof-8a9d',
    shareUrl: '/gallery/gal_shyam_wedding_2026',
    coverPhotoUrl: samplePhotoUrls[0],
    notes: 'Premium traditional wedding album. Selection limit set strictly to 300 spreads.',
  },
  {
    id: 'gal_rohan_prewedding_2026',
    title: 'Rohan & Priya Pre-Wedding',
    clientName: 'Rohan Verma',
    clientEmail: 'rohan.v@example.com',
    clientPhone: '+91 97123 44556',
    localFolderPath: 'D:\\Events\\Rohan Pre-Wedding\\',
    selectedFolderExportPath: 'D:\\Events\\Selected Rohan Pre-Wedding\\',
    totalPhotos: 500,
    selectionLimit: 100,
    selectedCount: 100,
    status: 'submitted',
    createdAt: '2026-10-04T14:15:00Z',
    submittedAt: '2026-10-09T18:42:00Z',
    copiedAt: null,
    cloudCleanupStatus: 'pending',
    webpCompressionQuality: 82,
    shareToken: 'rohan-pw-100-proof-3f2b',
    shareUrl: '/gallery/gal_rohan_prewedding_2026',
    coverPhotoUrl: samplePhotoUrls[4],
    notes: 'Client submitted exactly 100 / 100 photos! Ready for local desktop original copy.',
  },
  {
    id: 'gal_aarav_birthday_2026',
    title: 'Aarav 1st Birthday Bash',
    clientName: 'Meera & Rajesh',
    clientEmail: 'meera.rajesh@example.com',
    clientPhone: '+91 99001 22334',
    localFolderPath: 'D:\\Events\\Aarav Birthday\\',
    selectedFolderExportPath: 'D:\\Events\\Selected Aarav Birthday\\',
    totalPhotos: 450,
    selectionLimit: 80,
    selectedCount: 80,
    status: 'completed',
    createdAt: '2026-09-28T11:00:00Z',
    submittedAt: '2026-10-01T15:20:00Z',
    copiedAt: '2026-10-02T09:30:00Z',
    cloudCleanupStatus: 'cleaned',
    webpCompressionQuality: 80,
    shareToken: 'aarav-bday-80-proof-7c1a',
    shareUrl: '/gallery/gal_aarav_birthday_2026',
    coverPhotoUrl: samplePhotoUrls[7],
    notes: 'Original master files successfully copied and verified. WebP previews purged from R2.',
  },
  {
    id: 'gal_kavita_engagement_2026',
    title: 'Kavita & Dev Engagement',
    clientName: 'Dev Sharma',
    clientEmail: 'dev.sharma@example.com',
    clientPhone: '+91 98866 55443',
    localFolderPath: 'D:\\Events\\Kavita Engagement\\',
    selectedFolderExportPath: 'D:\\Events\\Selected Kavita Engagement\\',
    totalPhotos: 800,
    selectionLimit: 250,
    selectedCount: 0,
    status: 'draft',
    createdAt: '2026-10-10T08:00:00Z',
    submittedAt: null,
    copiedAt: null,
    cloudCleanupStatus: 'pending',
    webpCompressionQuality: 82,
    shareToken: 'kavita-eng-250-proof-5e4d',
    shareUrl: '/gallery/gal_kavita_engagement_2026',
    coverPhotoUrl: samplePhotoUrls[2],
    notes: 'Folder scanned locally. Awaiting WebP compression and R2 preview upload.',
  },
];

export function generatePhotoMappings(photos: Photo[]): PhotoMapping[] {
  return photos.map((p) => ({
    photoId: p.photoId,
    galleryId: p.galleryId,
    originalFilename: p.originalFilename,
    originalRelativePath: p.originalRelativePath,
    originalSizeBytes: p.originalSizeBytes,
    webpStoragePath: p.webpStoragePath,
  }));
}
