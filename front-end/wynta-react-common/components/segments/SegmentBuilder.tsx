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

function toLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function buildSplitFields(traits: string[], events: string[]): { traitFields: SegmentField[]; eventFields: SegmentField[] } {
  const knownMap = Object.fromEntries(SEGMENT_FIELDS.map(f => [f.id, f]));
  const traitFields: SegmentField[] = traits.map(t =>
    knownMap[t] ?? { id: t, label: toLabel(t), type: 'text' as const }
  );
  const eventFields: SegmentField[] = events.map(e => ({
    id: `event:${e}`,
    label: toLabel(e),
    type: 'event' as const,
  }));
  return { traitFields, eventFields };
}

interface RuleWithMeta extends SegmentRule {
  id: number;
  unit?: string;
  value2?: string;
  eventProp?: string;
  eventPropOp?: string;
  eventPropValue?: string;
}

type SegmentType   = 'all' | 'filtered';
type ActivePicker  = 'property' | 'behaviour' | null;

interface SegmentBuilderProps {
  onCancel: () => void;
  onSave: (data: { name: string; description: string; combinator: 'AND' | 'OR'; rules: SegmentRule[] }) => void;
}

export default function SegmentBuilder({ onCancel, onSave }: SegmentBuilderProps) {
  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [combinator, setCombinator]   = useState<'AND' | 'OR'>('AND');
  const [segmentType, setSegmentType] = useState<SegmentType>('all');
  const [propertyRules, setPropertyRules]     = useState<RuleWithMeta[]>([]);
  const [behaviourRules, setBehaviourRules]   = useState<RuleWithMeta[]>([]);
  const [nextId, setNextId]           = useState(1);
  const [activePicker, setActivePicker]       = useState<ActivePicker>(null);
  const [pickerSearch, setPickerSearch]       = useState('');
  const propertyPickerRef  = useRef<HTMLDivElement>(null);
  const behaviourPickerRef = useRef<HTMLDivElement>(null);

  const dispatch      = useDispatch();
  const metaTraits    = useCommonSelector(selectMetaTraits);
  const metaEvents    = useCommonSelector(selectMetaEvents);
  const metaOperators = useCommonSelector(selectMetaOperators);

  useEffect(() => {
    dispatch(fetchMetaTraits(PROJECT_ID) as any);
    dispatch(fetchMetaEvents(PROJECT_ID) as any);
    dispatch(fetchMetaOperators() as any);
  }, [dispatch]);

  useEffect(() => {
    if (!activePicker) return;
    const onDown = (e: MouseEvent) => {
      const ref = activePicker === 'property' ? propertyPickerRef : behaviourPickerRef;
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setActivePicker(null);
        setPickerSearch('');
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [activePicker]);

  const { traitFields, eventFields } = useMemo(() => {
    if (metaTraits.length > 0 || metaEvents.length > 0) {
      return buildSplitFields(metaTraits, metaEvents);
    }
    const fallbackTraits = (SEGMENT_FIELDS as SegmentField[]).filter(f => f.type !== 'event');
    return { traitFields: fallbackTraits, eventFields: [] };
  }, [metaTraits, metaEvents]);

  const pickerItems = useMemo(() => {
    const items = activePicker === 'behaviour' ? metaEvents : metaTraits;
    const q = pickerSearch.trim().toLowerCase();
    return q ? items.filter(i => i.toLowerCase().includes(q)) : items;
  }, [activePicker, pickerSearch, metaTraits, metaEvents]);

  const togglePicker = (mode: 'property' | 'behaviour') => {
    setActivePicker(prev => (prev === mode ? null : mode));
    setPickerSearch('');
  };

  const handlePickerSelect = (item: string) => {
    const opsMap = OPS as Record<string, { id: string; label: string }[]>;
    let fieldId: string;
    let firstOp: string;

    if (activePicker === 'behaviour') {
      fieldId = `event:${item}`;
      firstOp = (opsMap['event'] ?? [{ id: 'gte', label: '≥' }])[0]?.id ?? 'gte';
    } else {
      fieldId = item;
      const knownField = (SEGMENT_FIELDS as SegmentField[]).find(f => f.id === item);
      const fieldType  = knownField?.type ?? 'text';
      firstOp = (opsMap[fieldType] ?? opsMap['text'] ?? [{ id: 'eq', label: 'is' }])[0]?.id ?? 'eq';
    }

    const newRule: RuleWithMeta = { id: nextId, field: fieldId, op: firstOp, value: '' };
    if (activePicker === 'behaviour') {
      setBehaviourRules(rs => [...rs, newRule]);
    } else {
      setPropertyRules(rs => [...rs, newRule]);
    }
    setNextId(n => n + 1);
    setActivePicker(null);
    setPickerSearch('');
  };

  const updatePropertyRule  = (id: number, patch: Partial<RuleWithMeta>) =>
    setPropertyRules(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  const removePropertyRule  = (id: number) => setPropertyRules(rs => rs.filter(r => r.id !== id));

  const updateBehaviourRule = (id: number, patch: Partial<RuleWithMeta>) =>
    setBehaviourRules(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  const removeBehaviourRule = (id: number) => setBehaviourRules(rs => rs.filter(r => r.id !== id));

  const allRules = useMemo(() => [...propertyRules, ...behaviourRules], [propertyRules, behaviourRules]);

  const estimate = useMemo(() => {
    if (segmentType === 'all') return 24800;
    if (allRules.length === 0) return 0;
    let base = 24800;
    allRules.forEach((r) => {
      const factor = 0.45 + ((r.id * 7) % 30) / 100;
      base = Math.floor(base * factor);
    });
    if (combinator === 'OR') base = Math.min(24800, base * Math.max(1, allRules.length));
    return Math.max(12, base);
  }, [allRules, combinator, segmentType]);

  const canSave = name.trim().length >= 2 && (segmentType === 'all' || allRules.length > 0);

  const handleSave = () => {
    if (!canSave) return;
    onSave({ name, description, combinator, rules: allRules });
  };

  const renderPicker = (type: 'property' | 'behaviour') =>
    activePicker === type ? (
      <div className="builder-picker">
        <div className="builder-picker-header">
          <Icon name={type === 'behaviour' ? 'zap' : 'tag'} size={12} color="var(--blue)"/>
          <span>{type === 'behaviour' ? 'Events' : 'Traits'}</span>
        </div>
        <div className="builder-picker-search">
          <Icon name="search" size={12} color="var(--g400)"/>
          <input
            autoFocus
            placeholder={`Search ${type === 'behaviour' ? 'events' : 'traits'}…`}
            value={pickerSearch}
            onChange={e => setPickerSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setActivePicker(null); setPickerSearch(''); } }}
          />
        </div>
        <div className="builder-picker-list">
          {pickerItems.length === 0 ? (
            <div className="builder-picker-empty">
              {pickerSearch
                ? `No ${type === 'behaviour' ? 'events' : 'traits'} match "${pickerSearch}"`
                : `No ${type === 'behaviour' ? 'events' : 'traits'} available`}
            </div>
          ) : pickerItems.map(item => (
            <button
              key={item}
              className="builder-picker-item"
              type="button"
              onClick={() => handlePickerSelect(item)}
            >
              <Icon name={type === 'behaviour' ? 'zap' : 'tag'} size={11} color="var(--g400)"/>
              <span>{toLabel(item)}</span>
              <span className="builder-picker-item-raw">{item}</span>
            </button>
          ))}
        </div>
      </div>
    ) : null;

  return (
    <>
      <div className="modal-body seg-builder-body">

        {/* Audience type toggle */}
        <div className="builder-audience-type">
          <span className="builder-audience-label">Audience</span>
          <div className="seg" style={{ '--cols': 2, padding: 3, width: 248 } as React.CSSProperties}>
            <button
              type="button"
              className={segmentType === 'all' ? 'active' : ''}
              onClick={() => setSegmentType('all')}
            >
              All Users
            </button>
            <button
              type="button"
              className={segmentType === 'filtered' ? 'active' : ''}
              onClick={() => setSegmentType('filtered')}
            >
              Filter Users By
            </button>
          </div>
        </div>

        {/* Filter sections */}
        {segmentType === 'filtered' && (
          <div className="builder-section">
            <div className="builder-filter-sections">

              {/* User Property */}
              <div className="builder-filter-section">
                <div className="builder-filter-section-head">
                  <Icon name="tag" size={13} color="var(--blue)"/>
                  <span>User Property</span>
                  <div className="builder-combinator">
                    <span style={{ fontSize: 11.5, color: 'var(--g500)' }}>Match</span>
                    <div className="seg" style={{ '--cols': 2, padding: 3, width: 132 } as React.CSSProperties}>
                      <button type="button" className={combinator === 'AND' ? 'active' : ''} onClick={() => setCombinator('AND')}>ALL (AND)</button>
                      <button type="button" className={combinator === 'OR' ? 'active' : ''} onClick={() => setCombinator('OR')}>ANY (OR)</button>
                    </div>
                  </div>
                </div>
                <div className="builder-rules">
                  {propertyRules.length === 0 && (
                    <div className="builder-empty">No property filters yet.</div>
                  )}
                  {propertyRules.map((r, i) => (
                    <div key={r.id} className="builder-rule-item">
                      {i > 0 && <span className="builder-join">{combinator}</span>}
                      <RuleEditor
                        rule={r}
                        fields={traitFields.length > 0 ? traitFields : (SEGMENT_FIELDS as SegmentField[]).filter(f => f.type !== 'event')}
                        metaOperators={metaOperators}
                        onChange={(patch) => updatePropertyRule(r.id, patch)}
                        onRemove={() => removePropertyRule(r.id)}
                      />
                    </div>
                  ))}
                </div>
                <div className="builder-add-row" ref={propertyPickerRef}>
                  <button
                    className={'builder-add' + (activePicker === 'property' ? ' active' : '')}
                    type="button"
                    onClick={() => togglePicker('property')}
                  >
                    <Icon name="plus" size={12}/>
                    Add nested filter
                    {metaTraits.length > 0 && <span className="builder-add-count">{metaTraits.length}</span>}
                  </button>
                  {renderPicker('property')}
                </div>
              </div>

              {/* User Behaviour */}
              <div className="builder-filter-section">
                <div className="builder-filter-section-head">
                  <Icon name="zap" size={13} color="var(--amber, #f59e0b)"/>
                  <span>User Behaviour</span>
                  <div className="builder-combinator">
                    <span style={{ fontSize: 11.5, color: 'var(--g500)' }}>Match</span>
                    <div className="seg" style={{ '--cols': 2, padding: 3, width: 132 } as React.CSSProperties}>
                      <button type="button" className={combinator === 'AND' ? 'active' : ''} onClick={() => setCombinator('AND')}>ALL (AND)</button>
                      <button type="button" className={combinator === 'OR' ? 'active' : ''} onClick={() => setCombinator('OR')}>ANY (OR)</button>
                    </div>
                  </div>
                </div>
                <div className="builder-rules">
                  {behaviourRules.length === 0 && (
                    <div className="builder-empty">No behaviour filters yet.</div>
                  )}
                  {behaviourRules.map((r, i) => (
                    <div key={r.id} className="builder-rule-item">
                      {i > 0 && <span className="builder-join">{combinator}</span>}
                      <RuleEditor
                        rule={r}
                        fields={eventFields.length > 0 ? eventFields : (SEGMENT_FIELDS as SegmentField[]).filter(f => f.type === 'event')}
                        metaOperators={metaOperators}
                        onChange={(patch) => updateBehaviourRule(r.id, patch)}
                        onRemove={() => removeBehaviourRule(r.id)}
                      />
                    </div>
                  ))}
                </div>
                <div className="builder-add-row" ref={behaviourPickerRef}>
                  <button
                    className={'builder-add' + (activePicker === 'behaviour' ? ' active' : '')}
                    type="button"
                    onClick={() => togglePicker('behaviour')}
                  >
                    <Icon name="plus" size={12}/>
                    Add nested filter
                    {metaEvents.length > 0 && <span className="builder-add-count">{metaEvents.length}</span>}
                  </button>
                  {renderPicker('behaviour')}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Estimated reach */}
        <div className="builder-preview">
          <div className="builder-preview-num">{estimate.toLocaleString('en-IN')}</div>
          <div className="builder-preview-meta">
            <span className="k">Estimated count</span>
            <span className="v">
              {segmentType === 'all'
                ? '100% of active players · all users'
                : `~${Math.round((estimate / 24800) * 100)}% of active players · ${allRules.length} filter${allRules.length === 1 ? '' : 's'} (${combinator})`}
            </span>
          </div>
          <button className="builder-refresh" type="button" title="Recompute">
            <Icon name="refresh-cw" size={12}/> Preview
          </button>
        </div>

        {/* Name + Description */}
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
