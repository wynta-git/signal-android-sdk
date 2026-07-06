'use client';
import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDispatch } from 'react-redux';
import Icon from '../Icon';
import RuleEditor from './RuleEditor';
import { useCommonSelector } from '../../store/hooks';
import {
  fetchMetaTraits, fetchMetaEvents, fetchMetaOperators,
  selectMetaTraits, selectMetaEvents, selectMetaOperators,
  evaluateSegment,
} from '../../store/slices/segmentsSlice';
import { selectProjectId } from '../../store/slices/usersSlice';
import { SEGMENT_FIELDS, OPS } from '../../services/mocks/segments';
import { previewEvaluate } from '../../services/segmentApi';
import type { SegmentRule, SegmentField, MetaEventItem } from '../../types';

function toLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const PICKER_MARGIN = 6;

/** Open the picker below its trigger, unless there isn't room — then flip it above. */
function computePickerPos(r: DOMRect, pickerHeight: number): { top: number; left: number } {
  const spaceBelow = window.innerHeight - r.bottom;
  const spaceAbove = r.top;
  const fitsBelow  = spaceBelow >= pickerHeight + PICKER_MARGIN;
  const openAbove  = !fitsBelow && spaceAbove > spaceBelow;
  const top = openAbove
    ? Math.max(PICKER_MARGIN, r.top - pickerHeight - PICKER_MARGIN)
    : r.bottom + PICKER_MARGIN;
  return { top, left: r.left };
}

function buildSplitFields(
  traits: string[],
  events: MetaEventItem[],
): { traitFields: SegmentField[]; eventFields: SegmentField[] } {
  const knownMap = Object.fromEntries(SEGMENT_FIELDS.map(f => [f.id, f]));
  const traitFields: SegmentField[] = traits.map(t =>
    knownMap[t] ?? { id: t, label: toLabel(t), type: 'text' as const }
  );
  const eventFields: SegmentField[] = events.map((e): SegmentField => ({
    id: e.source === 'derived_rule' ? `derived:${e.id}` : `event:${e.id}`,
    label: e.label,
    type: e.source === 'derived_rule' ? 'derived' as const : 'event' as const,
  }));
  return { traitFields, eventFields };
}

export interface RuleWithMeta extends SegmentRule {
  id: number;
  unit?: string;
  value2?: string;
  eventProp?: string;
  eventPropOp?: string;
  eventPropValue?: string;
  derivedParams?: Record<string, { op: string; value: string }>;
}

export interface SegmentBuilderInitialValues {
  name: string;
  description: string;
  combinator: 'AND' | 'OR';
  propertyRules: RuleWithMeta[];
  behaviourRules: RuleWithMeta[];
  nextId: number;
}

type ActivePicker  = 'property' | 'behaviour' | null;

interface SegmentBuilderProps {
  onCancel: () => void;
  onSave: (data: {
    name:          string;
    description:   string;
    combinator:    'AND' | 'OR';
    rules:         SegmentRule[];
    segmentType?:  'filter' | 'custom';
    csvFile?:      File;
  }) => void;
  mode?:         'create' | 'edit';
  segmentId?:    string;   // used in edit mode to call evaluate API
  initialValues?: SegmentBuilderInitialValues;
  brandId?:      number;
}

export default function SegmentBuilder({ onCancel, onSave, mode = 'create', segmentId, initialValues, brandId }: SegmentBuilderProps) {
  const [name, setName]               = useState(() => initialValues?.name        ?? '');
  const [description, setDescription] = useState(() => initialValues?.description ?? '');
  const [combinator, setCombinator]   = useState<'AND' | 'OR'>(() => initialValues?.combinator ?? 'AND');
  const [propertyRules, setPropertyRules]   = useState<RuleWithMeta[]>(() => initialValues?.propertyRules  ?? []);
  const [behaviourRules, setBehaviourRules] = useState<RuleWithMeta[]>(() => initialValues?.behaviourRules ?? []);
  const [nextId, setNextId]           = useState(() => initialValues?.nextId ?? 1);
  const [activePicker, setActivePicker]       = useState<ActivePicker>(null);
  const [pickerSearch, setPickerSearch]       = useState('');
  const [previewCount, setPreviewCount]       = useState<number | null>(null);
  const [previewing, setPreviewing]           = useState(false);
  const [segmentMode, setSegmentMode]         = useState<'filter' | 'custom'>('filter');
  const [csvFile, setCsvFile]                 = useState<File | null>(null);
  const [behaviourExpanded, setBehaviourExpanded] = useState(true);
  const [propertyExpanded, setPropertyExpanded]   = useState(true);
  const propertyPickerRef  = useRef<HTMLButtonElement>(null);
  const behaviourPickerRef = useRef<HTMLButtonElement>(null);
  const pickerRef          = useRef<HTMLDivElement>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);
  const [nameError, setNameError]   = useState(false);
  const [rulesError, setRulesError] = useState(false);
  const [csvError, setCsvError]     = useState(false);
  const nameInputRef   = useRef<HTMLInputElement>(null);
  const filterSectionsRef = useRef<HTMLDivElement>(null);
  const csvUploadRef   = useRef<HTMLDivElement>(null);
  const dispatch      = useDispatch();
  const projectId     = useCommonSelector(selectProjectId) ?? process.env.NEXT_PUBLIC_PROJECT_ID ?? 'proj_demo';
  const metaTraits    = useCommonSelector(selectMetaTraits);
  const metaEvents    = useCommonSelector(selectMetaEvents);   // MetaEventItem[]
  const metaOperators = useCommonSelector(selectMetaOperators);

  useEffect(() => {
    dispatch(fetchMetaTraits(brandId) as any);
    dispatch(fetchMetaEvents({ projectId, brandId }) as any);
    dispatch(fetchMetaOperators() as any);
  }, [dispatch, projectId, brandId]);

  useEffect(() => {
    if (!activePicker) return;
    const onDown = (e: MouseEvent) => {
      const btnRef = activePicker === 'property' ? propertyPickerRef : behaviourPickerRef;
      const inBtn    = btnRef.current?.contains(e.target as Node);
      const inPicker = pickerRef.current?.contains(e.target as Node);
      if (!inBtn && !inPicker) {
        setActivePicker(null);
        setPickerSearch('');
        setPickerPos(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [activePicker]);

  // The picker is portaled to <body> with position:fixed, computed once from the
  // trigger button's rect at open time. If the page (or any scrollable ancestor)
  // scrolls afterward, the button moves but the portal doesn't — they visually
  // separate. Re-track the button on scroll/resize so the picker stays glued to
  // it. Scrolls that originate inside the picker's own item list are ignored so
  // browsing the list doesn't fight with this.
  useEffect(() => {
    if (!activePicker) return;
    const btnRef = activePicker === 'property' ? propertyPickerRef : behaviourPickerRef;
    const reposition = (e: Event) => {
      if (pickerRef.current && e.target instanceof Node && pickerRef.current.contains(e.target as Node)) return;
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      const height = pickerRef.current?.getBoundingClientRect().height ?? 0;
      setPickerPos(computePickerPos(r, height));
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [activePicker]);

  // The initial position (set in togglePicker) always opens below, since the
  // picker's real height isn't known until it has actually rendered — its
  // content varies (empty state vs a long list). Once mounted, measure it and
  // flip above the trigger if there isn't room below, for both pickers.
  useLayoutEffect(() => {
    if (!activePicker || !pickerRef.current) return;
    const btnRef = activePicker === 'property' ? propertyPickerRef : behaviourPickerRef;
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const height = pickerRef.current.getBoundingClientRect().height;
    const next = computePickerPos(r, height);
    setPickerPos(prev => (prev && prev.top === next.top && prev.left === next.left) ? prev : next);
  }, [activePicker]);

  const { traitFields, eventFields } = useMemo(() => {
    const safeTraits = Array.isArray(metaTraits) ? metaTraits : [];
    const safeEvents = Array.isArray(metaEvents) ? metaEvents : [];
    if (safeTraits.length > 0 || safeEvents.length > 0) {
      return buildSplitFields(safeTraits, safeEvents);
    }
    const fallbackTraits = (SEGMENT_FIELDS as SegmentField[]).filter(f => f.type !== 'event');
    return { traitFields: fallbackTraits, eventFields: [] };
  }, [metaTraits, metaEvents]);

  // Strip both event: and derived: prefixes to get the raw name for dedup
  const usedBehaviourKeys = useMemo(
    () => new Set(behaviourRules.map(r => r.field.replace(/^(event:|derived:)/, ''))),
    [behaviourRules]
  );
  const usedPropertyKeys = useMemo(
    () => new Set(propertyRules.map(r => r.field)),
    [propertyRules]
  );

  // Separate picker lists so each can be typed correctly
  const behaviourPickerItems = useMemo((): MetaEventItem[] => {
    const safe = Array.isArray(metaEvents) ? metaEvents : [];
    const q = pickerSearch.trim().toLowerCase();
    const available = safe.filter(e => !usedBehaviourKeys.has(e.id));
    return q
      ? available.filter(e => e.id.toLowerCase().includes(q) || e.label.toLowerCase().includes(q))
      : available;
  }, [pickerSearch, metaEvents, usedBehaviourKeys]);

  const propertyPickerItems = useMemo((): string[] => {
    const safe = Array.isArray(metaTraits) ? metaTraits : [];
    const q = pickerSearch.trim().toLowerCase();
    const available = safe.filter(t => !usedPropertyKeys.has(t));
    return q ? available.filter(t => t.toLowerCase().includes(q)) : available;
  }, [pickerSearch, metaTraits, usedPropertyKeys]);

  const togglePicker = (mode: 'property' | 'behaviour') => {
    if (activePicker === mode) {
      setActivePicker(null);
      setPickerSearch('');
      setPickerPos(null);
      return;
    }
    const btnRef = mode === 'behaviour' ? behaviourPickerRef : propertyPickerRef;
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPickerPos({ top: r.bottom + 6, left: r.left });
    }
    setActivePicker(mode);
    setPickerSearch('');
  };

  const handlePickerSelect = (itemId: string) => {
    const opsMap = OPS as Record<string, { id: string; label: string }[]>;
    let fieldId: string;
    let firstOp: string;

    if (activePicker === 'behaviour') {
      const eventItem = metaEvents.find(e => e.id === itemId);
      if (eventItem?.source === 'derived_rule') {
        fieldId = `derived:${itemId}`;
        firstOp = ''; // derived rules use per-parameter ops
      } else {
        fieldId = `event:${itemId}`;
        firstOp = (opsMap['event'] ?? [{ id: 'gte', label: '≥' }])[0]?.id ?? 'gte';
      }
    } else {
      fieldId = itemId;
      const knownField = (SEGMENT_FIELDS as SegmentField[]).find(f => f.id === itemId);
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

  // Clear each error as soon as its own condition is satisfied, so it doesn't
  // linger after the user fixes it but before they hit Submit again.
  useEffect(() => { if (name.trim().length >= 2) setNameError(false); }, [name]);
  useEffect(() => { if (allRules.length > 0) setRulesError(false); }, [allRules.length]);
  useEffect(() => { if (csvFile !== null) setCsvError(false); }, [csvFile]);

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      if (mode === 'edit' && segmentId) {
        /* In edit mode call the segment evaluate endpoint for accurate count */
        const result = await dispatch(evaluateSegment(segmentId) as any).unwrap();
        setPreviewCount(result.size);
      } else {
        if (allRules.length === 0) { setPreviewing(false); return; }
        const result = await previewEvaluate({ combinator, rules: allRules });
        setPreviewCount(result.size);
      }
    } catch {
      // keep previous count on error
    } finally {
      setPreviewing(false);
    }
  };

  /* Auto-trigger evaluate when segment opens in edit mode */
  useEffect(() => {
    if (mode === 'edit' && segmentId && previewCount === null && !previewing) {
      handlePreview();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, segmentId]);

  const handleSave = () => {
    const nameInvalid  = name.trim().length < 2;
    const rulesInvalid = segmentMode === 'filter' && allRules.length === 0;
    const csvInvalid   = segmentMode === 'custom' && csvFile === null;

    setNameError(nameInvalid);
    setRulesError(rulesInvalid);
    setCsvError(csvInvalid);

    if (nameInvalid) {
      nameInputRef.current?.focus();
      nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (rulesInvalid) {
      setBehaviourExpanded(true);
      setPropertyExpanded(true);
      filterSectionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (csvInvalid) {
      csvUploadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    onSave({
      name, description, combinator,
      rules:        segmentMode === 'filter' ? allRules : [],
      segmentType:  segmentMode,
      csvFile:      segmentMode === 'custom' ? (csvFile ?? undefined) : undefined,
    });
  };

  const renderPicker = (type: 'property' | 'behaviour') => {
    if (activePicker !== type || !pickerPos) return null;
    return createPortal(
      <div
        ref={pickerRef}
        className="builder-picker"
        style={{ position: 'fixed', top: pickerPos.top, left: pickerPos.left, zIndex: 9999 }}
      >
        <div className="builder-picker-header">
          <Icon name={type === 'behaviour' ? 'zap' : 'tag'} size={12} color="var(--blue)"/>
          <span>{type === 'behaviour' ? 'Events & Rules' : 'Traits'}</span>
          <button
            type="button"
            className="builder-picker-close"
            onClick={() => { setActivePicker(null); setPickerSearch(''); setPickerPos(null); }}
            aria-label="Close"
          >
            <Icon name="x" size={13}/>
          </button>
        </div>
        <div className="builder-picker-search">
          <Icon name="search" size={12} color="var(--g400)"/>
          <input
            autoFocus
            placeholder={`Search ${type === 'behaviour' ? 'events & rules' : 'traits'}…`}
            value={pickerSearch}
            onChange={e => setPickerSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setActivePicker(null); setPickerSearch(''); setPickerPos(null); } }}
          />
        </div>
        <div className="builder-picker-list">
          {type === 'behaviour' ? (
            behaviourPickerItems.length === 0 ? (
              <div className="builder-picker-empty">
                {pickerSearch
                  ? `No events match "${pickerSearch}"`
                  : 'No events available'}
              </div>
            ) : behaviourPickerItems.map(item => (
              <button
                key={item.id}
                className="builder-picker-item"
                type="button"
                onClick={() => handlePickerSelect(item.id)}
              >
                <Icon
                  name={item.source === 'derived_rule' ? 'git-branch' : 'zap'}
                  size={11}
                  color={item.source === 'derived_rule' ? 'var(--amber, #f59e0b)' : 'var(--g400)'}
                />
                <span>{item.label}</span>
                {item.source === 'derived_rule' && (
                  <span className="picker-source-badge picker-source-badge--derived">derived</span>
                )}
              </button>
            ))
          ) : (
            propertyPickerItems.length === 0 ? (
              <div className="builder-picker-empty">
                {pickerSearch
                  ? `No traits match "${pickerSearch}"`
                  : 'No traits available'}
              </div>
            ) : propertyPickerItems.map(item => (
              <button
                key={item}
                className="builder-picker-item"
                type="button"
                onClick={() => handlePickerSelect(item)}
              >
                <Icon name="tag" size={11} color="var(--g400)"/>
                <span>{toLabel(item)}</span>
              </button>
            ))
          )}
        </div>
      </div>,
      document.body,
    );
  };

  return (
    <>
      <div className="modal-body seg-builder-body">

        {/* Segment name */}
        <div className="field-group seg-name-field">
          <label>Segment name <span className="cwiz-req">*</span></label>
          <input
            ref={nameInputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. High LTV — no recent bonus"
            style={nameError ? { borderColor: 'var(--crm-negative, #D64545)', boxShadow: '0 0 0 1px var(--crm-negative, #D64545)' } : undefined}
          />
          {nameError && <span className="cwiz-field-error">Segment name must be at least 2 characters.</span>}
        </div>

        {/* Segment type toggle — only for create mode */}
        {mode === 'create' && (
          <div className="seg-type-toggle">
            <button
              type="button"
              className={'seg-type-btn' + (segmentMode === 'filter' ? ' active' : '')}
              onClick={() => { setSegmentMode('filter'); setCsvFile(null); setCsvError(false); }}
            >
              <Icon name="filter" size={13} /> Filters
            </button>
            <button
              type="button"
              className={'seg-type-btn' + (segmentMode === 'custom' ? ' active' : '')}
              onClick={() => { setSegmentMode('custom'); setRulesError(false); }}
            >
              <Icon name="upload" size={13} /> CSV Import
            </button>
          </div>
        )}

        {/* CSV Upload — shown when CSV Import is selected */}
        {segmentMode === 'custom' && (
          <>
            {/* Sample CSV download link */}
            <div className="seg-csv-sample-row">
              <span className="seg-csv-sample-hint">
                Upload a CSV with a <code>user_id</code> column.
              </span>
              <button
                type="button"
                className="seg-csv-sample-btn"
                onClick={() => {
                  const csv = 'user_id\nuser_001\nuser_002\nuser_003';
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url  = URL.createObjectURL(blob);
                  const a    = document.createElement('a');
                  a.href     = url;
                  a.download = 'sample_segment.csv';
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Icon name="download" size={13} /> Download Sample CSV
              </button>
            </div>

            <div
              className="seg-csv-upload"
              ref={csvUploadRef}
              style={csvError ? { borderColor: 'var(--crm-negative, #D64545)' } : undefined}
            >
              <label className="seg-csv-label" htmlFor="seg-csv-input">
                <Icon name="file-text" size={28} color="var(--g400)" />
                <span className="seg-csv-hint">
                  {csvFile ? csvFile.name : 'Click to select a .csv file'}
                </span>
                {csvFile && (
                  <span className="seg-csv-meta">
                    {(csvFile.size / 1024).toFixed(1)} KB
                  </span>
                )}
              </label>
              <input
                id="seg-csv-input"
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={e => {
                const f = e.target.files?.[0] ?? null;
                setCsvFile(f);
                if (f && !name.trim()) {
                  setName(f.name.replace(/\.csv$/i, '').replace(/[_-]+/g, ' ').trim());
                }
              }}
              />
              {csvFile && (
                <button
                  type="button"
                  className="seg-csv-clear"
                  onClick={() => setCsvFile(null)}
                  aria-label="Remove file"
                >
                  <Icon name="x" size={13} /> Remove
                </button>
              )}
            </div>
            {csvError && <span className="cwiz-field-error">Select a CSV file before submitting.</span>}
          </>
        )}

        {/* Filter sections — hidden when CSV Import is selected */}
        {segmentMode === 'filter' && <div className="builder-section">
            <div
              className="builder-filter-sections"
              ref={filterSectionsRef}
              style={rulesError ? { outline: '1px solid var(--crm-negative, #D64545)', borderRadius: 'var(--rl)' } : undefined}
            >

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
                            brandId={brandId}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="builder-add-row">
                      <button
                        ref={behaviourPickerRef}
                        className={'builder-add' + (activePicker === 'behaviour' ? ' active' : '')}
                        type="button"
                        onClick={() => togglePicker('behaviour')}
                      >
                        <Icon name="plus" size={12}/>
                        Add Condition
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
                            brandId={brandId}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="builder-add-row">
                      <button
                        ref={propertyPickerRef}
                        className={'builder-add' + (activePicker === 'property' ? ' active' : '')}
                        type="button"
                        onClick={() => togglePicker('property')}
                      >
                        <Icon name="plus" size={12}/>
                        Add Condition
                        {metaTraits.length > 0 && <span className="builder-add-count">{metaTraits.length}</span>}
                      </button>
                      {renderPicker('property')}
                    </div>
                  </>
                )}
              </div>

            </div>
            {rulesError && <span className="cwiz-field-error">Add at least one condition before submitting.</span>}
          </div>}

        {/* Estimated count — visible in edit mode only */}
        {mode === 'edit' && (
          <div className="builder-preview">
            <div className="builder-preview-num">
              {previewing
                ? '…'
                : previewCount !== null
                  ? previewCount.toLocaleString('en-IN')
                  : '—'}
            </div>
            <div className="builder-preview-meta">
              <span className="k">Estimated count</span>
              <span className="v">
                {previewing
                  ? 'Computing…'
                  : previewCount !== null
                    ? 'Segment members · live count'
                    : 'Click Preview to compute'}
              </span>
            </div>
            <button
              className="builder-refresh"
              type="button"
              title="Recompute"
              onClick={handlePreview}
              disabled={previewing}
            >
              <Icon name="refresh-cw" size={12}/> {previewing ? 'Loading…' : 'Preview'}
            </button>
          </div>
        )}

        {/* Info banner */}
        <div className="asm-banner">
          <Icon name="refresh-cw" size={13} color="#0073B2" />
          <span>
            This segment re-evaluates its conditions each time the campaign runs,
            rather than locking in a fixed list of players.
          </span>
        </div>

      </div>

      <div className="modal-footer-row builder-footer">
        {mode === 'create' && (
          <button className="btn btn-ghost btn-sm" type="button" onClick={onCancel}>
            <Icon name="arrow-left" size={12}/> Back to browse
          </button>
        )}
        <div style={{ flex: 1 }}/>
        <button className="btn btn-secondary btn-sm" type="button" onClick={onCancel}>Cancel</button>
        <button
          className="btn btn-primary btn-sm"
          type="button"
          onClick={handleSave}
          style={{ letterSpacing: 0.5, fontWeight: 700, gap: 6, paddingRight: 14 }}
        >
          {mode === 'edit' ? 'UPDATE' : 'SUBMIT'}
          <span style={{ fontSize: 15, lineHeight: 1, letterSpacing: -1 }}>»</span>
        </button>
      </div>
    </>
  );
}
