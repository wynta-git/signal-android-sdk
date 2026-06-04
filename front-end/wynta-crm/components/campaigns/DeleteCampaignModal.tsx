'use client';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from 'wynta-react-common/components/Icon';
import type { Campaign } from '../../services/campaignApi';

interface Props {
  campaign:  Campaign;
  onClose:   () => void;
  onConfirm: () => void;
}

export default function DeleteCampaignModal({ campaign, onClose, onConfirm }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="asm-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="del-modal">
        <div className="del-modal__icon">
          <Icon name="trash-2" size={26} strokeWidth={1.75} />
        </div>
        <h3 className="del-modal__title">Delete Campaign?</h3>
        <p className="del-modal__body">
          You are about to permanently delete&nbsp;
          <strong className="del-modal__name">&ldquo;{campaign.name}&rdquo;</strong>.
          <br />
          This cannot be undone.
        </p>
        <div className="del-modal__actions">
          <button type="button" className="asm-btn asm-btn--secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="asm-btn asm-btn--danger" autoFocus onClick={() => { onConfirm(); onClose(); }}>
            <Icon name="trash-2" size={14} /> Delete Campaign
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
