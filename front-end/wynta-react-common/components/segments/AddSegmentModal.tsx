'use client';
import { useState, useEffect } from 'react';
import { createPortal }        from 'react-dom';
import { useDispatch }         from 'react-redux';
import Icon                    from '../Icon';
import SegmentBuilder          from './SegmentBuilder';
import type { SegmentBuilderInitialValues, RuleWithMeta } from './SegmentBuilder';
import {
  createSegment,
  updateSegment,
  evaluateSegment,
  getSegment,
} from '../../store/slices/segmentsSlice';
import type { Segment, SegmentRule } from '../../types';

/* ------------------------------------------------------------------ */
/* API filter types (as returned by GET /api/v1/segments/{id})         */
/* ------------------------------------------------------------------ */
type ApiFilter =
  | { type: 'trait';       trait: string;      op: string;  value: unknown }
  | { type: 'event';       event_name: string; frequency?: { op: string; count: number }; time_window?: { last_days?: number }; where?: Record<string, { op: string; value: unknown }> }
  | { type: 'derived';     rule_id: string;    parameters?: Record<string, unknown> }
  | { type: 'derived_rule';rule_name: string;  parameters?: Record<string, unknown> }
  | { type: 'did_not_do';  event_name: string; time_window?: { last_days?: number } }
  | { type: 'in_segment';  segment_id: string }
  | { type: string };       // catch-all for unknown types

/* ------------------------------------------------------------------ */
/* Parse a Segment's rule DSL into SegmentBuilder initial values       */
/* ------------------------------------------------------------------ */
function parseSegment(segment: Segment): SegmentBuilderInitialValues {
  const rule = segment.rule as { match?: string; filters?: ApiFilter[] } | null | undefined;
  const combinator: 'AND' | 'OR' = rule?.match === 'any' ? 'OR' : 'AND';

  const propertyRules:  RuleWithMeta[] = [];
  const behaviourRules: RuleWithMeta[] = [];
  let id = 1;

  for (const f of (rule?.filters ?? [])) {
    switch (f.type) {

      case 'trait': {
        const t = f as Extract<ApiFilter, { type: 'trait' }>;
        propertyRules.push({
          id:    id++,
          field: t.trait,
          op:    t.op,
          value: Array.isArray(t.value)
            ? (t.value as string[])
            : String(t.value ?? ''),
        });
        break;
      }

      case 'event': {
        const e = f as Extract<ApiFilter, { type: 'event' }>;
        const whereProp  = e.where ? Object.keys(e.where)[0] : undefined;
        const whereEntry = whereProp ? e.where![whereProp] : undefined;
        behaviourRules.push({
          id:             id++,
          field:          `event:${e.event_name}`,
          op:             e.frequency?.op   ?? 'gte',
          value:          String(e.frequency?.count  ?? '1'),
          value2:         String(e.time_window?.last_days ?? '30'),
          eventProp:      whereProp,
          eventPropOp:    whereEntry?.op,
          eventPropValue: whereEntry ? String(whereEntry.value ?? '') : undefined,
        });
        break;
      }

      case 'derived':
      case 'derived_rule': {
        // Support both new format (type:"derived", rule_id) and old (type:"derived_rule", rule_name)
        const d     = f as Record<string, unknown>;
        const ruleId = (d.rule_id ?? d.rule_name ?? '') as string;

        // Parameters arrive as { key: value } (new) or { key: { op, value } } (old)
        const rawParams = (d.parameters ?? {}) as Record<string, unknown>;
        const derivedParams: Record<string, { op: string; value: string }> = {};
        for (const [k, v] of Object.entries(rawParams)) {
          if (v !== null && typeof v === 'object' && 'value' in (v as object)) {
            derivedParams[k] = v as { op: string; value: string };
          } else {
            derivedParams[k] = { op: '', value: String(v ?? '') };
          }
        }

        behaviourRules.push({
          id:           id++,
          field:        `derived:${ruleId}`,
          op:           '',
          value:        '',
          derivedParams,
        });
        break;
      }

      case 'did_not_do': {
        const dn = f as Extract<ApiFilter, { type: 'did_not_do' }>;
        behaviourRules.push({
          id:     id++,
          field:  `event:${dn.event_name}`,
          op:     'eq',
          value:  '0',
          value2: String(dn.time_window?.last_days ?? '30'),
        });
        break;
      }

      case 'in_segment': {
        const s = f as Extract<ApiFilter, { type: 'in_segment' }>;
        behaviourRules.push({
          id:    id++,
          field: `in_segment:${s.segment_id}`,
          op:    'in_segment',
          value: s.segment_id,
        });
        break;
      }

      default:
        break;
    }
  }

  return {
    name:          segment.label ?? segment.name ?? '',
    description:   segment.description ?? '',
    combinator,
    propertyRules,
    behaviourRules,
    nextId: id,
  };
}

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */
export interface AddSegmentModalProps {
  mode:       'create' | 'edit';
  segmentId?: string;          // required when mode === 'edit'
  onClose:    () => void;
  /** id is the newly-created segment ID — available only in create mode */
  onSaved?:   (data: { name: string; id?: string }) => void;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
export default function AddSegmentModal({
  mode,
  segmentId,
  onClose,
  onSaved,
}: AddSegmentModalProps) {
  const dispatch = useDispatch<any>();

  const [loading, setLoading]               = useState(mode === 'edit');
  const [loadError, setLoadError]           = useState('');
  const [segmentData, setSegmentData]       = useState<Segment | null>(null);
  const [initialValues, setInitialValues]   = useState<SegmentBuilderInitialValues | undefined>();

  /* ESC + body scroll lock */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  /* Fetch segment details for edit mode */
  useEffect(() => {
    if (mode !== 'edit' || !segmentId) return;

    setLoading(true);
    setLoadError('');

    dispatch(getSegment(segmentId))
      .unwrap()
      .then((seg: Segment) => {
        setSegmentData(seg);
        setInitialValues(parseSegment(seg));
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load segment details.');
      })
      .finally(() => setLoading(false));
  }, [mode, segmentId, dispatch]);

  /* Save handler passed to SegmentBuilder */
  const handleSave = async (data: {
    name: string;
    description: string;
    combinator: 'AND' | 'OR';
    rules: SegmentRule[];
  }) => {
    try {
      if (mode === 'edit' && segmentId) {
        /* PUT /api/v1/segments/{id} */
        await dispatch(updateSegment({
          segmentId,
          name:             data.name,
          combinator:       data.combinator,
          rules:            data.rules,
          refresh_strategy: segmentData?.refresh_strategy as any,
          scheduled_cron:   segmentData?.scheduled_cron,
        })).unwrap();

        /* Re-evaluate to refresh the member count */
        dispatch(evaluateSegment(segmentId));
      } else {
        /* POST /api/v1/segments */
        const result = await dispatch(createSegment(data)).unwrap();
        const newId  = result?.id ? String(result.id) : undefined;
        if (newId) dispatch(evaluateSegment(newId));
        onSaved?.({ name: data.name, id: newId });
        onClose();
        return;
      }

      onSaved?.({ name: data.name });
      onClose();
    } catch {
      /* SegmentBuilder keeps modal open; user can retry */
    }
  };

  if (typeof document === 'undefined') return null;

  const title = mode === 'edit' ? 'Edit Segment' : 'Add Segment';

  return createPortal(
    <div
      className="asm-overlay"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="asm-modal" onMouseDown={e => e.stopPropagation()}>

        {/* Header */}
        <div className="asm-header">
          <span className="asm-title">{title}</span>
          <button className="asm-close" type="button" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        {loading ? (
          <div className="seg-modal-loading">
            <Icon name="loader" size={20} color="var(--crm-fg4, #9AA0A6)" />
            <span>Loading segment details…</span>
          </div>
        ) : loadError ? (
          <div className="seg-modal-error">
            <Icon name="alert-circle" size={16} />
            <span>{loadError}</span>
            <button type="button" className="asm-btn asm-btn--secondary" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          /* Key on segmentId so SegmentBuilder remounts fresh with correct initial state */
          <SegmentBuilder
            key={mode === 'edit' ? segmentId : 'create'}
            mode={mode}
            initialValues={initialValues}
            onCancel={onClose}
            onSave={handleSave}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
