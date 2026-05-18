'use client';
import { useState, useEffect, useRef } from 'react';
import Icon from '@/components/primitives/Icon';
import { MANUAL_SEGMENTS } from '@/services/mocks/constants';
import type { Segment } from '@/types';

interface PlayerSegmentPickerProps {
  configureId: number;
}

export default function PlayerSegmentPicker({ configureId }: PlayerSegmentPickerProps) {
  const segs = MANUAL_SEGMENTS as Segment[];
  const defaultId = segs.length ? segs[configureId % segs.length].id : null;
  const [segmentId, setSegmentId] = useState<string | number | null>(defaultId);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setSegmentId(defaultId); setOpen(false); }, [configureId]); // eslint-disable-line

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selected = segs.find(s => s.id === segmentId) || null;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? segs.filter(s => s.label!.toLowerCase().includes(q) || (s.hint || '').toLowerCase().includes(q))
    : segs;

  return (
    <div className="seg-picker" ref={popRef}>
      {selected ? (
        <div
          className="seg-picker-card"
          role="button"
          tabIndex={0}
          onClick={() => setOpen(o => !o)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); } }}
        >
          <span className="seg-mark"><Icon name="users" size={16}/></span>
          <div className="seg-info">
            <div className="seg-label">{selected.label}</div>
            <div className="seg-meta">
              <span className="seg-count"><strong>{selected.count.toLocaleString('en-IN')}</strong> players</span>
              <span style={{ color: 'var(--g300)' }}>·</span>
              <span>{selected.hint}</span>
            </div>
          </div>
          <div className="seg-actions" onClick={(e) => e.stopPropagation()}>
            <button className="btn btn-secondary btn-sm" onClick={() => setOpen(o => !o)}>
              <Icon name="repeat" size={12}/> Change
            </button>
            <button className="btn btn-secondary btn-sm btn-icon-only" title="Remove segment" onClick={() => { setSegmentId(null); setOpen(false); }}>
              <Icon name="x" size={13}/>
            </button>
          </div>
        </div>
      ) : (
        <div className="seg-picker-empty">
          <div className="seg-empty-text">
            <strong>No player segment selected.</strong> Bonus is available to all players for this configure.
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setOpen(o => !o)}>
            <Icon name="users" size={12}/> Select Player Segment
          </button>
        </div>
      )}

      {open && (
        <div className="seg-picker-pop">
          <div className="pop-search">
            <input
              autoFocus
              type="text"
              placeholder="Search segments…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="pop-list">
            {filtered.length === 0 ? (
              <div className="pop-empty">No segments match &ldquo;{query}&rdquo;</div>
            ) : filtered.map(s => (
              <div
                key={String(s.id)}
                className={'pop-item' + (s.id === segmentId ? ' selected' : '')}
                onClick={() => { setSegmentId(s.id); setOpen(false); setQuery(''); }}
              >
                <Icon name="users" size={12} color={s.id === segmentId ? 'var(--blue)' : 'var(--g400)'}/>
                <div className="pop-label">{s.label}</div>
                <div className="pop-count">{s.count.toLocaleString('en-IN')}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
