'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useDispatch } from 'react-redux';
import Icon from '../Icon';
import RuleEditor from './RuleEditor';
import { useCommonSelector } from '../../store/hooks';
import {
  fetchMetaTraits, fetchMetaEvents, fetchMetaOperators,
  selectMetaTraits, selectMetaEvents, selectMetaOperators,
} from '../../store/slices/segmentsSlice';
import { SEGMENT_FIELDS, OPS } from '../../services/mocks/segments';
import type { SegmentRule, SegmentField } from '../../types';

const PROJECT_ID = process.env.NEXT_PUBLIC_PROJECT_ID ?? 'proj_demo';

function buildFields(traits: string[], events: string[]): SegmentField[] {
  const knownMap = Object.fromEntries(SEGMENT_FIELDS.map(f => [f.id, f]));
  const traitFields: SegmentField[] = traits.map(t =>
    knownMap[t] ?? { id: t, label: t.replace(/_/g, ' '), type: 'text' as const }
  );
  const eventFields: SegmentField[] = events.map(e => ({
    id: `event:${e}`,
    label: e.replace(/_/g, ' '),
    type: 'event' as const,
  }));
  return [...traitFields, ...eventFields];
}

interface RuleWithMeta extends SegmentRule {
  id: number;
  unit?: string;
  value2?: string;
}

type PickerMode = 'trait' | 'event' | null;

interface SegmentBuilderProps {
  onCancel: () => void;
  onSave: (data: { name: string; description: string; combinator: 'AND' | 'OR'; rules: SegmentRule[] }) => void;
}

export default function SegmentBuilder({ onCancel, onSave }: SegmentBuilderProps) {
  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [combinator, setCombinator]   = useState<'AND' | 'OR'>('AND');
  const [rules, setRules]             = useState<RuleWithMeta[]>([]);
  const [nextId, setNextId]           = useState(1);
  const [pickerMode, setPickerMode]   = useState<PickerMode>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  const dispatch      = useDispatch();
  const metaTraits    = useCommonSelector(selectMetaTraits);
  const metaEvents    = useCommonSelector(selectMetaEvents);
  const metaOperators = useCommonSelector(selectMetaOperators);

  useEffect(() => {
    dispatch(fetchMetaTraits(PROJECT_ID) as any);
    dispatch(fetchMetaEvents(PROJECT_ID) as any);
    dispatch(fetchMetaOperators() as any);
  }, [dispatch]);

  // Close picker on outside click
  useEffect(() => {
    if (!pickerMode) return;
    const onDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerMode(null);
        setPickerSearch('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pickerMode]);

  const fields = useMemo(
    () => metaTraits.length > 0 || metaEvents.length > 0
      ? buildFields(metaTraits, metaEvents)
      : SEGMENT_FIELDS as SegmentField[],
    [metaTraits, metaEvents]
  );

  const pickerItems = useMemo(() => {
    const items = pickerMode === 'event' ? metaEvents : metaTraits;
    const q = pickerSearch.trim().toLowerCase();
    return q ? items.filter(i => i.toLowerCase().includes(q)) : items;
  }, [pickerMode, pickerSearch, metaTraits, metaEvents]);

  const togglePicker = (mode: 'trait' | 'event') => {
    setPickerMode(prev => (prev === mode ? null : mode));
    setPickerSearch('');
  };

  const handlePickerSelect = (item: string) => {
    const opsMap = OPS as Record<string, { id: string; label: string }[]>;
    let fieldId: string;
    let firstOp: string;

    if (pickerMode === 'event') {
      fieldId = `event:${item}`;
      firstOp = (opsMap['event'] ?? [{ id: 'gte', label: '≥' }])[0]?.id ?? 'gte';
    } else {
      fieldId = item;
      const knownField = (SEGMENT_FIELDS as SegmentField[]).find(f => f.id === item);
      const fieldType  = knownField?.type ?? 'text';
      firstOp = (opsMap[fieldType] ?? opsMap['text'] ?? [{ id: 'eq', label: 'is' }])[0]?.id ?? 'eq';
    }

    setRules(rs => [...rs, { id: nextId, field: fieldId, op: firstOp, value: '' }]);
    setNextId(n => n + 1);
    setPickerMode(null);
    setPickerSearch('');
  };

  const updateRule = (id: number, patch: Partial<RuleWithMeta>) =>
    setRules(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  const removeRule = (id: number) => setRules(rs => rs.filter(r => r.id !== id));

  const estimate = useMemo(() => {
    if (rules.length === 0) return 0;
    let base = 24800;
    rules.forEach((r) => {
      const factor = 0.45 + ((r.id * 7) % 30) / 100;
      base = Math.floor(base * factor);
    });
    if (combinator === 'OR') base = Math.min(24800, base * Math.max(1, rules.length));
    return Math.max(12, base);
  }, [rules, combinator]);

  const canSave = name.trim().length >= 2 && rules.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    onSave({ name, description, combinator, rules });
  };

  return (
    <>
      <div className="modal-body seg-builder-body">
        <div className="builder-row builder-meta">
          <div className="field-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>Segment name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. High LTV — Maharashtra, no recent bonus"/>
          </div>
          <div className="field-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>Description <span style={{ color: 'var(--g400)', fontWeight: 400 }}>· optional</span></label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this segment for?"/>
          </div>
        </div>

        <div className="builder-section">
          <div className="builder-section-head">
            <span className="section-label" style={{ margin: 0 }}>Filters</span>
            <div className="builder-combinator">
              <span style={{ fontSize: 11.5, color: 'var(--g500)' }}>Match</span>
              <div className="seg" style={{ '--cols': 2, padding: 3, width: 132 } as React.CSSProperties}>
                <button type="button" className={combinator === 'AND' ? 'active' : ''} onClick={() => setCombinator('AND')}>ALL (AND)</button>
                <button type="button" className={combinator === 'OR' ? 'active' : ''} onClick={() => setCombinator('OR')}>ANY (OR)</button>
              </div>
            </div>
          </div>

          <div className="builder-rules">
            {rules.length === 0 && (
              <div className="builder-empty">No filters yet — click <strong>Add Trait</strong> or <strong>Add Event</strong> below.</div>
            )}
            {rules.map((r, i) => (
              <div key={r.id}>
                {i > 0 && <div className="builder-join">{combinator}</div>}
                <RuleEditor rule={r} fields={fields} metaOperators={metaOperators} onChange={(patch) => updateRule(r.id, patch)} onRemove={() => removeRule(r.id)}/>
              </div>
            ))}
          </div>

          {/* Add Trait / Add Event buttons with picker */}
          <div className="builder-add-row" ref={pickerRef}>
            <button
              className={'builder-add' + (pickerMode === 'trait' ? ' active' : '')}
              type="button"
              onClick={() => togglePicker('trait')}
            >
              <Icon name="tag" size={12}/>
              Add Trait
              {metaTraits.length > 0 && <span className="builder-add-count">{metaTraits.length}</span>}
            </button>

            <button
              className={'builder-add' + (pickerMode === 'event' ? ' active' : '')}
              type="button"
              onClick={() => togglePicker('event')}
            >
              <Icon name="zap" size={12}/>
              Add Event
              {metaEvents.length > 0 && <span className="builder-add-count">{metaEvents.length}</span>}
            </button>

            {pickerMode && (
              <div className="builder-picker">
                <div className="builder-picker-header">
                  <Icon name={pickerMode === 'event' ? 'zap' : 'tag'} size={12} color="var(--blue)"/>
                  <span>{pickerMode === 'event' ? 'Events' : 'Traits'}</span>
                </div>
                <div className="builder-picker-search">
                  <Icon name="search" size={12} color="var(--g400)"/>
                  <input
                    autoFocus
                    placeholder={`Search ${pickerMode}s…`}
                    value={pickerSearch}
                    onChange={e => setPickerSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') { setPickerMode(null); setPickerSearch(''); } }}
                  />
                </div>
                <div className="builder-picker-list">
                  {pickerItems.length === 0 ? (
                    <div className="builder-picker-empty">
                      {pickerSearch ? `No ${pickerMode}s match "${pickerSearch}"` : `No ${pickerMode}s available`}
                    </div>
                  ) : pickerItems.map(item => (
                    <button
                      key={item}
                      className="builder-picker-item"
                      type="button"
                      onClick={() => handlePickerSelect(item)}
                    >
                      <Icon name={pickerMode === 'event' ? 'zap' : 'tag'} size={11} color="var(--g400)"/>
                      <span>{item.replace(/_/g, ' ')}</span>
                      <span className="builder-picker-item-raw">{item}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="builder-preview">
          <div className="builder-preview-num">{estimate.toLocaleString('en-IN')}</div>
          <div className="builder-preview-meta">
            <span className="k">Estimated reach</span>
            <span className="v">~{Math.round((estimate / 24800) * 100)}% of active players · {rules.length} filter{rules.length === 1 ? '' : 's'} ({combinator})</span>
          </div>
          <button className="builder-refresh" type="button" title="Recompute">
            <Icon name="refresh-cw" size={12}/> Preview
          </button>
        </div>
      </div>

      <div className="modal-footer-row builder-footer">
        <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel}>
          <Icon name="arrow-left" size={12}/> Back to browse
        </button>
        <div style={{ flex: 1 }}/>
        <button className="btn btn-secondary btn-sm" type="button" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary btn-sm" type="button" disabled={!canSave} onClick={handleSave}>
          <Icon name="check" size={12}/> Save segment
        </button>
      </div>
    </>
  );
}
