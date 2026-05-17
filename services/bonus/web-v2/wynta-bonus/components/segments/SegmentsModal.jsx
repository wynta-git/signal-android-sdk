'use client';
import { useState, useMemo, useEffect } from 'react';
import Icon from '@/components/primitives/Icon';
import SegmentsBrowse from './SegmentsBrowse';
import SegmentBuilder from './SegmentBuilder';
import { MANUAL_SEGMENTS } from '@/services/mocks/constants';

export default function SegmentsModal({ initialMode, onClose, onOpenSegment }) {
  const [mode, setMode]     = useState(initialMode); // 'browse' | 'create'
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('RECENT'); // RECENT | NAME | SIZE
  const segs = MANUAL_SEGMENTS;

  useEffect(() => {
    function handle(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handle);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handle);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = segs.filter(s =>
      !q || s.label.toLowerCase().includes(q) || s.hint.toLowerCase().includes(q) || s.owner.toLowerCase().includes(q)
    );
    if (sortBy === 'RECENT')     list = [...list].sort((a, b) => new Date(b.last_used_at) - new Date(a.last_used_at));
    else if (sortBy === 'NAME')  list = [...list].sort((a, b) => a.label.localeCompare(b.label));
    else if (sortBy === 'SIZE')  list = [...list].sort((a, b) => b.count - a.count);
    return list;
  }, [search, sortBy, segs]);

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal seg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-icon"><Icon name="users" size={16}/></span>
          <div className="modal-title-block">
            <span className="modal-title">Player Segments</span>
            <span className="modal-subtitle">
              {mode === 'browse' ? `${segs.length} segments · browse & search` : 'Build a new segment with filters'}
            </span>
          </div>
          <div className="modal-tabs">
            <button
              className={'modal-tab' + (mode === 'browse' ? ' active' : '')}
              onClick={() => setMode('browse')}
              type="button"
            >
              <Icon name="list" size={12}/> Browse
            </button>
            <button
              className={'modal-tab' + (mode === 'create' ? ' active' : '')}
              onClick={() => setMode('create')}
              type="button"
            >
              <Icon name="plus-circle" size={12}/> Create
            </button>
          </div>
          <button className="close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={18}/>
          </button>
        </div>
        {mode === 'browse'
          ? <SegmentsBrowse list={filtered} search={search} setSearch={setSearch} sortBy={sortBy} setSortBy={setSortBy} onCreate={() => setMode('create')} onPick={onOpenSegment}/>
          : <SegmentBuilder onCancel={() => setMode('browse')} onSave={onClose}/>}
      </div>
    </div>
  );
}
