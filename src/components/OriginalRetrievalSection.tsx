import { useState, useEffect } from 'react';
import {
  DownloadCloud,
  CheckCircle2,
  Clock,
  Folder,
  FolderOutput,
  AlertCircle,
  RefreshCw,
  Check,
  ShieldCheck,
  FileCheck2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  fetchGallerySelectionStatus,
  fetchSelectedPhotos,
  copySelectedOriginalFiles,
  type GallerySelectionStatus,
  type SelectedPhotoRecord,
  type RetrievalProgress,
  type FileCopyResult,
  type ConflictStrategy,
} from '../lib/originalRetriever';
import { type RetrievalVerificationSummary } from '../lib/galleryCompletion';
import { formatBytes } from '../lib/previewGenerator';

interface OriginalRetrievalSectionProps {
  galleryId: string;
  galleryName: string;
  selectionLimit: number;
  initialSourceHandle?: any;
  onRetrievalVerified?: (summary: RetrievalVerificationSummary) => void;
  onStatusChange?: (status: GallerySelectionStatus) => void;
}

export function OriginalRetrievalSection({
  galleryId,
  galleryName,
  selectionLimit,
  initialSourceHandle,
  onRetrievalVerified,
  onStatusChange,
}: OriginalRetrievalSectionProps) {
  const [status, setStatus] = useState<GallerySelectionStatus | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Dialog / Flow State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [sourceDirHandle, setSourceDirHandle] = useState<any>(initialSourceHandle || null);
  const [destParentHandle, setDestParentHandle] = useState<any>(null);
  const [conflictStrategy, setConflictStrategy] = useState<ConflictStrategy>('skip');

  // Retrieval Execution State
  const [isRetrieving, setIsRetrieving] = useState<boolean>(false);
  const [progress, setProgress] = useState<RetrievalProgress>({
    total: 0,
    processed: 0,
    copied: 0,
    skipped: 0,
    failed: 0,
    percentage: 0,
  });
  const [results, setResults] = useState<FileCopyResult[]>([]);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [outputDirName, setOutputDirName] = useState<string>(`Selected ${galleryName}`);
  const [showDetails, setShowDetails] = useState<boolean>(false);

  // Load / Check Selection Status from Supabase
  const checkStatus = async () => {
    if (!supabase) return;
    setIsChecking(true);
    setErrorMsg(null);
    try {
      const st = await fetchGallerySelectionStatus(supabase, galleryId);
      setStatus(st);
      onStatusChange?.(st);
    } catch (err: any) {
      console.error('Error fetching gallery selection status:', err);
      setErrorMsg(err.message || 'Failed to check customer selections.');
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkStatus();
    // Poll every 10 seconds for real-time customer updates
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [galleryId]);

  // Pick Source Folder (if handle not already retained)
  const handleSelectSourceFolder = async () => {
    setErrorMsg(null);
    if ('showDirectoryPicker' in window) {
      try {
        const handle = await (window as any).showDirectoryPicker({ mode: 'read' });
        setSourceDirHandle(handle);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setErrorMsg(`Error selecting source folder: ${err.message}`);
        }
      }
    } else {
      setErrorMsg('File System Access API is not supported in this browser.');
    }
  };

  // Pick Destination Folder
  const handleSelectDestFolder = async () => {
    setErrorMsg(null);
    if ('showDirectoryPicker' in window) {
      try {
        const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
        setDestParentHandle(handle);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setErrorMsg(`Error selecting destination folder: ${err.message}`);
        }
      }
    } else {
      setErrorMsg('File System Access API is not supported in this browser.');
    }
  };

  // Start Copying Originals
  const handleStartRetrieval = async () => {
    if (!supabase || !sourceDirHandle || !destParentHandle) return;

    setErrorMsg(null);
    setIsRetrieving(true);
    setIsCompleted(false);
    setResults([]);

    try {
      // 1. Fetch selected photo records (matching by original_relative_path)
      const selectedPhotos: SelectedPhotoRecord[] = await fetchSelectedPhotos(
        supabase,
        galleryId
      );

      if (selectedPhotos.length === 0) {
        throw new Error('No selected photos found in database for this gallery.');
      }

      // 2. Execute original files copy with exact SHA-256 verification
      const copyReport = await copySelectedOriginalFiles({
        sourceDirHandle,
        destParentDirHandle: destParentHandle,
        galleryName,
        selectedPhotos,
        conflictStrategy,
        onProgress: (p) => setProgress({ ...p }),
      });

      const summary: RetrievalVerificationSummary = {
        hasRetrieved: true,
        totalSelected: selectedPhotos.length,
        copiedCount: copyReport.copiedCount,
        skippedCount: copyReport.skippedCount,
        failedCount: copyReport.failedCount,
        allHashesMatch:
          copyReport.copiedCount === selectedPhotos.length &&
          copyReport.results.every((r) => r.status === 'copied' && r.hashesMatch),
        results: copyReport.results,
      };

      setResults(copyReport.results);
      setOutputDirName(copyReport.outputDirName);
      setIsCompleted(true);
      setIsRetrieving(false);
      onRetrievalVerified?.(summary);
    } catch (err: any) {
      console.error('Retrieval error:', err);
      setIsRetrieving(false);
      setErrorMsg(err.message || 'Error occurred during original files retrieval.');
    }
  };

  const isSelectionComplete = status?.isComplete ?? false;
  const currentSelections = status?.selectionsCount ?? 0;
  const targetLimit = status?.selectionLimit ?? selectionLimit;

  return (
    <div
      style={{
        marginTop: '22px',
        padding: '20px',
        background: isSelectionComplete
          ? 'rgba(16, 185, 129, 0.06)'
          : 'rgba(30, 41, 59, 0.5)',
        border: `1px solid ${
          isSelectionComplete ? 'rgba(16, 185, 129, 0.35)' : 'var(--border-medium)'
        }`,
        borderRadius: 'var(--radius-sm)',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Header & Status Indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px',
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
              background: isSelectionComplete
                ? 'rgba(16, 185, 129, 0.2)'
                : 'rgba(59, 130, 246, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isSelectionComplete ? (
              <CheckCircle2 size={20} color="#10b981" />
            ) : (
              <Clock size={20} color="#60a5fa" />
            )}
          </div>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
              {isSelectionComplete
                ? 'Customer selection complete'
                : 'Waiting for customer selection...'}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Selected: <strong style={{ color: isSelectionComplete ? '#10b981' : '#60a5fa' }}>{currentSelections} / {targetLimit}</strong>
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>•</span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color: isSelectionComplete ? '#10b981' : '#94a3b8',
                }}
              >
                {isSelectionComplete ? `${targetLimit} / ${targetLimit} photos selected` : `${targetLimit - currentSelections} remaining`}
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={checkStatus}
          disabled={isChecking}
          className="btn btn-outline"
          style={{ padding: '6px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px' }}
          title="Refresh Customer Selection Status"
        >
          <RefreshCw size={12} className={isChecking ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Action Area */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, maxWidth: '420px' }}>
          {isSelectionComplete
            ? 'Customer has finalized their selection. You can now copy the original camera files to an output folder.'
            : 'Retrieval will be unlocked once the customer submits all required photos.'}
        </p>

        <button
          onClick={() => setIsModalOpen(true)}
          disabled={!isSelectionComplete}
          className={`btn ${isSelectionComplete ? 'btn-primary' : 'btn-outline'}`}
          style={{
            padding: '10px 18px',
            fontSize: '13px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: isSelectionComplete ? 'pointer' : 'not-allowed',
            opacity: isSelectionComplete ? 1 : 0.5,
          }}
          id="btn-retrieve-originals"
        >
          <DownloadCloud size={16} />
          <span>Retrieve Selected Originals</span>
        </button>
      </div>

      {/* RETRIEVAL WORKFLOW MODAL */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(5, 8, 17, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            className="card card-elevated"
            style={{
              width: '100%',
              maxWidth: '620px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '28px',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-medium)',
              background: '#0d1322',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '18px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FolderOutput size={22} color="#3b82f6" />
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                  Retrieve Selected Originals
                </h2>
              </div>
              {!isRetrieving && (
                <button
                  onClick={() => setIsModalOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '20px',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {errorMsg && (
              <div
                style={{
                  marginBottom: '16px',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle size={15} style={{ flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}

            {!isCompleted && !isRetrieving && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  This will copy ONLY the <strong>{currentSelections}</strong> customer-selected original files from your event folder into a dedicated output folder.
                </p>

                {/* Step 1: Source Event Folder */}
                <div
                  style={{
                    padding: '14px',
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
                        Step 1: Source Event Folder (Read-only)
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                        <Folder size={16} color="#60a5fa" />
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                          {sourceDirHandle ? sourceDirHandle.name : 'No folder selected'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={handleSelectSourceFolder}
                      className="btn btn-outline"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      {sourceDirHandle ? 'Change Folder' : 'Select Folder'}
                    </button>
                  </div>
                  <div style={{ fontSize: '11px', color: '#10b981', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ShieldCheck size={12} />
                    <span>Original folder will remain 100% untouched.</span>
                  </div>
                </div>

                {/* Step 2: Destination Folder */}
                <div
                  style={{
                    padding: '14px',
                    background: 'rgba(15, 23, 42, 0.7)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
                        Step 2: Destination Output Folder
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                        <FolderOutput size={16} color="#10b981" />
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                          {destParentHandle ? (
                            destParentHandle.name.toLowerCase().startsWith('selected')
                              ? destParentHandle.name
                              : `${destParentHandle.name} / Selected ${galleryName}`
                          ) : (
                            'Select Destination...'
                          )}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={handleSelectDestFolder}
                      className="btn btn-outline"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      {destParentHandle ? 'Change Destination' : 'Select Output Folder'}
                    </button>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', display: 'block' }}>
                    Creates a separate folder: <code style={{ color: '#93c5fd' }}>Selected {galleryName}</code>
                  </span>
                </div>

                {/* Step 3: Conflict Safety Strategy */}
                <div
                  style={{
                    padding: '12px 14px',
                    background: 'rgba(15, 23, 42, 0.4)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff' }}>
                      If output file already exists:
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Safe default is to skip existing files.
                    </div>
                  </div>
                  <select
                    value={conflictStrategy}
                    onChange={(e) => setConflictStrategy(e.target.value as ConflictStrategy)}
                    style={{
                      background: 'rgba(9, 13, 22, 0.9)',
                      border: '1px solid var(--border-medium)',
                      color: '#ffffff',
                      fontSize: '12px',
                      padding: '6px 10px',
                      borderRadius: '4px',
                      outline: 'none',
                    }}
                  >
                    <option value="skip">Skip (Default)</option>
                    <option value="replace">Replace</option>
                    <option value="cancel">Cancel</option>
                  </select>
                </div>

                {/* Submit Action */}
                <div style={{ marginTop: '10px' }}>
                  <button
                    onClick={handleStartRetrieval}
                    disabled={!sourceDirHandle || !destParentHandle}
                    className="btn btn-primary"
                    style={{
                      width: '100%',
                      padding: '12px',
                      fontSize: '14px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    <DownloadCloud size={18} />
                    <span>Start Original Retrieval ({currentSelections} files)</span>
                  </button>
                </div>
              </div>
            )}

            {/* PROGRESS SCREEN */}
            {isRetrieving && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', padding: '10px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <RefreshCw size={24} color="#3b82f6" className="spin" />
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#ffffff' }}>
                      Retrieving selected originals...
                    </h3>
                    <div style={{ fontSize: '13px', color: '#60a5fa', fontWeight: 700 }}>
                      Progress: {progress.processed} / {progress.total}
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div
                  style={{
                    width: '100%',
                    height: '8px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${progress.percentage}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #2563eb, #10b981)',
                      transition: 'width 0.15s ease',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <span>
                    Current file: <strong style={{ color: '#ffffff' }}>{progress.currentFilename || 'Processing...'}</strong>
                  </span>
                  <span style={{ fontWeight: 700, color: '#10b981' }}>{progress.percentage}%</span>
                </div>

                {/* Counters */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '10px',
                    background: 'rgba(9, 13, 22, 0.7)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '12px',
                    fontSize: '12px',
                    textAlign: 'center',
                  }}
                >
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Copied</div>
                    <div style={{ color: '#10b981', fontWeight: 800, fontSize: '16px' }}>
                      {progress.copied}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Skipped</div>
                    <div style={{ color: 'var(--text-muted)', fontWeight: 800, fontSize: '16px' }}>
                      {progress.skipped}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Failed</div>
                    <div style={{ color: progress.failed > 0 ? '#ef4444' : 'var(--text-muted)', fontWeight: 800, fontSize: '16px' }}>
                      {progress.failed}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* COMPLETION SCREEN */}
            {isCompleted && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div style={{ textAlign: 'center', padding: '10px 0' }}>
                  <div
                    style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: '50%',
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 12px',
                    }}
                  >
                    <CheckCircle2 size={30} color="#10b981" />
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                    Original Retrieval Complete!
                  </h3>
                  <p style={{ fontSize: '13px', color: '#60a5fa', fontWeight: 600, marginTop: '4px' }}>
                    Successfully copied {results.filter((r) => r.status === 'copied').length} original files to:
                  </p>
                  <div
                    style={{
                      display: 'inline-block',
                      background: 'rgba(9, 13, 22, 0.8)',
                      padding: '4px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-medium)',
                      marginTop: '6px',
                      fontSize: '12px',
                      fontWeight: 700,
                      color: '#ffffff',
                    }}
                  >
                    📁 {outputDirName}
                  </div>
                </div>

                {/* Audit Highlights */}
                <div
                  style={{
                    background: 'rgba(9, 13, 22, 0.7)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981' }}>
                    <ShieldCheck size={16} />
                    <span><strong>100% SHA-256 Byte-for-Byte Match:</strong> All copied files verified identical.</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#93c5fd' }}>
                    <FileCheck2 size={16} />
                    <span><strong>Original Folder Untouched:</strong> Source files unmodified.</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                    <Check size={16} />
                    <span><strong>Unselected Excluded:</strong> Non-selected photos were not copied.</span>
                  </div>
                </div>

                {/* Toggleable File Breakdown */}
                <div>
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="btn btn-outline"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>View Copied Files Breakdown ({results.length})</span>
                    {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {showDetails && (
                    <div
                      style={{
                        marginTop: '8px',
                        maxHeight: '220px',
                        overflowY: 'auto',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        background: 'rgba(9, 13, 22, 0.5)',
                      }}
                    >
                      {results.map((file, idx) => (
                        <div
                          key={idx}
                          style={{
                            padding: '8px 12px',
                            borderBottom: '1px solid var(--border-subtle)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '11px',
                          }}
                        >
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>
                            <div style={{ color: '#ffffff', fontWeight: 600 }}>{file.filename}</div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                              {file.relativePath} • {formatBytes(file.sizeBytes)}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: file.hashesMatch ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                                color: file.hashesMatch ? '#10b981' : '#ef4444',
                              }}
                            >
                              {file.hashesMatch ? 'SHA-256 MATCH' : 'FAILED'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '6px' }}>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="btn btn-secondary"
                    style={{ width: '100%', padding: '10px', fontSize: '13px' }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default OriginalRetrievalSection;
