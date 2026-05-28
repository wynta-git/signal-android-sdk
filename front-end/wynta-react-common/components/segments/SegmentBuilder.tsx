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
import { previewEvaluate } from '../../services/segmentApi';
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

type ActivePicker  = 'property' | 'behaviour' | null;

interface SegmentBuilderProps {
  onCancel: () => void;
  onSave: (data: { name: string; description: string; combinator: 'AND' | 'OR'; rules: SegmentRule[] }) => void;
}

export default function SegmentBuilder({ onCancel, onSave }: SegmentBuilderProps) {
  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const combinator: 'AND' | 'OR'      = 'AND';
  const [propertyRules, setPropertyRules]     = useState<RuleWithMeta[]>([]);
  const [behaviourRules, setBehaviourRules]   = useState<RuleWithMeta[]>([]);
  const [nextId, setNextId]           = useState(1);
  const [activePicker, setActivePicker]       = useState<ActivePicker>(null);
  const [pickerSearch, setPickerSearch]       = useState('');
  const [previewCount, setPreviewCount]       = useState<number | null>(null);
  const [previewing, setPreviewing]           = useState(false);
  const [behaviourExpanded, setBehaviourExpanded] = useState(false);
  const [propertyExpanded, setPropertyExpanded]   = useState(false);
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

  const usedBehaviourKeys = useMemo(
    () => new Set(behaviourRules.map(r => r.field.replace(/^event:/, ''))),
    [behaviourRules]
  );
  const usedPropertyKeys = useMemo(
    () => new Set(propertyRules.map(r => r.field)),
    [propertyRules]
  );

  const pickerItems = useMemo(() => {
    const items = activePicker === 'behaviour' ? metaEvents : metaTraits;
    const used  = activePicker === 'behaviour' ? usedBehaviourKeys : usedPropertyKeys;
    const q = pickerSearch.trim().toLowerCase();
    const available = items.filter(i => !used.has(i));
    return q ? available.filter(i => i.toLowerCase().includes(q)) : available;
  }, [activePicker, pickerSearch, metaTraits, metaEvents, usedBehaviourKeys, usedPropertyKeys]);

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

  useEffect(() => { setPreviewCount(null); }, [allRules, combinator]);

  const estimate = useMemo(() => {

    if (allRules.length === 0) return 0;
    let base = 24800;
    allRules.forEach((r) => {
      const factor = 0.45 + ((r.id * 7) % 30) / 100;
      base = Math.floor(base * factor);
    });
    if (combinator === 'OR') base = Math.min(24800, base * Math.max(1, allRules.length));
    return Math.max(12, base);
  }, [allRules, combinator]);

  const canSave = name.trim().length >= 2 && allRules.length > 0;

  const handlePreview = async () => {
    if (allRules.length === 0) return;
    setPreviewing(true);
    try {
      const result = await previewEvaluate({ combinator, rules: allRules });
      setPreviewCount(result.size);
    } catch {
      // keep previous count on error
    } finally {
      setPreviewing(false);
    }
  };

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

        {/* Filter sections */}
        <div className="builder-section">
            <div className="builder-filter-sections">

              {/* User Behaviour */}
              <div className={'builder-filter-section' + (!behaviourExpanded ? ' collapsed' : '')}>
                <div className="builder-filter-section-head" onClick={() => setBehaviourExpanded(v => !v)} style={{ cursor: 'pointer' }}>
                  <Icon name="zap" size={13} color="var(--amber, #f59e0b)"/>
                  <span>User Behaviour</span>
                  {behaviourRules.length > 0 && <span className="builder-add-count" style={{ background: 'var(--g400)' }}>{behaviourRules.length}</span>}
                  <Icon name={behaviourExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="var(--g400)"/>
                </div>
                {behaviourExpanded && (
                  <>
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
                  </>
                )}
              </div>

              {/* User Property */}
              <div className={'builder-filter-section' + (!propertyExpanded ? ' collapsed' : '')}>
                <div className="builder-filter-section-head" onClick={() => setPropertyExpanded(v => !v)} style={{ cursor: 'pointer' }}>
                  <Icon name="tag" size={13} color="var(--blue)"/>
                  <span>User Property</span>
                  {propertyRules.length > 0 && <span className="builder-add-count" style={{ background: 'var(--g400)' }}>{propertyRules.length}</span>}
                  <Icon name={propertyExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="var(--g400)"/>
                </div>
                {propertyExpanded && (
                  <>
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
                  </>
                )}
              </div>

            </div>
          </div>

        {/* Estimated count */}
        <div className="builder-preview">
          <div className="builder-preview-num">
            {previewing ? '…' : (previewCount ?? 0).toLocaleString('en-IN')}
          </div>
          <div className="builder-preview-meta">
            <span className="k">Estimated count</span>
            <span className="v">
              {previewing
                ? 'Computing…'
                : previewCount !== null
                  ? `${allRules.length} filter${allRules.length === 1 ? '' : 's'} (${combinator}) · live count`
                  : 'Click Preview to compute'}
            </span>
          </div>
          <button
            className="builder-refresh"
            type="button"
            title="Recompute"
            onClick={handlePreview}
            disabled={previewing || allRules.length === 0}
          >
            <Icon name="refresh-cw" size={12}/> {previewing ? 'Loading…' : 'Preview'}
          </button>
        </div>

        {/* Segment name */}
        <div className="field-group" style={{ marginBottom: 0 }}>
          <label>Segment name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. High LTV — Maharashtra, no recent bonus"/>
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
