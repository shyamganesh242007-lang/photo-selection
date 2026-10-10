import React, { useState, useRef } from 'react';
import {
  Folder,
  FolderOpen,
  ArrowRight,
  CheckCircle2,
  Camera,
  RefreshCw,
  AlertCircle,
  Hash,
} from 'lucide-react';

interface SelectedFolderData {
  name: string;
  fullPath?: string;
  photoCount: number;
}

export function App() {
  const [folderData, setFolderData] = useState<SelectedFolderData | null>(null);
  const [selectionLimit, setSelectionLimit] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Open native OS folder picker
  const handleOpenFolderPicker = async () => {
    setErrorMessage(null);

    // 1. Try modern File System Access API (Native OS Directory Picker)
    if ('showDirectoryPicker' in window) {
      try {
        const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' });
        setIsScanning(true);

        const folderName = dirHandle.name;
        let count = 0;
        const imageExtensions = new Set([
          'jpg', 'jpeg', 'png', 'cr2', 'cr3', 'nef', 'arw', 'dng', 'raw', 'rw2', 'tif', 'tiff', 'webp'
        ]);

        // Scan folder for image files
        for await (const entry of dirHandle.values()) {
          if (entry.kind === 'file') {
            const ext = entry.name.split('.').pop()?.toLowerCase();
            if (ext && imageExtensions.has(ext)) {
              count++;
            }
          }
        }

        setIsScanning(false);
        setFolderData({
          name: folderName,
          photoCount: count > 0 ? count : 0,
        });
        setSelectionLimit('');
        setIsSubmitted(false);
        return;
      } catch (err: any) {
        setIsScanning(false);
        // If user cancelled the picker dialog, do nothing
        if (err.name === 'AbortError') {
          return;
        }
        // If browser threw security / unsupported error, fallback to hidden webkitdirectory input
        console.warn('Native picker error, falling back to input:', err);
      }
    }

    // 2. Fallback: Hidden HTML5 webkitdirectory input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  // Handle fallback directory input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsScanning(true);
    setErrorMessage(null);

    const firstPath = files[0].webkitRelativePath || '';
    const folderName = firstPath.split('/')[0] || 'Selected Folder';

    const imageExtensions = new Set([
      'jpg', 'jpeg', 'png', 'cr2', 'cr3', 'nef', 'arw', 'dng', 'raw', 'rw2', 'tif', 'tiff', 'webp'
    ]);

    let count = 0;
    for (let i = 0; i < files.length; i++) {
      const ext = files[i].name.split('.').pop()?.toLowerCase() || '';
      if (imageExtensions.has(ext)) {
        count++;
      }
    }

    setIsScanning(false);
    setFolderData({
      name: folderName,
      photoCount: count > 0 ? count : files.length,
    });
    setSelectionLimit('');
    setIsSubmitted(false);
  };

  // Quick simulation option for testing with the exact Shyam Wedding example
  const handleSelectExampleFolder = () => {
    setFolderData({
      name: 'Shyam Wedding',
      fullPath: 'C:\\Users\\ASUS\\Desktop\\Events\\Shyam Wedding',
      photoCount: 1000,
    });
    setSelectionLimit('300');
    setErrorMessage(null);
    setIsSubmitted(false);
  };

  // Reset folder selection
  const handleReset = () => {
    setFolderData(null);
    setSelectionLimit('');
    setErrorMessage(null);
    setIsSubmitted(false);
  };

  // Handle Continue
  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const limitNum = parseInt(selectionLimit.trim(), 10);

    if (isNaN(limitNum) || limitNum <= 0) {
      setErrorMessage('Please enter a valid number of photos (e.g. 300).');
      return;
    }

    if (folderData && folderData.photoCount > 0 && limitNum > folderData.photoCount) {
      setErrorMessage(
        `Selection limit cannot exceed the total number of detected photos (${folderData.photoCount}).`
      );
      return;
    }

    setIsSubmitted(true);
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
      {/* Hidden fallback file input for OS directory selection */}
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
        <div style={{ width: '100%', maxWidth: '580px' }}>
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
            {!folderData && (
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

                {/* Main Action: Add Folder */}
                <div style={{ marginTop: '28px' }}>
                  <button
                    onClick={handleOpenFolderPicker}
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
                      gap: '10px',
                    }}
                    id="btn-add-folder"
                  >
                    {isScanning ? (
                      <>
                        <RefreshCw size={18} className="spin" />
                        <span>Scanning folder...</span>
                      </>
                    ) : (
                      <>
                        <FolderOpen size={18} />
                        <span>Add Folder</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Example Quick-Pick Helper for instant testing */}
                <div style={{ marginTop: '20px', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={handleSelectExampleFolder}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      fontFamily: 'inherit',
                    }}
                  >
                    Or load example: Shyam Wedding (1,000 photos)
                  </button>
                </div>
              </div>
            )}

            {/* STAGE 2: Folder Selected & Selection Limit Input */}
            {folderData && !isSubmitted && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(37, 99, 235, 0.15)',
                        border: '1px solid rgba(37, 99, 235, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Folder size={20} color="var(--primary-500)" />
                    </div>
                    <div>
                      <h2
                        style={{
                          fontSize: '18px',
                          fontWeight: 800,
                          color: '#ffffff',
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {folderData.name}
                      </h2>
                      <div
                        style={{
                          fontSize: '13px',
                          color: '#34d399',
                          fontWeight: 600,
                          marginTop: '2px',
                        }}
                      >
                        {folderData.photoCount.toLocaleString()} photos found
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleReset}
                    className="btn btn-secondary"
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    Change Folder
                  </button>
                </div>

                {folderData.fullPath && (
                  <div style={{ marginTop: '10px' }}>
                    <code
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        background: 'rgba(255, 255, 255, 0.04)',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {folderData.fullPath}
                    </code>
                  </div>
                )}

                {/* Divider */}
                <div
                  style={{
                    height: '1px',
                    background: 'var(--border-subtle)',
                    margin: '24px 0',
                  }}
                />

                {/* Required Selection Form */}
                <form onSubmit={handleContinue}>
                  <div className="form-group">
                    <label
                      htmlFor="selection-limit-input"
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
                        id="selection-limit-input"
                        type="number"
                        min="1"
                        max={folderData.photoCount > 0 ? folderData.photoCount : undefined}
                        placeholder="e.g. 300"
                        value={selectionLimit}
                        onChange={(e) => {
                          setSelectionLimit(e.target.value);
                          setErrorMessage(null);
                        }}
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
                      Enter the exact selection limit required from the customer.
                    </span>
                  </div>

                  {errorMessage && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 14px',
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
                      disabled={!selectionLimit.trim()}
                      className="btn btn-primary"
                      style={{
                        width: '100%',
                        padding: '12px 24px',
                        fontSize: '14px',
                        borderRadius: 'var(--radius-sm)',
                      }}
                      id="btn-continue"
                    >
                      <span>Continue</span>
                      <ArrowRight size={16} />
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* STAGE 3: Confirmed State (Ready for Next Step) */}
            {folderData && isSubmitted && (
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
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CheckCircle2 size={20} color="#10b981" />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                      Folder & Limit Configured
                    </h2>
                    <p style={{ fontSize: '12px', color: '#10b981', fontWeight: 600 }}>
                      Ready for next step
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    background: 'rgba(9, 13, 22, 0.7)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    fontSize: '13px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Selected Event Folder:</span>
                    <span style={{ color: '#ffffff', fontWeight: 700 }}>{folderData.name}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Photos Detected:</span>
                    <span style={{ color: '#ffffff', fontWeight: 600 }}>
                      {folderData.photoCount.toLocaleString()} photos
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Customer Selection Limit:</span>
                    <span style={{ color: '#60a5fa', fontWeight: 800 }}>
                      {selectionLimit} photos
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: '16px',
                    padding: '12px 14px',
                    background: 'rgba(37, 99, 235, 0.08)',
                    border: '1px solid rgba(37, 99, 235, 0.25)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    color: '#93c5fd',
                    lineHeight: 1.4,
                  }}
                >
                  Customer must select <strong>exactly {selectionLimit}</strong> photos before submission will be allowed.
                </div>

                <div style={{ marginTop: '24px', display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => setIsSubmitted(false)}
                    className="btn btn-secondary"
                    style={{ flex: 1, padding: '10px 16px', fontSize: '13px' }}
                  >
                    Edit Limit
                  </button>
                  <button
                    onClick={handleReset}
                    className="btn btn-outline"
                    style={{ padding: '10px 16px', fontSize: '13px' }}
                  >
                    Choose Different Folder
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
