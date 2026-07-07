'use client';
import { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch } from 'react-redux';
import Icon from '../Icon';
import { reuploadSegment } from '../../store/slices/segmentsSlice';
import { formatRelative } from '../../utils';
import type { Segment, UploadHistoryEntry } from '../../types';

interface SegmentUploadHistoryProps {
  segment: Segment;
  onClose: () => void;
  onReuploaded?: () => void;
}

export default function SegmentUploadHistory({ segment, onClose, onReuploaded }: SegmentUploadHistoryProps) {
  const dispatch = useDispatch<any>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const history: UploadHistoryEntry[] = [...(segment.upload_history ?? [])].reverse();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      await dispatch(reuploadSegment({ segmentId: String(segment.id), file })).unwrap();
      onReuploaded?.();
      onClose();
    } catch {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="asm-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Upload History"
    >
      <div className="asm-modal seg-history-modal" onMouseDown={e => e.stopPropagation()}>

        <div className="asm-header">
          <Icon name="clock" size={15} color="var(--crm-blue)" />
          <span className="asm-title">Upload History</span>
          <span className="seg-history-segment-name">{segment.label ?? segment.name}</span>
          <div style={{ flex: 1 }} />
          <button
            className="btn btn-primary btn-sm"
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading
              ? <><Icon name="loader" size={12} /> Uploading…</>
              : <><Icon name="upload" size={12} /> Re-upload CSV</>}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <button className="asm-close" type="button" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>

        {error && (
          <div className="seg-history-error">
            <Icon name="alert-circle" size={14} />
            <span>{error}</span>
          </div>
        )}

        <div className="modal-body seg-history-body">
          {history.length === 0 ? (
            <div className="seg-empty">
              <Icon name="inbox" size={24} color="var(--g300)" />
              <div className="seg-empty-title">No upload history yet</div>
            </div>
          ) : (
            <table className="seg-history-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Uploaded By</th>
                  <th>Date</th>
                  <th>Members</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry, i) => (
                  <tr key={i} className={i === 0 ? 'seg-history-row--latest' : ''}>
                    <td>
                      <div className="seg-history-filename">
                        <Icon name="file-text" size={13} color="var(--crm-fg4)" />
                        <span title={entry.filename}>{entry.filename}</span>
                        {i === 0 && <span className="seg-history-badge">latest</span>}
                      </div>
                    </td>
                    <td>{entry.uploaded_by || '—'}</td>
                    <td>{formatRelative(entry.uploaded_at)}</td>
                    <td>{entry.members_count.toLocaleString('en-IN')}</td>
                    <td>
                      {entry.s3_url && (
                        <a
                          href={entry.s3_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="seg-history-download"
                          title="Download from S3"
                        >
                          <Icon name="download" size={13} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>,
    document.body,
  );
}
