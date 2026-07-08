'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../Icon';
import SegmentUsersList from './SegmentUsersList';
import UserProfileModal from './UserProfileModal';
import type { Segment } from '../../types';

interface SegmentUsersModalProps {
  segment: Segment;
  onClose: () => void;
}

export default function SegmentUsersModal({ segment, onClose }: SegmentUsersModalProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);

  const pickPlayer = (userId: string, brandId: string | null) => {
    setSelectedUserId(userId);
    setSelectedBrandId(brandId);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedUserId) setSelectedUserId(null);
      else onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, selectedUserId]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" style={{ maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-icon"><Icon name="users" size={16}/></span>
          <div className="modal-title-block">
            <span className="modal-title">{segment.label}</span>
            <span className="modal-subtitle">
              {segment.count.toLocaleString('en-IN')} users
              {segment.hint ? ` · ${segment.hint}` : ''}
            </span>
          </div>
          <button className="close" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            <Icon name="x" size={18}/>
          </button>
        </div>
        <div className="modal-body" style={{ padding: 16 }}>
          <SegmentUsersList segment={segment} onPickPlayer={pickPlayer}/>
        </div>
      </div>
      <UserProfileModal
        userId={selectedUserId}
        brandId={selectedBrandId}
        segment={segment}
        onClose={() => setSelectedUserId(null)}
      />
    </div>,
    document.body
  );
}
