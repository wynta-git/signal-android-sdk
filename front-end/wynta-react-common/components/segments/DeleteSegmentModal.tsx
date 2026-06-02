'use client';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../Icon';

export interface DeleteSegmentModalProps {
  segmentName: string;
  onConfirm:   () => void;
  onClose:     () => void;
}

export default function DeleteSegmentModal({
  segmentName,
  onConfirm,
  onClose,
}: DeleteSegmentModalProps) {
  /* ESC closes without deleting */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="asm-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      role="alertdialog"
      aria-modal="true"
      aria-label="Delete segment"
    >
      <div className="del-modal" onMouseDown={e => e.stopPropagation()}>

        {/* Danger icon */}
        <div className="del-modal__icon">
          <Icon name="trash-2" size={26} strokeWidth={1.75} />
        </div>

        {/* Title */}
        <h3 className="del-modal__title">Delete Segment?</h3>

        {/* Body */}
        <p className="del-modal__body">
          You are about to permanently delete&nbsp;
          <strong className="del-modal__name">&ldquo;{segmentName}&rdquo;</strong>.
          <br />
          This cannot be undone and will remove the segment from all
          campaigns that use it.
        </p>

        {/* Actions */}
        <div className="del-modal__actions">
          <button
            type="button"
            className="asm-btn asm-btn--secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="asm-btn asm-btn--danger"
            onClick={() => { onConfirm(); onClose(); }}
            autoFocus
          >
            <Icon name="trash-2" size={14} />
            Delete Segment
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
