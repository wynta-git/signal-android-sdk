'use client';
import Icon from '@/components/primitives/Icon';
import MultiSelect from '@/components/primitives/MultiSelect';
import { SEGMENT_FIELDS, OPS } from '@/services/mocks/constants';

export default function RuleEditor({ rule, onChange, onRemove }) {
  const field = SEGMENT_FIELDS.find(f => f.id === rule.field) || SEGMENT_FIELDS[0];
  const ops = OPS[field.type] || OPS.enum;
  const op = ops.find(o => o.id === rule.op) || ops[0];

  const onFieldChange = (id) => {
    const f = SEGMENT_FIELDS.find(x => x.id === id);
    const firstOp = (OPS[f.type] || OPS.enum)[0];
    let value = '';
    if (f.type === 'enum')    value = f.options[0];
    if (f.type === 'recency') value = '7';
    onChange({ field: id, op: firstOp.id, value });
  };

  return (
    <div className="builder-rule">
      <select className="rule-field" value={rule.field} onChange={(e) => onFieldChange(e.target.value)}>
        {SEGMENT_FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
      </select>
      <select className="rule-op" value={rule.op} onChange={(e) => onChange({ op: e.target.value })}>
        {ops.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>

      {field.type === 'enum' && (op.id === 'IN' || op.id === 'NOT_IN') ? (
        <MultiSelect
          options={field.options}
          value={Array.isArray(rule.value) ? rule.value : (rule.value ? [rule.value] : [])}
          onChange={(v) => onChange({ value: v })}
        />
      ) : field.type === 'enum' ? (
        <select className="rule-value" value={rule.value} onChange={(e) => onChange({ value: e.target.value })}>
          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.type === 'recency' ? (
        <div className="rule-recency">
          <input
            className="rule-value rule-num"
            type="number"
            min="1"
            value={rule.value || ''}
            onChange={(e) => onChange({ value: e.target.value })}
          />
          <select
            className="rule-unit"
            value={rule.unit || 'days'}
            onChange={(e) => onChange({ unit: e.target.value })}
          >
            <option value="days">days</option>
            <option value="weeks">weeks</option>
            <option value="months">months</option>
          </select>
        </div>
      ) : (op.id === 'BETWEEN') ? (
        <div className="rule-recency">
          <input
            className="rule-value rule-num"
            value={rule.value || ''}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="min"
          />
          <span style={{ color: 'var(--g400)', fontSize: 12 }}>and</span>
          <input
            className="rule-value rule-num"
            value={rule.value2 || ''}
            onChange={(e) => onChange({ value2: e.target.value })}
            placeholder="max"
          />
        </div>
      ) : (
        <input
          className="rule-value"
          value={rule.value || ''}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder={field.type === 'amount' ? '₹ amount' : 'value'}
        />
      )}

      <button className="rule-remove" type="button" onClick={onRemove} aria-label="Remove filter">
        <Icon name="x" size={13}/>
      </button>
    </div>
  );
}
