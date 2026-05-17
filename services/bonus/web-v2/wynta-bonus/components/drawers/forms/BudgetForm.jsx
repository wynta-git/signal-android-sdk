'use client';
import { useState } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { updateBudget } from '@/store/slices/budgetsSlice';
import Icon from '@/components/primitives/Icon';
import DrawerFooter from '@/components/drawers/DrawerFooter';
import { MOCK_HEADS } from '@/services/mocks/heads';
import { MOCK_SUBHEADS } from '@/services/mocks/subheads';
import { MOCK_CONFIGURES } from '@/services/mocks/configures';
import { CONFIGURE_BUDGETS } from '@/services/mocks/budgets';

export default function BudgetForm({ state, submitting, onCancel, onSubmit }) {
  const dispatch = useAppDispatch();
  const scope = state.scope || 'head';
  const source =
    scope === 'subhead'   ? MOCK_SUBHEADS[state.id] :
    scope === 'configure' ? MOCK_CONFIGURES[state.id] :
                            MOCK_HEADS[state.id];

  const ownBudget =
    scope === 'configure' ? (CONFIGURE_BUDGETS[state.id] || []) :
    (source?.budget || []);
  const inherits = scope === 'configure' && !CONFIGURE_BUDGETS[state.id];
  const parentLabel =
    scope === 'subhead'   ? source?.parent_head_name :
    scope === 'configure' ? MOCK_SUBHEADS[source?.subhead_id]?.name :
                            null;

  const scopeLabel = { head: 'Head', subhead: 'Subhead', configure: 'Configure' }[scope];
  const scopeIcon  = { head: 'folder', subhead: 'folder-tree', configure: 'settings-2' }[scope];

  const [daily, setDaily]     = useState(ownBudget.find(b => b.period_type === 'DAILY')?.limit   || '');
  const [weekly, setWeekly]   = useState(ownBudget.find(b => b.period_type === 'WEEKLY')?.limit  || '');
  const [monthly, setMonthly] = useState(ownBudget.find(b => b.period_type === 'MONTHLY')?.limit || '');

  const handle = (e) => {
    e.preventDefault();
    const periods = [
      ...(daily   ? [{ period_type: 'DAILY',   limit: daily   }] : []),
      ...(weekly  ? [{ period_type: 'WEEKLY',  limit: weekly  }] : []),
      ...(monthly ? [{ period_type: 'MONTHLY', limit: monthly }] : []),
    ];
    dispatch(updateBudget({ scope, id: state.id, periods }));
    onSubmit({ type: 'EDIT_BUDGET', scope, id: state.id, daily, weekly, monthly });
  };

  return (
    <form onSubmit={handle} style={{ display: 'contents' }}>
      <div className="drawer-body">
        {source && (
          <div className="field-group">
            <label>{scopeLabel}</label>
            <span className="parent-chip"><Icon name={scopeIcon} size={11}/> {source.name}</span>
            {parentLabel && (
              <div className="helper" style={{ marginTop: 4 }}>
                under <strong style={{ color: 'var(--g700)' }}>{parentLabel}</strong>
              </div>
            )}
          </div>
        )}
        {inherits && (
          <div style={{
            padding: '10px 12px', borderRadius: 'var(--r)',
            background: 'var(--bp)', border: '1px solid var(--bm)',
            fontSize: 12, color: 'var(--blue)', marginBottom: 14,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Icon name="info" size={13}/>
            This configure currently inherits its budget from its subhead. Set any limit below to give it its own cap.
          </div>
        )}
        <div className="field-group">
          <label>Daily limit (₹)</label>
          <input value={daily} onChange={(e) => setDaily(e.target.value)} placeholder="leave empty for ∞"/>
        </div>
        <div className="field-group">
          <label>Weekly limit (₹)</label>
          <input value={weekly} onChange={(e) => setWeekly(e.target.value)} placeholder="leave empty for ∞"/>
        </div>
        <div className="field-group">
          <label>Monthly limit (₹)</label>
          <input value={monthly} onChange={(e) => setMonthly(e.target.value)} placeholder="leave empty for ∞"/>
        </div>
        <div className="helper" style={{ marginTop: 8 }}>
          When a period limit is hit, {scope === 'head' ? 'configures' : scope === 'subhead' ? "this subhead’s configures" : 'this configure'} pause until reset.
        </div>
      </div>
      <DrawerFooter submitting={submitting} onCancel={onCancel} label="Save Budget"/>
    </form>
  );
}
