'use client';
import React from 'react';
import Icon from '../Icon';
import { formatRelative, formatDateShort, avatarGradient, initial } from '../../utils';
import type { Segment } from '../../types';

function highlight(text: string, q: string): React.ReactNode {
  if (!q || !q.trim()) return text;
  const i = text.toLowerCase().indexOf(q.trim().toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.trim().length)}</mark>{text.slice(i + q.trim().length)}</>;
}

interface SegmentsBrowseProps {
  list: Segment[];
  totalCount: number;
  loading?: boolean;
  search: string;
  setSearch: (s: string) => void;
  sortBy: string;
  setSortBy: (s: string) => void;
  onCreate: () => void;
  onPick?: (s: Segment) => void;
  onDelete?: (segmentId: string) => void;
  onEvaluate?: (segmentId: string) => void;
}

export default function SegmentsBrowse({
  list, totalCount, loading, search, setSearch, sortBy, setSortBy,
  onCreate, onPick, onDelete, onEvaluate,
}: SegmentsBrowseProps) {
  return (
    <>
      <div className="modal-toolbar">
        <div className="modal-search">
          <Icon name="search" size={13} color="var(--g400)"/>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or description…"
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

      {!loading && list.length > 0 && (
        <div className="seg-thead">
          <span className="th-id">Segment ID</span>
          <span className="th-name">Name</span>
          <span className="th-owner">Created by</span>
          <span className="th-size">Members</span>
          <span className="th-act"></span>
        </div>
      )}

      <div className="modal-body seg-modal-body">
        {loading ? (
          <div className="seg-empty">
            <Icon name="loader" size={24} color="var(--g300)"/>
            <div className="seg-empty-title">Loading segments…</div>
          </div>
        ) : list.length === 0 ? (
          <div className="seg-empty">
            <Icon name="search-x" size={24} color="var(--g300)"/>
            <div className="seg-empty-title">
              {search ? `No segments match "${search}"` : 'No segments yet'}
            </div>
            <div className="seg-empty-hint">
              {search ? 'Try a different keyword, or create a new segment.' : 'Create your first segment to get started.'}
            </div>
          </div>
        ) : (
          <div className="seg-table">
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
                <span className="seg-table-id">{highlight(String(s.id), search)}</span>
                <div className="seg-table-name">
                  <span className="seg-panel-icon"><Icon name="users" size={11}/></span>
                  <span className="lbl">{highlight(s.label ?? '', search)}</span>
                </div>
                <span className="seg-table-owner">
                  {s.owner
                    ? <span className="seg-owner-text">{s.owner}</span>
                    : <span className="seg-owner-text" style={{ color: 'var(--g400)' }}>—</span>}
                </span>
                <span className="seg-table-size">{s.count.toLocaleString('en-IN')}</span>
                <span className="seg-table-act" onClick={(e) => e.stopPropagation()}>
                  {onEvaluate && (
                    <button
                      className="btn btn-ghost btn-sm btn-icon-only"
                      title="Re-evaluate segment"
                      onClick={() => onEvaluate(String(s.id))}
                    >
                      <Icon name="refresh-cw" size={12}/>
                    </button>
                  )}
                  {onDelete && (
                    <button
                      className="btn btn-ghost btn-sm btn-icon-only"
                      title="Delete segment"
                      onClick={() => {
                        if (confirm(`Delete segment "${s.label}"?`)) onDelete(String(s.id));
                      }}
                    >
                      <Icon name="trash-2" size={12}/>
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="modal-footer-row">
        <span className="modal-footer-meta">
          {search ? `${list.length} of ${totalCount}` : totalCount} segment{totalCount === 1 ? '' : 's'}
        </span>
      </div>
    </>
  );
}
