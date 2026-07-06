'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from 'wynta-react-common/components/Icon';
import type { CreatedClient } from '../../services/clientApi';

interface Props {
  created: CreatedClient;
  onClose: () => void;
}

export default function SecretRevealModal({ created, onClose }: Props) {
  const [copiedId, setCopiedId]         = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function copy(text: string, which: 'id' | 'secret') {
    navigator.clipboard.writeText(text).then(() => {
      if (which === 'id') {
        setCopiedId(true);
        setTimeout(() => setCopiedId(false), 2000);
      } else {
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2000);
      }
    });
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="asm-overlay">
      <div className="cl-secret-modal">
        <h3 className="cl-secret-modal__title">Client Created</h3>

        <div className="cl-secret-warning">
          <Icon name="alert-triangle" size={16} strokeWidth={2} />
          <span>
            Copy the <strong>Client Secret</strong> now — it will never be shown again.
            If you lose it, delete this client and create a new one.
          </span>
        </div>

        <div className="cl-secret-field">
          <div className="cl-secret-label">Client ID</div>
          <div className="cl-secret-value">
            <code>{created.client_id}</code>
            <button
              type="button"
              className={`cl-copy-btn${copiedId ? ' copied' : ''}`}
              onClick={() => copy(created.client_id, 'id')}
            >
              <Icon name={copiedId ? 'check' : 'copy'} size={12} strokeWidth={2} />
              {copiedId ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="cl-secret-field">
          <div className="cl-secret-label">Client Secret</div>
          <div className="cl-secret-value">
            <code>{created.client_secret}</code>
            <button
              type="button"
              className={`cl-copy-btn${copiedSecret ? ' copied' : ''}`}
              onClick={() => copy(created.client_secret, 'secret')}
            >
              <Icon name={copiedSecret ? 'check' : 'copy'} size={12} strokeWidth={2} />
              {copiedSecret ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="cl-secret-modal__actions">
          <button
            type="button"
            className="seg-btn-primary"
            onClick={onClose}
          >
            I&apos;ve saved it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
