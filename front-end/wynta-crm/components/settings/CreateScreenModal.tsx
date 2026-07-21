'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { createScreen } from '../../services/campaignApi';

interface Props {
  projectId: string;
  brandId?: number;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateScreenModal({ projectId, brandId, onClose, onCreated }: Props) {
  const [screenName, setScreenName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = screenName.trim();
    if (!name) return;
    setSubmitting(true);
    setError(null);
    try {
      await createScreen(projectId, name, brandId);
      onCreated();
    } catch {
      setError('Failed to add screen. Please try again.');
      setSubmitting(false);
    }
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="asm-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cl-modal">
        <h3 className="cl-modal__title">Add Screen</h3>

        <form onSubmit={handleSubmit}>
          <div className="cl-form-field">
            <label className="cl-form-label" htmlFor="screen-name">Screen name *</label>
            <input
              id="screen-name"
              type="text"
              className="cl-form-input"
              placeholder="e.g. checkout_screen"
              value={screenName}
              onChange={e => setScreenName(e.target.value)}
              autoFocus
              required
            />
          </div>

          {error && <div className="cl-modal__error">{error}</div>}

          <div className="cl-modal__actions">
            <button type="button" className="asm-btn asm-btn--secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="submit"
              className="asm-btn asm-btn--primary"
              disabled={submitting || !screenName.trim()}
            >
              {submitting ? 'Adding…' : 'Add Screen'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
