'use client';
import { useState } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { createEligibility } from '@/store/slices/configuresSlice';
import { MOCK_CONFIGURES } from '@/services/mocks/configures';
import Icon from '@/components/primitives/Icon';
import Toggle from '@/components/primitives/Toggle';
import DrawerFooter from '@/components/drawers/DrawerFooter';
import PlayerSegmentPicker from '@/components/segments/PlayerSegmentPicker';

const VALUE_TYPES = ['STRING', 'NUMBER', 'BOOL', 'ENUM'];

export default function EligibilityForm({ state, submitting, onCancel, onSubmit }) {
  const dispatch = useAppDispatch();
  const cfg = MOCK_CONFIGURES[state.parentId];
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [valueType, setValueType] = useState('STRING');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);

  const handle = (e) => {
    e.preventDefault();
    const payload = { key, value, valueType, description, active };
    dispatch(createEligibility({ configureId: state.parentId, payload }));
    onSubmit({ type: 'NEW_ELIGIBILITY', ...payload });
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
          <label>Key</label>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="e.g. player.country"
            required
            style={{ fontFamily: 'var(--mono)', fontSize: 12.5 }}
          />
        </div>
        <div className="field-group">
          <label>Value</label>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. IN" required/>
        </div>
        <div className="field-group">
          <label>Type</label>
          <div className="seg" style={{ '--cols': 4 }}>
            {VALUE_TYPES.map(t => (
              <button type="button" key={t} className={valueType === t ? 'active' : ''} onClick={() => setValueType(t)}>{t}</button>
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
