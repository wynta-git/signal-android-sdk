'use client';
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import Icon from '../Icon';
import MultiSelect from '../MultiSelect';
import { SEGMENT_FIELDS, OPS } from '../../services/mocks/segments';
import { useCommonSelector } from '../../store/hooks';
import {
  fetchMetaEventProperties, selectMetaEventProperties,
  fetchTraitOperators, selectMetaTraitOperators,
  fetchDerivedRuleConfig, selectDerivedRuleConfig,
  fetchDerivedRuleParamOperators, selectDerivedRuleParamOps,
} from '../../store/slices/segmentsSlice';
import { selectProjectId } from '../../store/slices/usersSlice';
import type { SegmentRule, SegmentField, SegmentOp, DerivedRuleParameter } from '../../types';
import type { MetaOperators } from '../../services/segmentApi';

function toLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Map backend operator IDs to display labels (used for frequency / trait ops)
const OP_LABELS: Record<string, string> = {
  eq: 'is', neq: 'is not', gt: '>', gte: '≥', lt: '<', lte: '≤',
  in: 'is any of', not_in: 'is none of', contains: 'contains',
  starts_with: 'starts with', exists: 'exists', between: 'between',
};

// User-friendly labels for trait and event-property operators
const PROP_OP_LABELS: Record<string, string> = {
  eq:          'Equals',
  neq:         'Not Equals',
  gt:          'Greater Than',
  gte:         'Greater Than or Equal',
  lt:          'Less Than',
  lte:         'Less Than or Equal',
  between:     'Between',
  contains:    'Contains',
  starts_with: 'Starts With',
  in:          'In',
  not_in:      'Not In',
  exists:      'Exists',
};

function serverOpsToSegmentOps(ops: string[]): SegmentOp[] {
  return ops.map(id => ({ id, label: OP_LABELS[id] ?? id }));
}

/** Friendly-label variant used for trait and event-property operators. */
function toTraitOps(ops: string[]): SegmentOp[] {
  return ops.map(id => ({ id, label: PROP_OP_LABELS[id] ?? OP_LABELS[id] ?? id }));
}

function renderValueInput(
  type: string,
  options: string[] | undefined,
  value: string,
  onChange: (v: string) => void,
) {
  if (type === 'enum' && options?.length) {
    return (
      <select className="rule-value" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (type === 'number' || type === 'integer' || type === 'amount') {
    return (
      <input
        className="rule-value rule-num"
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="value"
      />
    );
  }
  return (
    <input
      className="rule-value"
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="value"
    />
  );
}

// ── DerivedParamRow ───────────────────────────────────────────────────────────
// Renders a single derived-rule parameter input.
// Input type is determined from param.type — no separate operators API needed.

interface DerivedParamRowProps {
  param:    DerivedRuleParameter;
  value:    string;
  onChange: (value: string) => void;
}

function DerivedParamRow({ param, value, onChange }: DerivedParamRowProps) {
  // canonical key: new API uses `key`, older API used `name`
  const paramKey  = param.key ?? param.name;
  const label     = param.label ?? toLabel(paramKey);
  const valueType = param.type ?? 'text';

  return (
    <div className="derived-param-row">
      <span className="derived-param-label">{label}</span>

      {valueType === 'boolean' ? (
        <select className="rule-value" value={value || 'true'} onChange={e => onChange(e.target.value)}>
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      ) : valueType === 'number' || valueType === 'integer' ? (
        <input
          className="rule-value rule-num"
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={label}
        />
      ) : valueType === 'date' || valueType === 'datetime' ? (
        <input
          className="rule-value"
          type="date"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      ) : param.options?.length ? (
        <select className="rule-value" value={value} onChange={e => onChange(e.target.value)}>
          <option value="">— select —</option>
          {param.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          className="rule-value"
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={label}
        />
      )}
    </div>
  );
}

// ── EventPropFilterRow ────────────────────────────────────────────────────────
// Fetches and caches operators for a single event-property combination.
// Kept as a separate component so each where-condition can call hooks unconditionally.

interface EventPropFilterRowProps {
  eventName: string;   // API-normalised event name, e.g. "app_opened"
  propName:  string;   // property name from the properties list, e.g. "from_background"
  op:        string;
  value:     string;
  onChange:  (op: string, value: string) => void;
}

function EventPropFilterRow({ eventName, propName, op, value, onChange }: EventPropFilterRowProps) {
  const dispatch = useDispatch();
  // Re-use the same metaDerivedParamOps cache (same API endpoint)
  const cached = useCommonSelector(selectDerivedRuleParamOps(eventName, propName));

  useEffect(() => {
    if (!cached) {
      dispatch(fetchDerivedRuleParamOperators({ ruleName: eventName, paramName: propName }) as any);
    }
  }, [dispatch, eventName, propName, cached]);

  const operators: SegmentOp[] = cached?.operators?.length
    ? cached.operators.map(id => ({ id, label: PROP_OP_LABELS[id] ?? id }))
    : [];

  const currentOp = op || operators[0]?.id || '';
  const valueType = cached?.type ?? 'text';
  const hideValue = currentOp === 'exists';

  const setOp  = (newOp:  string) => onChange(newOp,  value);
  const setVal = (newVal: string) => onChange(currentOp, newVal);

  return (
    <>
      {/* Operator dropdown — populated from API */}
      <select
        className="rule-op"
        value={currentOp}
        onChange={e => setOp(e.target.value)}
        disabled={operators.length === 0}
      >
        {operators.length === 0
          ? <option value="">Loading…</option>
          : operators.map(o => <option key={o.id} value={o.id}>{o.label}</option>)
        }
      </select>

      {/* Value input — type-aware, hidden for "exists" */}
      {!hideValue && (
        valueType === 'boolean' ? (
          <select className="rule-value" value={value || 'true'} onChange={e => setVal(e.target.value)}>
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        ) : valueType === 'number' || valueType === 'integer' ? (
          <input
            className="rule-value rule-num"
            type="number"
            value={value}
            onChange={e => setVal(e.target.value)}
            placeholder="value"
          />
        ) : valueType === 'date' || valueType === 'datetime' ? (
          <input
            className="rule-value"
            type="date"
            value={value}
            onChange={e => setVal(e.target.value)}
          />
        ) : (
          <input
            className="rule-value"
            type="text"
            value={value}
            onChange={e => setVal(e.target.value)}
            placeholder="value"
          />
        )
      )}
    </>
  );
}

// ── RuleEditor ────────────────────────────────────────────────────────────────

type RuleWithMeta = SegmentRule & {
  id: number;
  unit?: string;
  value2?: string;
  eventProp?: string;
  eventPropOp?: string;
  eventPropValue?: string;
  derivedParams?: Record<string, { op: string; value: string }>;
};

interface RuleEditorProps {
  rule: RuleWithMeta;
  fields?: SegmentField[];
  metaOperators?: MetaOperators | null;
  onChange: (patch: Partial<RuleWithMeta>) => void;
  onRemove: () => void;
  brandId?: number;
}

export default function RuleEditor({ rule, fields, metaOperators, onChange, onRemove, brandId }: RuleEditorProps) {
  const dispatch = useDispatch();
  const projectId = useCommonSelector(selectProjectId) ?? process.env.NEXT_PUBLIC_PROJECT_ID ?? 'proj_demo';
  const allFields = (fields && fields.length > 0 ? fields : SEGMENT_FIELDS) as SegmentField[];
  const opsMap = OPS as Record<string, SegmentOp[]>;

  const field: SegmentField = allFields.find(f => f.id === rule.field) || allFields[0];

  // ── Raw event: properties sub-filter ─────────────────────────────────────
  const eventName = field?.type === 'event' ? field.id.replace(/^event:/, '') : null;
  const eventNameForApi = eventName
    ? eventName.trim().toLowerCase().replace(/[\s-]+/g, '_')
    : null;
  const eventProps = useCommonSelector(selectMetaEventProperties(eventNameForApi ?? ''));

  useEffect(() => {
    /* Skip if data already cached — prevents duplicate calls in Strict Mode */
    if (eventNameForApi && eventProps.length === 0) {
      dispatch(fetchMetaEventProperties({ projectId, eventName: eventNameForApi, brandId }) as any);
    }
  }, [dispatch, eventNameForApi]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Trait: per-trait operators ────────────────────────────────────────────
  const isTrait = field?.type !== 'event' && field?.type !== 'derived';
  const traitName = isTrait ? field?.id : null;
  const traitOps = useCommonSelector(selectMetaTraitOperators(traitName ?? ''));

  useEffect(() => {
    if (traitName && !traitOps) {
      dispatch(fetchTraitOperators({ trait: traitName, brandId }) as any);
    }
  }, [dispatch, traitName, traitOps]);

  // ── Derived rule: config ──────────────────────────────────────────────────
  const isDerived = field?.type === 'derived';
  const derivedRuleName = isDerived ? field.id.replace(/^derived:/, '') : null;
  const derivedConfig = useCommonSelector(selectDerivedRuleConfig(derivedRuleName ?? ''));

  useEffect(() => {
    if (derivedRuleName && !derivedConfig) {
      dispatch(fetchDerivedRuleConfig({ ruleName: derivedRuleName, brandId }) as any);
    }
  }, [dispatch, derivedRuleName, derivedConfig]);

  // ── Operator list for trait/event (not derived) ───────────────────────────
  const ops: SegmentOp[] = (() => {
    if (field?.type === 'event') {
      return metaOperators
        ? serverOpsToSegmentOps(metaOperators.frequency)
        : [{ id: 'gte', label: '≥' }, { id: 'gt', label: '>' }, { id: 'eq', label: 'is' }];
    }
    if (field?.type === 'derived') return [];
    // Trait: API operators take priority, with friendly labels
    if (traitOps?.operators?.length) return toTraitOps(traitOps.operators);
    // Fallbacks for mock field types while API loads
    if (field?.type === 'text')    return metaOperators ? toTraitOps(metaOperators.trait) : [{ id: 'eq', label: 'Equals' }, { id: 'neq', label: 'Not Equals' }, { id: 'contains', label: 'Contains' }];
    if (field?.type === 'recency') return opsMap['recency'];
    if (field?.type === 'enum')    return opsMap['enum'];
    if (field?.type === 'amount')  return toTraitOps(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'exists']);
    if (field?.type === 'number')  return toTraitOps(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'exists']);
    return metaOperators ? toTraitOps(metaOperators.trait) : toTraitOps(['eq', 'neq']);
  })();

  const op: SegmentOp = ops.find(o => o.id === rule.op) || ops[0];

  // ── Effective value-input type for traits ─────────────────────────────────
  // Prefer the type returned by the operators API; fall back to the mock field type
  const effectiveTraitType: string = traitOps?.type ?? field?.type ?? 'text';
  const isNumericTrait = effectiveTraitType === 'number' || effectiveTraitType === 'integer' || effectiveTraitType === 'float' || effectiveTraitType === 'amount';
  const isBooleanTrait = effectiveTraitType === 'boolean';
  const isDateTrait    = effectiveTraitType === 'date'   || effectiveTraitType === 'datetime';

  const onFieldChange = (id: string) => {
    const f = allFields.find(x => x.id === id)!;
    if (!f) return;
    if (f.type === 'derived') {
      onChange({ field: id, op: '', value: '', derivedParams: {} });
      return;
    }
    const fieldOps =
      f.type === 'event'   ? (metaOperators ? serverOpsToSegmentOps(metaOperators.frequency) : [{ id: 'gte', label: '≥' }]) :
      f.type === 'text'    ? (metaOperators ? serverOpsToSegmentOps(metaOperators.trait) : [{ id: 'eq', label: 'is' }]) :
      f.type === 'recency' ? opsMap['recency'] :
      f.type === 'enum'    ? opsMap['enum'] :
      f.type === 'amount'  ? opsMap['amount'] :
      f.type === 'number'  ? opsMap['number'] :
      opsMap['enum'] ?? [];
    const firstOp = fieldOps[0];
    let value: string | string[] = '';
    if (f.type === 'enum')    value = (f.options ?? [])[0] ?? '';
    if (f.type === 'recency') value = '7';
    onChange({ field: id, op: firstOp?.id ?? '', value, eventProp: undefined, eventPropOp: undefined, eventPropValue: undefined, derivedParams: undefined });
  };

  return (
    <div className="builder-rule" style={{ flexWrap: 'wrap', gap: 6 }}>

      {/* ── Derived rule ──────────────────────────────────────────────────── */}
      {isDerived ? (
        <>
          {/* Field selector row */}
          <div className="builder-rule-row">
            <select className="rule-field" value={rule.field} onChange={e => onFieldChange(e.target.value)}>
              {allFields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            <span className="derived-rule-badge">
              <Icon name="git-branch" size={11}/> derived rule
            </span>
            <button className="rule-remove" type="button" onClick={onRemove} aria-label="Remove filter">
              <Icon name="x" size={13}/>
            </button>
          </div>
          {/* Parameters */}
          <div className="derived-params-list">
            {!derivedConfig ? (
              <span className="derived-loading">Loading parameters…</span>
            ) : !Array.isArray(derivedConfig.parameters) || derivedConfig.parameters.length === 0 ? (
              <span className="derived-loading">No parameters defined.</span>
            ) : (
              derivedConfig.parameters.map((param, index) => {
                const paramKey = param.key ?? param.name;
                return (
                  <DerivedParamRow
                    key={paramKey ? `${paramKey}-${index}` : String(index)}
                    param={param}
                    value={rule.derivedParams?.[paramKey]?.value ?? ''}
                    onChange={newVal => onChange({
                      derivedParams: {
                        ...rule.derivedParams,
                        [paramKey]: { op: '', value: newVal },
                      },
                    })}
                  />
                );
              })
            )}
          </div>
        </>
      ) : (
        /* ── Trait / raw-event rule ───────────────────────────────────────── */
        <>
          <div className="builder-rule-row">
            <select className="rule-field" value={rule.field} onChange={e => onFieldChange(e.target.value)}>
              {allFields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>

            <select className="rule-op" value={rule.op} onChange={e => onChange({ op: e.target.value })}>
              {ops.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>

            {/* Value input — op-checked first, then API type-aware */}

            {/* exists: no value field */}
            {op?.id === 'exists' || op?.id === 'EXISTS' ? null

            /* between: From / To */
            : op?.id === 'between' || op?.id === 'BETWEEN' ? (
              <div className="rule-recency">
                <span className="rule-label-sm">From</span>
                <input
                  className="rule-value rule-num"
                  type={isNumericTrait ? 'number' : 'text'}
                  value={String(rule.value || '')}
                  onChange={e => onChange({ value: e.target.value })}
                  placeholder="from"
                />
                <span className="rule-label-sm">To</span>
                <input
                  className="rule-value rule-num"
                  type={isNumericTrait ? 'number' : 'text'}
                  value={rule.value2 || ''}
                  onChange={e => onChange({ value2: e.target.value })}
                  placeholder="to"
                />
              </div>

            /* event: frequency count + time window */
            ) : field?.type === 'event' ? (
              <div className="rule-recency">
                <input className="rule-value rule-num" type="number" min="0" value={String(rule.value || '')} onChange={e => onChange({ value: e.target.value })} placeholder="count"/>
                <span style={{ color: 'var(--g400)', fontSize: 12 }}>last</span>
                <input className="rule-value rule-num" type="number" min="1" value={rule.value2 || ''} onChange={e => onChange({ value2: e.target.value })} placeholder="30"/>
                <span style={{ color: 'var(--g400)', fontSize: 12 }}>days</span>
              </div>

            /* recency: number + unit */
            ) : field?.type === 'recency' ? (
              <div className="rule-recency">
                <input className="rule-value rule-num" type="number" min="1" value={String(rule.value || '')} onChange={e => onChange({ value: e.target.value })}/>
                <select className="rule-unit" value={rule.unit || 'days'} onChange={e => onChange({ unit: e.target.value })}>
                  <option value="days">days</option>
                  <option value="weeks">weeks</option>
                  <option value="months">months</option>
                </select>
              </div>

            /* enum (mock field): multi-select or single select */
            ) : field?.type === 'enum' && (op?.id === 'IN' || op?.id === 'NOT_IN' || op?.id === 'in' || op?.id === 'not_in') ? (
              <MultiSelect
                options={field.options ?? []}
                value={Array.isArray(rule.value) ? rule.value : (rule.value ? [String(rule.value)] : [])}
                onChange={v => onChange({ value: v })}
              />
            ) : field?.type === 'enum' ? (
              <select className="rule-value" value={String(rule.value)} onChange={e => onChange({ value: e.target.value })}>
                {(field.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
              </select>

            /* API type: boolean */
            ) : isBooleanTrait ? (
              <select className="rule-value" value={String(rule.value) || 'true'} onChange={e => onChange({ value: e.target.value })}>
                <option value="true">True</option>
                <option value="false">False</option>
              </select>

            /* API type: date / datetime */
            ) : isDateTrait ? (
              <input
                className="rule-value"
                type="date"
                value={String(rule.value || '')}
                onChange={e => onChange({ value: e.target.value })}
              />

            /* API type: number / integer / amount */
            ) : isNumericTrait ? (
              <input
                className="rule-value rule-num"
                type="number"
                value={String(rule.value || '')}
                onChange={e => onChange({ value: e.target.value })}
                placeholder="value"
              />

            /* Default: text input */
            ) : (
              <input
                className="rule-value"
                type="text"
                value={String(rule.value || '')}
                onChange={e => onChange({ value: e.target.value })}
                placeholder="value"
              />
            )}

            <button className="rule-remove" type="button" onClick={onRemove} aria-label="Remove filter">
              <Icon name="x" size={13}/>
            </button>
          </div>

          {/* Event property where-condition (raw events only) */}
          {field?.type === 'event' && eventProps.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingLeft: 12, width: '100%' }}>
              <span style={{ fontSize: 11, color: 'var(--g400)' }}>where</span>

              {/* Property dropdown — labels from API, value stays as snake_case key */}
              <select
                className="rule-field"
                value={rule.eventProp || ''}
                onChange={e => onChange({
                  eventProp:      e.target.value,
                  eventPropOp:    undefined,   // reset so EventPropFilterRow defaults to first op
                  eventPropValue: undefined,
                })}
              >
                <option value="">— any property —</option>
                {eventProps.map(p => (
                  <option key={p} value={p}>{toLabel(p)}</option>
                ))}
              </select>

              {/* Operator + value — fully API-driven via EventPropFilterRow */}
              {rule.eventProp && eventNameForApi && (
                <EventPropFilterRow
                  eventName={eventNameForApi}
                  propName={rule.eventProp}
                  op={rule.eventPropOp ?? ''}
                  value={rule.eventPropValue ?? ''}
                  onChange={(newOp, newVal) =>
                    onChange({ eventPropOp: newOp, eventPropValue: newVal })
                  }
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
