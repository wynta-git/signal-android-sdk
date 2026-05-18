'use client';
import { useState, useMemo } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { createSegment } from '@/store/slices/segmentsSlice';
import Icon from '@/components/primitives/Icon';
import RuleEditor from './RuleEditor';
import type { SegmentRule } from '@/types';

interface RuleWithMeta extends SegmentRule {
  id: number;
  unit?: string;
  value2?: string;
}

interface SegmentBuilderProps {
  onCancel: () => void;
  onSave: () => void;
}

export default function SegmentBuilder({ onCancel, onSave }: SegmentBuilderProps) {
  const dispatch = useAppDispatch();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [combinator, setCombinator] = useState<'AND' | 'OR'>('AND');
  const [rules, setRules] = useState<RuleWithMeta[]>([
    { id: 1, field: 'kyc_status', op: 'IS', value: 'VERIFIED' },
    { id: 2, field: 'last_login', op: 'WITHIN', value: '7', unit: 'days' },
  ]);
  const [nextId, setNextId] = useState(3);

  const updateRule = (id: number, patch: Partial<RuleWithMeta>) =>
    setRules(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  const removeRule = (id: number) => setRules(rs => rs.filter(r => r.id !== id));
  const addRule = () => {
    setRules(rs => [...rs, { id: nextId, field: 'tier', op: 'IS', value: 'Gold' }]);
    setNextId(n => n + 1);
  };

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
    dispatch(createSegment({ name, description, combinator, rules }));
    onSave();
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
              <div className="builder-empty">No filters yet — add one to narrow the audience.</div>
            )}
            {rules.map((r, i) => (
              <div key={r.id}>
                {i > 0 && <div className="builder-join">{combinator}</div>}
                <RuleEditor rule={r} onChange={(patch) => updateRule(r.id, patch)} onRemove={() => removeRule(r.id)}/>
              </div>
            ))}
          </div>

          <button className="builder-add" type="button" onClick={addRule}>
            <Icon name="plus" size={12}/> Add filter
          </button>
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
