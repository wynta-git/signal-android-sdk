'use client';
import { useState, useMemo, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import Icon from '../Icon';
import SegmentsBrowse from './SegmentsBrowse';
import SegmentBuilder from './SegmentBuilder';
import { useCommonSelector } from '../../store/hooks';
import {
  fetchSegments,
  createSegment,
  deleteSegment,
  evaluateSegment,
  selectAllSegments,
  selectSegmentsStatus,
} from '../../store/slices/segmentsSlice';
import type { Segment, SegmentRule } from '../../types';

type ModalMode = 'browse' | 'create';
type SortBy = 'RECENT' | 'NAME' | 'SIZE';

interface SegmentsModalProps {
  initialMode: ModalMode;
  onClose: () => void;
  onOpenSegment?: (s: Segment) => void;
  onCreateSegment?: (data: { name: string; description: string; combinator: 'AND' | 'OR'; rules: SegmentRule[]; segmentType?: 'filter' | 'custom'; csvFile?: File }) => void;
}

export default function SegmentsModal({ initialMode, onClose, onOpenSegment, onCreateSegment }: SegmentsModalProps) {
  const [mode, setMode]     = useState<ModalMode>(initialMode);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('RECENT');

  const dispatch = useDispatch();
  const segs   = useCommonSelector(selectAllSegments);
  const status = useCommonSelector(selectSegmentsStatus);

  useEffect(() => {
    dispatch(fetchSegments() as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]); // always fetch fresh on open

  useEffect(() => {
    function handle(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
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
      !q || (s.label ?? '').toLowerCase().includes(q) || (s.hint ?? '').toLowerCase().includes(q)
    );
    if (sortBy === 'RECENT')    list = [...list].sort((a, b) => new Date(b.last_used_at ?? 0).getTime() - new Date(a.last_used_at ?? 0).getTime());
    else if (sortBy === 'NAME') list = [...list].sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
    else if (sortBy === 'SIZE') list = [...list].sort((a, b) => b.count - a.count);
    return list;
  }, [search, sortBy, segs]);

  const handleSave = (data: { name: string; description: string; combinator: 'AND' | 'OR'; rules: SegmentRule[]; segmentType?: 'filter' | 'custom'; csvFile?: File }) => {
    dispatch(createSegment(data) as any).then((action: any) => {
      if (action.payload?.id) {
        dispatch(evaluateSegment(String(action.payload.id)) as any);
      }
    });
    onCreateSegment?.(data);
    onClose();
  };

  const handleDelete = (segmentId: string) => {
    dispatch(deleteSegment(segmentId) as any);
  };

  const handleEvaluate = (segmentId: string) => {
    dispatch(evaluateSegment(segmentId) as any);
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal seg-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-icon"><Icon name="users" size={16}/></span>
          <div className="modal-title-block">
            <span className="modal-title">Player Segments</span>
            <span className="modal-subtitle">
              {mode === 'browse'
                ? `${segs.length} segment${segs.length === 1 ? '' : 's'} · browse & search`
                : 'Build a new segment with filters'}
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
          ? <SegmentsBrowse
              list={filtered}
              totalCount={segs.length}
              loading={status === 'loading'}
              search={search}
              setSearch={setSearch}
              sortBy={sortBy}
              setSortBy={(s) => setSortBy(s as SortBy)}
              onCreate={() => setMode('create')}
              onPick={onOpenSegment}
              onDelete={handleDelete}
              onEvaluate={handleEvaluate}
            />
          : <SegmentBuilder onCancel={() => setMode('browse')} onSave={handleSave}/>}
      </div>
    </div>
  );
}
