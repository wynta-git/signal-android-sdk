'use client';
import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Icon from 'wynta-react-common/components/Icon';
import { formatRelative } from '@/services/mocks/utils';
import { MANUAL_SEGMENTS } from '@/services/mocks/constants';
import SegmentsModal from './SegmentsModal';
import SegmentPlayersModal from './SegmentPlayersModal';
import type { Segment } from '@/types';

type ModalMode = 'browse' | 'create';

export default function PlayerSegmentsPanel() {
  const [open, setOpen]             = useState(true);
  const [hovered, setHovered]       = useState<string | number | null>(null);
  const [modal, setModal]           = useState<ModalMode | null>(null);
  const [viewSegment, setViewSegment] = useState<Segment | null>(null);
  const segs = MANUAL_SEGMENTS as Segment[];

  const recent = useMemo(() => {
    return [...segs]
      .sort((a, b) => new Date(b.last_used_at ?? 0).getTime() - new Date(a.last_used_at ?? 0).getTime())
      .slice(0, 10);
  }, [segs]);

  return (
    <>
      <div className="seg-panel">
        <button
          type="button"
          className="seg-panel-header"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
        >
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} color="var(--g400)"/>
          <span className="seg-panel-title">Player Segments</span>
          <span className="seg-panel-badge">Recent</span>
          <span className="seg-panel-count">{recent.length}/{segs.length}</span>
        </button>
        {open && (
          <div className="seg-panel-body">
            <div className="seg-panel-list">
              {recent.map(s => (
                <div
                  key={String(s.id)}
                  className={'seg-panel-row' + (hovered === s.id ? ' hover' : '')}
                  onMouseEnter={() => setHovered(s.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setViewSegment(s)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewSegment(s); } }}
                  style={{ cursor: 'pointer' }}
                  title={(s.hint ?? '') + ' · last used ' + formatRelative(s.last_used_at ?? '')}
                >
                  <span className="seg-panel-icon"><Icon name="users" size={11}/></span>
                  <div className="seg-panel-text">
                    <span className="seg-panel-name">{s.label}</span>
                    <span className="seg-panel-hint">used {formatRelative(s.last_used_at ?? '')} · {s.use_count}×</span>
                  </div>
                  <span className="seg-panel-num">{s.count.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
            <div className="seg-panel-actions">
              <button className="seg-panel-action" type="button" onClick={() => setModal('browse')}>
                <Icon name="list" size={11}/>
                <span>See all {segs.length}</span>
              </button>
              <button className="seg-panel-action primary" type="button" onClick={() => setModal('create')}>
                <Icon name="plus" size={11}/>
                <span>New segment</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {modal && typeof document !== 'undefined' && createPortal(
        <SegmentsModal
          initialMode={modal}
          onClose={() => setModal(null)}
          onOpenSegment={(s) => { setModal(null); setViewSegment(s); }}
        />,
        document.body
      )}

      {viewSegment && (
        <SegmentPlayersModal
          segment={viewSegment}
          onClose={() => setViewSegment(null)}
        />
      )}
    </>
  );
}
