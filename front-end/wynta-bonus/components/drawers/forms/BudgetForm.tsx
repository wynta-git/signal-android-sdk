'use client';
import { useState } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { updateBudget } from '@/store/slices/budgetsSlice';
import Icon from 'wynta-react-common/components/Icon';
import DrawerFooter from '@/components/drawers/DrawerFooter';
import { MOCK_HEADS } from '@/services/mocks/heads';
import { MOCK_SUBHEADS } from '@/services/mocks/subheads';
import { MOCK_CONFIGURES } from '@/services/mocks/configures';
import { CONFIGURE_BUDGETS } from '@/services/mocks/budgets';
import type { DrawerState } from '@/types';

interface BudgetFormProps {
  state: DrawerState;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

export default function BudgetForm({ state, submitting, onCancel, onSubmit }: BudgetFormProps) {
  const dispatch = useAppDispatch();
  const scope = state.scope || 'head';
  const source =
    scope === 'subhead'   ? (state.id != null ? MOCK_SUBHEADS[state.id] : null) :
    scope === 'configure' ? (state.id != null ? MOCK_CONFIGURES[state.id] : null) :
                            (state.id != null ? MOCK_HEADS[state.id] : null);

  const ownBudget =
    scope === 'configure' && state.id != null ? (CONFIGURE_BUDGETS[state.id] || []) :
    (source as { budget?: { period_type: string; limit?: number | null }[] } | null)?.budget || [];

  const inherits = scope === 'configure' && state.id != null && !CONFIGURE_BUDGETS[state.id];
  const parentLabel =
    scope === 'subhead'   ? (source as { parent_head_name?: string } | null)?.parent_head_name :
    scope === 'configure' ? MOCK_SUBHEADS[(source as { subhead_id?: number } | null)?.subhead_id ?? -1]?.name :
                            null;

  const scopeLabel = { head: 'Head', subhead: 'Subhead', configure: 'Configure' }[scope] ?? 'Head';
  const scopeIcon  = { head: 'folder', subhead: 'folder-tree', configure: 'settings-2' }[scope] ?? 'folder';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findLimit = (pt: string) => (ownBudget as any[]).find((b: { period_type: string }) => b.period_type === pt)?.limit;

  const [daily, setDaily]     = useState<string>(findLimit('DAILY')   != null ? String(findLimit('DAILY'))   : '');
  const [weekly, setWeekly]   = useState<string>(findLimit('WEEKLY')  != null ? String(findLimit('WEEKLY'))  : '');
  const [monthly, setMonthly] = useState<string>(findLimit('MONTHLY') != null ? String(findLimit('MONTHLY')) : '');

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    const periods = [
      ...(daily   ? [{ period_type: 'DAILY'   as const, limit: daily   }] : []),
      ...(weekly  ? [{ period_type: 'WEEKLY'  as const, limit: weekly  }] : []),
      ...(monthly ? [{ period_type: 'MONTHLY' as const, limit: monthly }] : []),
    ];
    dispatch(updateBudget({ scope: scope as 'head' | 'subhead' | 'configure', id: state.id!, periods }));
    onSubmit({ type: 'EDIT_BUDGET', scope, id: state.id, daily, weekly, monthly });
  };

  return (
    <form onSubmit={handle} style={{ display: 'contents' }}>
      <div className="drawer-body">
        {source && (
          <div className="field-group">
            <label>{scopeLabel}</label>
            <span className="parent-chip"><Icon name={scopeIcon} size={11}/> {(source as { name: string }).name}</span>
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
          When a period limit is hit, {scope === 'head' ? 'configures' : scope === 'subhead' ? "this subhead's configures" : 'this configure'} pause until reset.
        </div>
      </div>
      <DrawerFooter submitting={submitting} onCancel={onCancel} label="Save Budget"/>
    </form>
  );
}
