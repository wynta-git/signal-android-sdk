'use client';
import { useState } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { createTrigger } from '@/store/slices/configuresSlice';
import Icon from '@/components/primitives/Icon';
import Toggle from '@/components/primitives/Toggle';
import DrawerFooter from '@/components/drawers/DrawerFooter';
import { MOCK_CONFIGURES } from '@/services/mocks/configures';

const TRIGGER_TYPES = ['DEPOSIT', 'WAGER', 'LOSS', 'CODE'];

export default function TriggerForm({ state, submitting, onCancel, onSubmit }) {
  const dispatch = useAppDispatch();
  const cfg = MOCK_CONFIGURES[state.parentId];
  const [triggerType, setTriggerType] = useState('DEPOSIT');
  const [code, setCode] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('ANY');
  const [product, setProduct] = useState('ANY');
  const [occurrence, setOccurrence] = useState('First deposit');
  const [active, setActive] = useState(true);

  const handle = (e) => {
    e.preventDefault();
    const payload = { triggerType, code, minAmount, maxAmount, paymentMethod, product, occurrence, active };
    dispatch(createTrigger({ configureId: state.parentId, payload }));
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
          <div className="seg" style={{ '--cols': 4 }}>
            {TRIGGER_TYPES.map(t => (
              <button type="button" key={t} className={triggerType === t ? 'active' : ''} onClick={() => setTriggerType(t)}>{t}</button>
            ))}
          </div>
        </div>
        {triggerType === 'CODE' && (
          <div className="field-group">
            <label>Promo Code</label>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. WELCOME100" style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}/>
          </div>
        )}
        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Min amount (₹)</label>
              <input value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="500"/>
            </div>
            <div>
              <label>Max amount (₹)</label>
              <input value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="10000"/>
            </div>
          </div>
        </div>
        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Payment method</label>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option>ANY</option><option>UPI</option><option>CARD</option><option>WIRE</option><option>CRYPTO</option>
              </select>
            </div>
            <div>
              <label>Product</label>
              <select value={product} onChange={(e) => setProduct(e.target.value)}>
                <option>ANY</option><option>SLOTS</option><option>CASINO</option><option>SPORTS</option><option>POKER</option>
              </select>
            </div>
          </div>
        </div>
        <div className="field-group">
          <label>Occurrence</label>
          <input value={occurrence} onChange={(e) => setOccurrence(e.target.value)} placeholder="First successful deposit"/>
        </div>
        <div className="field-group">
          <Toggle on={active} onChange={setActive} label={active ? 'Active' : 'Inactive'}/>
        </div>
      </div>
      <DrawerFooter submitting={submitting} onCancel={onCancel} label="Add Trigger"/>
    </form>
  );
}
