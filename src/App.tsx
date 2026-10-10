import React, { useState, useRef } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Camera,
  RefreshCw,
  AlertCircle,
  Hash,
  Plus,
  Info,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from './lib/supabase';

interface DetectedPhoto {
  filename: string;
  relativePath: string;
}

interface CreatedGallerySummary {
  id: string;
  name: string;
  totalPhotos: number;
  selectionLimit: number;
  status: string;
}

// Supported image extensions
const SUPPORTED_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'heif',
  'cr2',
  'cr3',
  'nef',
  'arw',
  'dng',
  'raw',
  'rw2',
  'orf',
  'pef',
  'tif',
  'tiff',
]);

export function App() {
  const [folderName, setFolderName] = useState<string | null>(null);
  const [detectedPhotos, setDetectedPhotos] = useState<DetectedPhoto[]>([]);
  const [selectionLimit, setSelectionLimit] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdSummary, setCreatedSummary] = useState<CreatedGallerySummary | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Recursive directory scanner for File System Access API
  const scanDirectoryHandle = async (
    dirHandle: any,
    currentPath = ''
  ): Promise<DetectedPhoto[]> => {
    const results: DetectedPhoto[] = [];

    for await (const entry of dirHandle.values()) {
      const entryRelativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      if (entry.kind === 'file') {
        const ext = entry.name.split('.').pop()?.toLowerCase() || '';
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          results.push({
            filename: entry.name,
            relativePath: entryRelativePath,
          });
        }
      } else if (entry.kind === 'directory') {
        try {
          const subResults = await scanDirectoryHandle(entry, entryRelativePath);
          results.push(...subResults);
        } catch (e) {
          console.warn('Subdirectory scan error:', e);
        }
      }
    }

    results.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
    return results;
  };

  // Trigger OS folder picker
  const handleAddFolderClick = async () => {
    setErrorMessage(null);

    // 1. Try File System Access API (Native OS folder picker)
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
        setIsScanning(true);

        const scanned = await scanDirectoryHandle(dirHandle, dirHandle.name);

        setIsScanning(false);
        if (scanned.length === 0) {
          setErrorMessage('No supported image files (JPG, PNG, WebP, HEIC, RAW) found in this folder.');
          return;
        }

        setFolderName(dirHandle.name);
        setDetectedPhotos(scanned);
        setSelectionLimit('');
        setCreatedSummary(null);
        return;
      } catch (err: any) {
        setIsScanning(false);
        if (err.name === 'AbortError') {
          return; // User cancelled
        }
        console.warn('showDirectoryPicker error, falling back to input:', err);
      }
    }

    // 2. Fallback to HTML5 directory input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // Fallback directory input handler
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsScanning(true);
    setErrorMessage(null);

    const scanned: DetectedPhoto[] = [];
    const firstPath = files[0].webkitRelativePath || '';
    const detectedName = firstPath.split('/')[0] || 'Selected Event';

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (SUPPORTED_EXTENSIONS.has(ext)) {
        scanned.push({
          filename: file.name,
          relativePath: file.webkitRelativePath || `${detectedName}/${file.name}`,
        });
      }
    }

    scanned.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));

    setIsScanning(false);
    if (scanned.length === 0) {
      setErrorMessage('No supported image files found in the selected folder.');
      return;
    }

    setFolderName(detectedName);
    setDetectedPhotos(scanned);
    setSelectionLimit('');
    setCreatedSummary(null);
  };

  // Reset folder selection
  const handleReset = () => {
    setFolderName(null);
    setDetectedPhotos([]);
    setSelectionLimit('');
    setErrorMessage(null);
    setCreatedSummary(null);
  };

  // Form submit: Create gallery and photos in Supabase
  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const limitNumber = parseInt(selectionLimit.trim(), 10);

    // Validation 1: Greater than 0
    if (isNaN(limitNumber) || limitNumber <= 0) {
      setErrorMessage('Selection limit must be a positive number greater than 0.');
      return;
    }

    // Validation 2: Cannot exceed detected photos count
    if (limitNumber > detectedPhotos.length) {
      setErrorMessage(
        `Selection limit cannot be greater than the number of detected photos (${detectedPhotos.length}).`
      );
      return;
    }

    if (!folderName) {
      setErrorMessage('Please select an event folder first.');
      return;
    }

    // Supabase Configuration Check
    if (!isSupabaseConfigured || !supabase) {
      setErrorMessage(
        'Supabase is not configured yet. Please add your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.'
      );
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Create row in galleries
      const { data: galleryRow, error: galleryError } = await supabase
        .from('galleries')
        .insert({
          name: folderName,
          selection_limit: limitNumber,
          total_photos: detectedPhotos.length,
          status: 'draft',
        })
        .select('id, name, selection_limit, total_photos, status')
        .single();

      if (galleryError) {
        throw new Error(`Database error creating gallery: ${galleryError.message}`);
      }

      if (!galleryRow) {
        throw new Error('Gallery was not created in the database.');
      }

      const galleryId = galleryRow.id;

      // 2. Prepare photo rows
      const photoRows = detectedPhotos.map((photo, index) => ({
        gallery_id: galleryId,
        original_filename: photo.filename,
        original_relative_path: photo.relativePath,
        sort_order: index,
        webp_storage_path: null,
      }));

      // Insert photos in batches of 250
      const BATCH_SIZE = 250;
      for (let i = 0; i < photoRows.length; i += BATCH_SIZE) {
        const batch = photoRows.slice(i, i + BATCH_SIZE);
        const { error: photosError } = await supabase.from('photos').insert(batch);

        if (photosError) {
          throw new Error(
            `Database error saving photos (batch ${Math.floor(i / BATCH_SIZE) + 1}): ${photosError.message}`
          );
        }
      }

      // Success
      setCreatedSummary({
        id: galleryRow.id,
        name: galleryRow.name,
        totalPhotos: galleryRow.total_photos,
        selectionLimit: galleryRow.selection_limit,
        status: galleryRow.status,
      });
      setIsSubmitting(false);
    } catch (err: any) {
      console.error('Error during gallery creation:', err);
      setIsSubmitting(false);
      setErrorMessage(err.message || 'An unexpected error occurred while saving to Supabase.');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-app)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Hidden folder input for browser directory selection */}
      <input
        type="file"
        ref={fileInputRef}
        // @ts-ignore
        webkitdirectory="true"
        directory="true"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      {/* Minimal Top Header */}
      <header
        style={{
          height: '64px',
          background: 'rgba(12, 17, 30, 0.85)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '0 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-sm)',
              background: 'linear-gradient(135deg, var(--primary-500) 0%, var(--primary-600) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 10px var(--primary-glow)',
            }}
          >
            <Camera size={18} color="#ffffff" />
          </div>
          <span
            style={{
              fontSize: '15px',
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: '-0.02em',
            }}
          >
            Photo Selection
          </span>
        </div>
      </header>

      {/* Main Single Page Area */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 20px',
        }}
      >
        <div style={{ width: '100%', maxWidth: '560px' }}>
          {/* Card Container with ZeeBook visual styling */}
          <div
            className="card card-elevated"
            style={{
              padding: '36px 32px',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-card)',
            }}
          >
            {/* STAGE 1: Initial Screen (No Folder Selected) */}
            {!folderName && !createdSummary && (
              <div>
                <h1
                  style={{
                    fontSize: '24px',
                    fontWeight: 800,
                    color: '#ffffff',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.2,
                  }}
                >
                  Photo Selection
                </h1>
                <p
                  style={{
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    marginTop: '8px',
                    lineHeight: 1.5,
                  }}
                >
                  Select an event folder to create a customer photo selection gallery.
                </p>

                {errorMessage && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#f87171',
                      fontSize: '13px',
                      marginTop: '20px',
                    }}
                  >
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {/* Main Action Button: + Add Folder */}
                <div style={{ marginTop: '28px' }}>
                  <button
                    onClick={handleAddFolderClick}
                    disabled={isScanning}
                    className="btn btn-primary"
                    style={{
                      width: '100%',
                      padding: '14px 24px',
                      fontSize: '14px',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                    id="btn-add-folder"
                  >
                    {isScanning ? (
                      <>
                        <RefreshCw size={18} className="spin" />
                        <span>Detecting photos...</span>
                      </>
                    ) : (
                      <>
                        <Plus size={18} />
                        <span>Add Folder</span>
                      </>
                    )}
                  </button>
                </div>

                <div
                  style={{
                    marginTop: '24px',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                  }}
                >
                  <Info size={16} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    Supported formats: JPG, PNG, WebP, HEIC, and common RAW formats (CR2, CR3, NEF, ARW, DNG). Original files remain untouched on your machine.
                  </span>
                </div>
              </div>
            )}

            {/* STAGE 2: Folder Selected & Selection Limit Form */}
            {folderName && !createdSummary && (
              <div>
                {/* Event Folder & Photos Found Display */}
                <div
                  style={{
                    background: 'rgba(9, 13, 22, 0.7)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '18px',
                    marginBottom: '24px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                        }}
                      >
                        Event Folder
                      </div>
                      <div
                        style={{
                          fontSize: '18px',
                          fontWeight: 800,
                          color: '#ffffff',
                          marginTop: '3px',
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {folderName}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleReset}
                      disabled={isSubmitting}
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      Change Folder
                    </button>
                  </div>

                  <div
                    style={{
                      height: '1px',
                      background: 'var(--border-subtle)',
                      margin: '14px 0',
                    }}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                      }}
                    >
                      Photos Found
                    </div>
                    <div
                      style={{
                        fontSize: '15px',
                        fontWeight: 800,
                        color: '#34d399',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {detectedPhotos.length.toLocaleString()} photos
                    </div>
                  </div>
                </div>

                {/* Question & Selection Limit Input Form */}
                <form onSubmit={handleContinue}>
                  <div className="form-group">
                    <label
                      htmlFor="selection-limit"
                      className="form-label"
                      style={{
                        fontSize: '13px',
                        color: '#ffffff',
                        fontWeight: 600,
                        textTransform: 'none',
                        letterSpacing: 'normal',
                        marginBottom: '8px',
                      }}
                    >
                      How many photos should the customer select?
                    </label>

                    <div style={{ position: 'relative' }}>
                      <Hash
                        size={16}
                        color="var(--text-muted)"
                        style={{
                          position: 'absolute',
                          left: '12px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                        }}
                      />
                      <input
                        id="selection-limit"
                        type="number"
                        min="1"
                        max={detectedPhotos.length}
                        placeholder="e.g. 300"
                        value={selectionLimit}
                        onChange={(e) => {
                          setSelectionLimit(e.target.value);
                          setErrorMessage(null);
                        }}
                        disabled={isSubmitting}
                        className="form-input"
                        style={{
                          paddingLeft: '38px',
                          height: '44px',
                          fontSize: '15px',
                          fontWeight: 600,
                        }}
                        autoFocus
                      />
                    </div>

                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        marginTop: '6px',
                        display: 'block',
                      }}
                    >
                      Enter the required count (between 1 and {detectedPhotos.length}).
                    </span>
                  </div>

                  {errorMessage && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#f87171',
                        fontSize: '12px',
                        marginBottom: '18px',
                      }}
                    >
                      <AlertCircle size={15} style={{ flexShrink: 0 }} />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <div style={{ marginTop: '24px' }}>
                    <button
                      type="submit"
                      disabled={isSubmitting || !selectionLimit.trim()}
                      className="btn btn-primary"
                      style={{
                        width: '100%',
                        padding: '12px 24px',
                        fontSize: '14px',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                      }}
                      id="btn-continue"
                    >
                      {isSubmitting ? (
                        <>
                          <RefreshCw size={16} className="spin" />
                          <span>Saving to Supabase...</span>
                        </>
                      ) : (
                        <>
                          <span>Continue</span>
                          <ArrowRight size={16} />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* STAGE 3: Simple Success State (Gallery Created) */}
            {createdSummary && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '20px',
                  }}
                >
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CheckCircle2 size={24} color="#10b981" />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                      Gallery created successfully
                    </h2>
                    <p style={{ fontSize: '12px', color: '#10b981', fontWeight: 600 }}>
                      Saved to Supabase database (Status: {createdSummary.status})
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    background: 'rgba(9, 13, 22, 0.7)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    fontSize: '13px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Event Folder:</span>
                    <span style={{ color: '#ffffff', fontWeight: 700 }}>
                      {createdSummary.name}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Total Photos:</span>
                    <span style={{ color: '#ffffff', fontWeight: 600 }}>
                      {createdSummary.totalPhotos.toLocaleString()} photos
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Customer Selection Limit:</span>
                    <span style={{ color: '#60a5fa', fontWeight: 800 }}>
                      {createdSummary.selectionLimit} photos
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: '24px' }}>
                  <button
                    onClick={handleReset}
                    className="btn btn-secondary"
                    style={{ width: '100%', padding: '12px 20px', fontSize: '13px' }}
                  >
                    + Add Another Folder
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
