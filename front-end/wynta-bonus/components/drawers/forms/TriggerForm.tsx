'use client';
import { useState } from 'react';
import { useAppDispatch } from '../../../store/hooks';
import { createTrigger } from '../../../store/slices/configuresSlice';
import Icon from 'wynta-react-common/components/Icon';
import Toggle from 'wynta-react-common/components/Toggle';
import DrawerFooter from '../../../components/drawers/DrawerFooter';
import { MOCK_CONFIGURES } from '../../../services/mocks/configures';
import type { DrawerState } from '../../../types';

const TRIGGER_TYPES = ['DEPOSIT', 'REGISTRATION', 'APP_VISIT', 'BET_PLACED', 'LEADERBOARD_WON', 'TOURNAMENT_WON', 'FRIEND_SIGNUP', 'LOGIN'] as const;

interface TriggerFormProps {
  state: DrawerState;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

export default function TriggerForm({ state, submitting, onCancel, onSubmit }: TriggerFormProps) {
  const dispatch = useAppDispatch();
  const cfg = state.parentId != null ? MOCK_CONFIGURES[state.parentId] : null;
  const [triggerType, setTriggerType] = useState<typeof TRIGGER_TYPES[number]>('DEPOSIT');
  const [description, setDescription] = useState('');
  const [minTriggerAmount, setMinTriggerAmount] = useState('');
  const [maxTriggerAmount, setMaxTriggerAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [product, setProduct] = useState('');
  const [occurrence, setOccurrence] = useState(0);
  const [active, setActive] = useState(true);

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      trigger_type: triggerType,
      description: description || null,
      min_trigger_amount: minTriggerAmount || null,
      max_trigger_amount: maxTriggerAmount || null,
      payment_method: paymentMethod || null,
      product: product || null,
      occurrence,
      active,
    };
    if (state.parentId != null) {
      dispatch(createTrigger({ configureId: state.parentId, payload }));
    }
    onSubmit({ type: 'NEW_TRIGGER', ...payload });
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
          <label>Trigger Type</label>
          <div className="seg" style={{ '--cols': 2 } as React.CSSProperties}>
            {TRIGGER_TYPES.map(t => (
              <button type="button" key={t} className={triggerType === t ? 'active' : ''} onClick={() => setTriggerType(t)}>{t}</button>
            ))}
          </div>
        </div>
        <div className="field-group">
          <label>Description <span style={{ color: 'var(--g400)', fontWeight: 400 }}>(optional)</span></label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. First deposit via UPI on mobile"/>
        </div>
        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Min trigger amount (₹)</label>
              <input value={minTriggerAmount} onChange={(e) => setMinTriggerAmount(e.target.value)} placeholder="500"/>
            </div>
            <div>
              <label>Max trigger amount (₹)</label>
              <input value={maxTriggerAmount} onChange={(e) => setMaxTriggerAmount(e.target.value)} placeholder="10000"/>
            </div>
          </div>
        </div>
        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Payment method</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="">Any</option>
                <option>UPI</option><option>NETBANKING</option><option>CARD</option><option>WALLET</option>
              </select>
            </div>
            <div>
              <label>Product</label>
              <select value={product} onChange={(e) => setProduct(e.target.value)}>
                <option value="">Any</option>
                <option>POKER</option><option>CASINO</option><option>RUMMY</option>
              </select>
            </div>
          </div>
        </div>
        <div className="field-group">
          <label>Occurrence</label>
          <select value={occurrence} onChange={(e) => setOccurrence(Number(e.target.value))}>
            <option value={0}>Every occurrence (0)</option>
            <option value={1}>First only (1)</option>
            <option value={2}>2nd occurrence</option>
            <option value={3}>3rd occurrence</option>
            <option value={5}>5th occurrence</option>
          </select>
        </div>
        <div className="field-group">
          <Toggle on={active} onChange={setActive} label={active ? 'Active' : 'Inactive'}/>
        </div>
      </div>
      <DrawerFooter submitting={submitting} onCancel={onCancel} label="Add Trigger"/>
    </form>
  );
}
