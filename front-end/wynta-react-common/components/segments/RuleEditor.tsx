'use client';
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import Icon from '../Icon';
import MultiSelect from '../MultiSelect';
import { SEGMENT_FIELDS, OPS } from '../../services/mocks/segments';
import { useCommonSelector } from '../../store/hooks';
import { fetchMetaEventProperties, selectMetaEventProperties } from '../../store/slices/segmentsSlice';
import type { SegmentRule, SegmentField, SegmentOp } from '../../types';
import type { MetaOperators } from '../../services/segmentApi';

const PROJECT_ID = process.env.NEXT_PUBLIC_PROJECT_ID ?? 'proj_demo';

// Map backend operator IDs to display labels
const OP_LABELS: Record<string, string> = {
  eq: 'is', neq: 'is not', gt: '>', gte: '≥', lt: '<', lte: '≤',
  in: 'is any of', not_in: 'is none of', contains: 'contains',
  starts_with: 'starts with', exists: 'exists',
};

function serverOpsToSegmentOps(ops: string[]): SegmentOp[] {
  return ops.map(id => ({ id, label: OP_LABELS[id] ?? id }));
}

interface RuleEditorProps {
  rule: SegmentRule & { id: number; unit?: string; value2?: string; eventProp?: string; eventPropOp?: string; eventPropValue?: string };
  fields?: SegmentField[];
  metaOperators?: MetaOperators | null;
  onChange: (patch: Partial<SegmentRule & { unit?: string; value2?: string; eventProp?: string; eventPropOp?: string; eventPropValue?: string }>) => void;
  onRemove: () => void;
}

export default function RuleEditor({ rule, fields, metaOperators, onChange, onRemove }: RuleEditorProps) {
  const dispatch = useDispatch();
  const allFields = (fields && fields.length > 0 ? fields : SEGMENT_FIELDS) as SegmentField[];
  const opsMap = OPS as Record<string, SegmentOp[]>;

  const field: SegmentField = allFields.find(f => f.id === rule.field) || allFields[0];

  // For event fields, strip the 'event:' prefix to get the real event name
  const eventName = field?.type === 'event' ? field.id.replace(/^event:/, '') : null;
  const eventProps = useCommonSelector(selectMetaEventProperties(eventName ?? ''));

  // Fetch event properties when an event field is selected
  useEffect(() => {
    if (eventName) {
      dispatch(fetchMetaEventProperties({ projectId: PROJECT_ID, eventName }) as any);
    }
  }, [dispatch, eventName]);

  // Determine ops: use server operators if available, else fall back to mock OPS
  const ops: SegmentOp[] =
    field?.type === 'event'   ? (metaOperators ? serverOpsToSegmentOps(metaOperators.frequency) : [{ id: 'gte', label: '≥' }, { id: 'gt', label: '>' }, { id: 'eq', label: 'is' }]) :
    field?.type === 'text'    ? (metaOperators ? serverOpsToSegmentOps(metaOperators.trait) : [{ id: 'eq', label: 'is' }, { id: 'neq', label: 'is not' }, { id: 'contains', label: 'contains' }]) :
    field?.type === 'recency' ? opsMap['recency'] :
    field?.type === 'enum'    ? opsMap['enum'] :
    field?.type === 'amount'  ? opsMap['amount'] :
    field?.type === 'number'  ? opsMap['number'] :
    metaOperators             ? serverOpsToSegmentOps(metaOperators.trait) :
    opsMap['enum'] ?? [];

  const op: SegmentOp = ops.find(o => o.id === rule.op) || ops[0];

  const onFieldChange = (id: string) => {
    const f = allFields.find(x => x.id === id)!;
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
    onChange({ field: id, op: firstOp?.id ?? '', value, eventProp: undefined, eventPropOp: undefined, eventPropValue: undefined });
  };

  return (
    <div className="builder-rule" style={{ flexWrap: 'wrap', gap: 6 }}>
      {/* Row 1: field + op + value */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>
        <select className="rule-field" value={rule.field} onChange={(e) => onFieldChange(e.target.value)}>
          {allFields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>

        <select className="rule-op" value={rule.op} onChange={(e) => onChange({ op: e.target.value })}>
          {ops.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>

        {field?.type === 'enum' && (op.id === 'IN' || op.id === 'NOT_IN' || op.id === 'in' || op.id === 'not_in') ? (
          <MultiSelect
            options={field.options ?? []}
            value={Array.isArray(rule.value) ? rule.value : (rule.value ? [String(rule.value)] : [])}
            onChange={(v) => onChange({ value: v })}
          />
        ) : field?.type === 'enum' ? (
          <select className="rule-value" value={String(rule.value)} onChange={(e) => onChange({ value: e.target.value })}>
            {(field.options ?? []).map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : field?.type === 'recency' ? (
          <div className="rule-recency">
            <input className="rule-value rule-num" type="number" min="1" value={String(rule.value || '')} onChange={(e) => onChange({ value: e.target.value })}/>
            <select className="rule-unit" value={rule.unit || 'days'} onChange={(e) => onChange({ unit: e.target.value })}>
              <option value="days">days</option>
              <option value="weeks">weeks</option>
              <option value="months">months</option>
            </select>
          </div>
        ) : field?.type === 'event' ? (
          <div className="rule-recency">
            <input className="rule-value rule-num" type="number" min="0" value={String(rule.value || '')} onChange={(e) => onChange({ value: e.target.value })} placeholder="count"/>
            <span style={{ color: 'var(--g400)', fontSize: 12 }}>times in last</span>
            <input className="rule-value rule-num" type="number" min="1" value={rule.value2 || ''} onChange={(e) => onChange({ value2: e.target.value })} placeholder="30"/>
            <span style={{ color: 'var(--g400)', fontSize: 12 }}>days</span>
          </div>
        ) : op.id === 'BETWEEN' || op.id === 'between' ? (
          <div className="rule-recency">
            <input className="rule-value rule-num" value={String(rule.value || '')} onChange={(e) => onChange({ value: e.target.value })} placeholder="min"/>
            <span style={{ color: 'var(--g400)', fontSize: 12 }}>and</span>
            <input className="rule-value rule-num" value={rule.value2 || ''} onChange={(e) => onChange({ value2: e.target.value })} placeholder="max"/>
          </div>
        ) : op.id === 'exists' || op.id === 'EXISTS' ? (
          null
        ) : (
          <input className="rule-value" value={String(rule.value || '')} onChange={(e) => onChange({ value: e.target.value })} placeholder={field?.type === 'amount' ? '₹ amount' : 'value'}/>
        )}

        <button className="rule-remove" type="button" onClick={onRemove} aria-label="Remove filter">
          <Icon name="x" size={13}/>
        </button>
      </div>

      {/* Row 2: event property sub-filter (only for event fields with properties loaded) */}
      {field?.type === 'event' && eventProps.length > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', paddingLeft: 12, width: '100%' }}>
          <span style={{ fontSize: 11, color: 'var(--g400)' }}>where</span>
          <select
            className="rule-field"
            value={rule.eventProp || ''}
            onChange={(e) => onChange({ eventProp: e.target.value })}
          >
            <option value="">— any property —</option>
            {eventProps.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {rule.eventProp && (
            <>
              <select
                className="rule-op"
                value={rule.eventPropOp || 'eq'}
                onChange={(e) => onChange({ eventPropOp: e.target.value })}
              >
                {(metaOperators ? serverOpsToSegmentOps(metaOperators.property) : [{ id: 'eq', label: 'is' }, { id: 'gt', label: '>' }, { id: 'lt', label: '<' }])
                  .map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              {rule.eventPropOp !== 'exists' && (
                <input
                  className="rule-value"
                  value={rule.eventPropValue || ''}
                  onChange={(e) => onChange({ eventPropValue: e.target.value })}
                  placeholder="value"
                />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
