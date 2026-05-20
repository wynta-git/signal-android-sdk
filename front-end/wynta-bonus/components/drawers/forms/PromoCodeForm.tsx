'use client';
import { useState } from 'react';
import { useAppDispatch } from '../../../store/hooks';
import { createPromoCode } from '../../../store/slices/configuresSlice';
import { MOCK_CONFIGURES } from '../../../services/mocks/configures';
import Icon from 'wynta-react-common/components/Icon';
import Toggle from 'wynta-react-common/components/Toggle';
import DrawerFooter from '../../../components/drawers/DrawerFooter';
import type { DrawerState } from '../../../types';

interface PromoCodeFormProps {
  state: DrawerState;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

export default function PromoCodeForm({ state, submitting, onCancel, onSubmit }: PromoCodeFormProps) {
  const dispatch = useAppDispatch();
  const cfg = state.parentId != null ? MOCK_CONFIGURES[state.parentId] : null;
  const [code, setCode] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10));
  const [validTo, setValidTo]   = useState(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
  const [autoApply, setAutoApply] = useState(false);
  const [order, setOrder] = useState(1);
  const [active, setActive] = useState(true);

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { code, maxAmount, validFrom, validTo, autoApply, order, active };
    if (state.parentId != null) {
      dispatch(createPromoCode({ configureId: state.parentId, payload }));
    }
    onSubmit({ type: 'NEW_PROMOCODE', ...payload });
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
          <label>Code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. WELCOME100"
            style={{ fontFamily: 'var(--mono)', letterSpacing: '0.04em', fontWeight: 600 }}
            required
          />
          <div className="helper">A-Z, 0-9, dashes. Case-insensitive at apply time.</div>
        </div>
        <div className="field-group">
          <label>Max bonus (₹)</label>
          <input value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="leave empty for inherit"/>
        </div>
        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Valid from</label>
              <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)}/>
            </div>
            <div>
              <label>Valid to</label>
              <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)}/>
            </div>
          </div>
        </div>
        <div className="field-group">
          <div className="row-2">
            <div>
              <label>Display order</label>
              <input type="number" value={order} onChange={(e) => setOrder(+e.target.value)}/>
            </div>
            <div>
              <label>Auto-apply</label>
              <div style={{ height: 36, display: 'flex', alignItems: 'center' }}>
                <Toggle on={autoApply} onChange={setAutoApply} label={autoApply ? 'On' : 'Off'}/>
              </div>
            </div>
          </div>
        </div>
        <div className="field-group">
          <Toggle on={active} onChange={setActive} label={active ? 'Active' : 'Inactive'}/>
        </div>
      </div>
      <DrawerFooter submitting={submitting} onCancel={onCancel} label="Create Code"/>
    </form>
  );
}
