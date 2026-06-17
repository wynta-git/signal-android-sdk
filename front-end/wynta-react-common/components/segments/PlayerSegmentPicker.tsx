'use client';
import { useState, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import Icon from '../Icon';
import { useCommonSelector } from '../../store/hooks';
import { fetchSegments, selectAllSegments, selectSegmentsStatus } from '../../store/slices/segmentsSlice';
import type { Segment } from '../../types';

interface EligibilityLike {
  key?: string;
  value?: string | number;
  rule_value?: string | number;
  [k: string]: unknown;
}

interface PlayerSegmentPickerProps {
  configureId: number;
  eligibilities?: EligibilityLike[];
  onSelect?: (segmentId: string | number | null) => void;
}

export default function PlayerSegmentPicker({ configureId, eligibilities, onSelect }: PlayerSegmentPickerProps) {
  const dispatch = useDispatch();
  const segs   = useCommonSelector(selectAllSegments);
  const status = useCommonSelector(selectSegmentsStatus);

  useEffect(() => {
    if (status === 'idle') dispatch(fetchSegments() as any);
  }, [dispatch, status]);

  const segRule = eligibilities?.find(e => e.key === 'segment_id' || (e as any).eligibility_key === 'segment_id');
  const segRuleValue = segRule
    ? (segRule.value ?? segRule.rule_value ?? (segRule as any).eligibility_value ?? null)
    : null;

  const [segmentId, setSegmentId] = useState<string | number | null>(segRuleValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const v = eligibilities?.find(e => e.key === 'segment_id' || (e as any).eligibility_key === 'segment_id');
    const val = v ? (v.value ?? v.rule_value ?? (v as any).eligibility_value ?? null) : null;
    setSegmentId(val);
    setOpen(false);
  }, [configureId, eligibilities]); // eslint-disable-line

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
            <button className="btn btn-secondary btn-sm btn-icon-only" title="Remove segment" onClick={() => { setSegmentId(null); setOpen(false); onSelect?.(null); }}>
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
                onClick={() => { setSegmentId(s.id); setOpen(false); setQuery(''); onSelect?.(s.id); }}
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
