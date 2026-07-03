'use client';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from 'wynta-react-common/components/Icon';
import type { ClientRecord } from '../../services/clientApi';

interface Props {
  client: ClientRecord;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeleteClientModal({ client, deleting, onClose, onConfirm }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !deleting) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, deleting]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="asm-overlay" onMouseDown={e => { if (e.target === e.currentTarget && !deleting) onClose(); }}>
      <div className="del-modal">
        <div className="del-modal__icon">
          <Icon name="trash-2" size={26} strokeWidth={1.75} />
        </div>
        <h3 className="del-modal__title">Delete Client?</h3>
        <p className="del-modal__body">
          You are about to permanently delete&nbsp;
          <strong className="del-modal__name">&ldquo;{client.name}&rdquo;</strong>
          &nbsp;(<code style={{ fontFamily: 'var(--mono)', fontSize: '0.9em' }}>{client.client_id}</code>).
          <br />
          Any integrations using this client will stop working immediately.
        </p>
        <div className="del-modal__actions">
          <button
            type="button"
            className="asm-btn asm-btn--secondary"
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="asm-btn asm-btn--danger"
            autoFocus
            disabled={deleting}
            onClick={onConfirm}
          >
            <Icon name="trash-2" size={14} />
            {deleting ? 'Deleting…' : 'Delete Client'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
