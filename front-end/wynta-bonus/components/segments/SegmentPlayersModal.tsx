'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from 'wynta-react-common/components/Icon';
import SegmentPlayersList from './SegmentPlayersList';
import PlayerProfileModal from './PlayerProfileModal';
import type { Segment, Player } from '@/types';

interface SegmentPlayersModalProps {
  segment: Segment;
  onClose: () => void;
}

export default function SegmentPlayersModal({ segment, onClose }: SegmentPlayersModalProps) {
  const [profilePlayer, setProfilePlayer] = useState<Player | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (profilePlayer) setProfilePlayer(null);
      else onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, profilePlayer]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
        <div className="modal" style={{ maxWidth: 1100 }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <span className="modal-icon"><Icon name="users" size={16}/></span>
            <div className="modal-title-block">
              <span className="modal-title">{segment.label}</span>
              <span className="modal-subtitle">
                {segment.count.toLocaleString('en-IN')} players · {segment.hint}
              </span>
            </div>
            <button className="close" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
              <Icon name="x" size={18}/>
            </button>
          </div>
          <div className="modal-body" style={{ padding: 16 }}>
            <SegmentPlayersList segment={segment} onPickPlayer={setProfilePlayer}/>
          </div>
        </div>
      </div>
      {profilePlayer && (
        <PlayerProfileModal
          player={profilePlayer}
          segment={segment}
          onClose={() => setProfilePlayer(null)}
        />
      )}
    </>,
    document.body
  );
}
