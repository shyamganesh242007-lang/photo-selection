/**
 * Gallery Link, Clipboard & Web Share API Utilities
 * STEP 14: Gallery Link, Customer Sharing & Lifecycle UX
 */

export interface ShareableGallery {
  id: string;
  name: string;
}

export type ShareResult = 'shared' | 'cancelled' | 'failed' | 'unsupported';

/**
 * Returns the exact public customer URL using the current website origin
 * Exposes no local paths, original filenames, or storage credentials.
 */
export function getCustomerGalleryUrl(galleryId: string): string {
  if (typeof window === 'undefined') {
    return `/gallery/${galleryId}`;
  }
  return `${window.location.origin}/gallery/${galleryId}`;
}

/**
 * Checks if navigator.share (Web Share API) is available in the current browser/device
 */
export function isWebShareSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  );
}

/**
 * Copies customer gallery link to clipboard with fallback for non-secure contexts or older browsers.
 * Returns true if copied successfully, false otherwise.
 */
export async function copyCustomerGalleryLink(galleryId: string): Promise<boolean> {
  const url = getCustomerGalleryUrl(galleryId);

  // 1. Try modern Clipboard API
  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard.writeText failed, using textarea fallback:', err);
    }
  }

  // 2. Fallback: temporary hidden textarea
  try {
    const textArea = document.createElement('textarea');
    textArea.value = url;
    textArea.style.position = 'fixed';
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.width = '2em';
    textArea.style.height = '2em';
    textArea.style.padding = '0';
    textArea.style.border = 'none';
    textArea.style.outline = 'none';
    textArea.style.boxShadow = 'none';
    textArea.style.background = 'transparent';
    textArea.style.opacity = '0';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Clipboard copy fallback error:', err);
    return false;
  }
}

/**
 * Shares the customer gallery URL using navigator.share if available
 */
export async function shareCustomerGalleryLink(gallery: ShareableGallery): Promise<ShareResult> {
  if (!isWebShareSupported()) {
    return 'unsupported';
  }

  const url = getCustomerGalleryUrl(gallery.id);
  const shareData: ShareData = {
    title: `${gallery.name} - Photo Selection`,
    text: `Select your favorite photos from ${gallery.name}`,
    url,
  };

  try {
    // Check if device can share this payload
    if (navigator.canShare && !navigator.canShare(shareData)) {
      return 'unsupported';
    }
    await navigator.share(shareData);
    return 'shared';
  } catch (err: any) {
    if (err && (err.name === 'AbortError' || err.code === 20)) {
      return 'cancelled';
    }
    console.warn('navigator.share encountered error:', err);
    return 'failed';
  }
}
