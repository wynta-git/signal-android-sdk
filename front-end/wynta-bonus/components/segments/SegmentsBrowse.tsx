'use client';
import React from 'react';
import Icon from 'wynta-react-common/components/Icon';
import { formatRelative, formatDateShort, avatarGradient, initial } from '@/services/mocks/utils';
import { MANUAL_SEGMENTS } from '@/services/mocks/constants';
import type { Segment } from '@/types';

function highlight(text: string, q: string): React.ReactNode {
  if (!q || !q.trim()) return text;
  const i = text.toLowerCase().indexOf(q.trim().toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.trim().length)}</mark>{text.slice(i + q.trim().length)}</>;
}

interface SegmentsBrowseProps {
  list: Segment[];
  search: string;
  setSearch: (s: string) => void;
  sortBy: string;
  setSortBy: (s: string) => void;
  onCreate: () => void;
  onPick?: (s: Segment) => void;
}

export default function SegmentsBrowse({ list, search, setSearch, sortBy, setSortBy, onCreate, onPick }: SegmentsBrowseProps) {
  return (
    <>
      <div className="modal-toolbar">
        <div className="modal-search">
          <Icon name="search" size={13} color="var(--g400)"/>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, owner or description…"
            autoFocus
          />
          {search && (
            <button className="modal-search-clear" onClick={() => setSearch('')} aria-label="Clear">
              <Icon name="x" size={13}/>
            </button>
          )}
        </div>
        <div className="seg-sort">
          <span className="seg-sort-label">Sort</span>
          <div className="seg" style={{ '--cols': 3, padding: 3 } as React.CSSProperties}>
            <button type="button" className={sortBy === 'RECENT' ? 'active' : ''} onClick={() => setSortBy('RECENT')}>Recent</button>
            <button type="button" className={sortBy === 'NAME'   ? 'active' : ''} onClick={() => setSortBy('NAME')}>Name</button>
            <button type="button" className={sortBy === 'SIZE'   ? 'active' : ''} onClick={() => setSortBy('SIZE')}>Size</button>
          </div>
        </div>
        <button className="btn btn-primary btn-sm" type="button" onClick={onCreate}>
          <Icon name="plus" size={12}/> New segment
        </button>
      </div>

      <div className="modal-body seg-modal-body">
        {list.length === 0 ? (
          <div className="seg-empty">
            <Icon name="search-x" size={24} color="var(--g300)"/>
            <div className="seg-empty-title">No segments match &ldquo;{search}&rdquo;</div>
            <div className="seg-empty-hint">Try a different keyword, or create a new segment.</div>
          </div>
        ) : (
          <div className="seg-table">
            <div className="seg-table-head">
              <span className="th-name">Segment</span>
              <span className="th-size">Size</span>
              <span className="th-used">Last used</span>
              <span className="th-runs">Uses</span>
              <span className="th-owner">Owner</span>
              <span className="th-act"></span>
            </div>
            {list.map(s => (
              <div
                key={String(s.id)}
                className="seg-table-row"
                onClick={() => onPick && onPick(s)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && onPick) { e.preventDefault(); onPick(s); } }}
                style={{ cursor: onPick ? 'pointer' : 'default' }}
                title={`View ${s.count.toLocaleString('en-IN')} players in ${s.label}`}
              >
                <div className="seg-table-name">
                  <span className="seg-panel-icon"><Icon name="users" size={11}/></span>
                  <div className="seg-table-name-text">
                    <span className="lbl">{highlight(s.label ?? '', search)}</span>
                    <span className="hint">{highlight(s.hint ?? '', search)}</span>
                  </div>
                </div>
                <span className="seg-table-size">{s.count.toLocaleString('en-IN')}</span>
                <span className="seg-table-when" title={formatDateShort(s.last_used_at ?? '')}>{formatRelative(s.last_used_at ?? '')}</span>
                <span className="seg-table-runs">{s.use_count}×</span>
                <span className="seg-table-owner">
                  <span className="seg-av" style={{ background: avatarGradient(s.owner ?? '') }}>{initial(s.owner ?? '')}</span>
                  <span className="seg-owner-text">{(s.owner ?? '').split('@')[0]}</span>
                </span>
                <span className="seg-table-act" onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-ghost btn-sm btn-icon-only" title="Edit segment"><Icon name="pencil" size={12}/></button>
                  <button className="btn btn-ghost btn-sm btn-icon-only" title="Duplicate"><Icon name="copy" size={12}/></button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="modal-footer-row">
        <span className="modal-footer-meta">{list.length} of {(MANUAL_SEGMENTS as Segment[]).length} segments</span>
      </div>
    </>
  );
}
