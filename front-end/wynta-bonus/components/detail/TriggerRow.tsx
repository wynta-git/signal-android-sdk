'use client';
import { useState } from 'react';
import Icon from 'wynta-react-common/components/Icon';
import Badge from 'wynta-react-common/components/Badge';
import { useAppDispatch } from '../../store/hooks';
import { openDrawer } from '../../store/slices/uiSlice';
import { deleteTrigger } from '../../store/slices/configuresSlice';
import type { DrawerState } from '../../types';

interface TriggerRowProps {
  trigger: {
    id: number;
    configure_id?: number;
    trigger_type: string;
    trigger_config?: Record<string, unknown> | null;
    active?: boolean;
  };
  configureId: number;
}

const TTYPE_COLORS: Record<string, { bg: string; color: string }> = {
  DEPOSIT:         { bg: 'rgba(0,145,224,0.13)',   color: 'var(--blue)' },
  REGISTRATION:    { bg: 'rgba(16,185,129,0.13)',  color: 'var(--ok)' },
  PROMO_CODE:      { bg: 'rgba(16,185,129,0.13)',  color: 'var(--ok)' },
  MANUAL:          { bg: 'rgba(245,158,11,0.15)',  color: 'var(--warn)' },
  REFERRAL:        { bg: 'rgba(124,58,237,0.13)',  color: '#7c3aed' },
  BET_PLACED:      { bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' },
  LOGIN:           { bg: 'rgba(100,116,139,0.13)', color: 'var(--g600)' },
  APP_VISIT:       { bg: 'rgba(100,116,139,0.13)', color: 'var(--g600)' },
  MILESTONE:       { bg: 'rgba(245,158,11,0.15)',  color: 'var(--warn)' },
  LEADERBOARD_WON: { bg: 'rgba(124,58,237,0.13)',  color: '#7c3aed' },
  TOURNAMENT_WON:  { bg: 'rgba(124,58,237,0.13)',  color: '#7c3aed' },
  FRIEND_SIGNUP:   { bg: 'rgba(16,185,129,0.13)',  color: 'var(--ok)' },
};

function fmtAmount(v: unknown): string | null {
  if (v == null) return null;
  const n = Number(v);
  if (isNaN(n)) return null;
  return '₹' + n.toLocaleString('en-IN');
}

export default function TriggerRow({ trigger, configureId }: TriggerRowProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);

  const cfg = trigger.trigger_config ?? {};
  const color = TTYPE_COLORS[trigger.trigger_type] ?? { bg: 'var(--g100)', color: 'var(--g600)' };

  const minAmt = fmtAmount(cfg.min_amount);
  const maxAmt = fmtAmount(cfg.max_amount);
  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    dispatch(openDrawer({
      type: 'EDIT_TRIGGER',
      id: trigger.id,
      parentId: configureId,
      trigger: trigger as unknown as Record<string, unknown>,
    } as DrawerState));
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Delete ${trigger.trigger_type} trigger?`)) return;
    await dispatch(deleteTrigger({ triggerId: trigger.id, configureId }));
  };

  return (
    <div className="code-card">
      <div className="code-top" onClick={() => setOpen(o => !o)}>

        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', padding: '4px 10px',
          borderRadius: 'var(--r)', whiteSpace: 'nowrap', flexShrink: 0,
          background: color.bg, color: color.color,
        }}>
          {trigger.trigger_type}
        </span>

        <div className="code-meta">
          {(minAmt || maxAmt) && (
            <div className="kv">
              <span className="k">Amount</span>
              <span className="v">{minAmt ?? '—'} → {maxAmt ?? '∞'}</span>
            </div>
          )}
          <div className="kv">
            <span className="k">Payment</span>
            <span className="v">{String(cfg.payment_method || 'ANY')}</span>
          </div>
          <div className="kv">
            <span className="k">Product</span>
            <span className="v">{String(cfg.product || 'ANY')}</span>
          </div>
        </div>

        <Badge active={trigger.active} />
        <button className="btn btn-ghost btn-sm btn-icon-only" title="Edit" onClick={handleEdit}>
          <Icon name="pencil" size={13} />
        </button>
        <button className="btn btn-ghost btn-sm btn-icon-only" title="Delete" onClick={handleDelete}>
          <Icon name="trash-2" size={13} />
        </button>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color="var(--g400)" />
      </div>

      {open && (
        <div className="code-bottom">
          <div className="bcol">
            <div className="label"><Icon name="zap" size={11} /> Config</div>
            {Object.keys(cfg).length === 0 ? (
              <span style={{ fontSize: 11.5, color: 'var(--g400)', fontStyle: 'italic' }}>No conditions.</span>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(cfg).map(([k, v]) => (
                  <div key={k} className="kv" style={{ background: 'var(--g100)', padding: '5px 10px', borderRadius: 'var(--r)' }}>
                    <span className="k">{k}</span>
                    <span className="v">{String(v ?? '—')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bcol">
            <div className="label"><Icon name="info" size={11} /> Info</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: 'var(--g600)' }}>
              <span><strong style={{ color: 'var(--g800)' }}>ID</strong> · #{trigger.id}</span>
              <span><strong style={{ color: 'var(--g800)' }}>Configure</strong> · #{trigger.configure_id ?? configureId}</span>
              <span><strong style={{ color: 'var(--g800)' }}>Status</strong> · {trigger.active ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
