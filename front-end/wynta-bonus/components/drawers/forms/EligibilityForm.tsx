'use client';
import { useState } from 'react';
import { useAppSelector } from '../../../store/hooks';
import { selectConfigureById } from '../../../store/slices/configuresSlice';
import Icon from 'wynta-react-common/components/Icon';
import Toggle from 'wynta-react-common/components/Toggle';
import DrawerFooter from '../../../components/drawers/DrawerFooter';
import type { DrawerState } from '../../../types';

const VALUE_TYPES = ['STRING', 'NUMBER', 'BOOL', 'ENUM'] as const;

interface EligibilityFormProps {
  state: DrawerState;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

export default function EligibilityForm({ state, submitting, onCancel, onSubmit }: EligibilityFormProps) {
  const cfg = useAppSelector(
    state.parentId != null ? selectConfigureById(state.parentId) : () => undefined
  );

  const [eligibilityKey,       setEligibilityKey]       = useState('');
  const [eligibilityValue,     setEligibilityValue]     = useState('');
  const [eligibilityValueType, setEligibilityValueType] = useState<typeof VALUE_TYPES[number]>('STRING');
  const [description,          setDescription]          = useState('');
  const [active,               setActive]               = useState(true);

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      eligibility_key:        eligibilityKey,
      eligibility_value:      eligibilityValue,
      eligibility_value_type: eligibilityValueType,
      description:            description || null,
      active,
    });
  };

  return (
    <form onSubmit={handle} style={{ display: 'contents' }}>
      <div className="drawer-body">
        {cfg && (
          <div className="field-group">
            <label>Configure</label>
            <span className="parent-chip"><Icon name="settings-2" size={11}/> {cfg.name}</span>
          </div>
        )}
        <div className="field-group">
          <label>Key <span className="required">*</span></label>
          <input
            value={eligibilityKey}
            onChange={(e) => setEligibilityKey(e.target.value)}
            placeholder="e.g. player.country"
            required
            style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}
          />
        </div>
        <div className="field-group">
          <label>Value <span className="required">*</span></label>
          <input
            value={eligibilityValue}
            onChange={(e) => setEligibilityValue(e.target.value)}
            placeholder="e.g. IN"
            required
          />
        </div>
        <div className="field-group">
          <label>Type</label>
          <div className="seg" style={{ '--cols': 4 } as React.CSSProperties}>
            {VALUE_TYPES.map(t => (
              <button type="button" key={t} className={eligibilityValueType === t ? 'active' : ''} onClick={() => setEligibilityValueType(t)}>{t}</button>
            ))}
          </div>
        </div>
        <div className="field-group">
          <label>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Why this rule exists"/>
        </div>
        <div className="field-group">
          <Toggle on={active} onChange={setActive} label={active ? 'Active' : 'Inactive'}/>
        </div>
      </div>
      <DrawerFooter submitting={submitting} onCancel={onCancel} label="Add Criterion"/>
    </form>
  );
}
