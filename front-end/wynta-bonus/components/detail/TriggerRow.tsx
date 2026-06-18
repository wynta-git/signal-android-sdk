'use client';
import { useState } from 'react';
import Icon from 'wynta-react-common/components/Icon';
import Badge from 'wynta-react-common/components/Badge';
import { useAppDispatch } from '../../store/hooks';
import { openDrawer } from '../../store/slices/uiSlice';
import { deleteTrigger } from '../../store/slices/configuresSlice';
import { formatINRCompact } from '../../services/mocks/utils';
import type { DrawerState } from '../../types';

interface TriggerConfig {
  min_amount?: number | null;
  max_amount?: number | null;
  payment_method?: string | null;
  product?: string | null;
  occurrence?: number | null;
  [key: string]: unknown;
}

interface TriggerRowProps {
  trigger: {
    id: number;
    configure_id?: number;
    trigger_type: string;
    trigger_config?: TriggerConfig | null;
    active?: boolean;
    [key: string]: unknown;
  };
  configureId: number;
}

const TTYPE_COLORS: Record<string, { bg: string; color: string }> = {
  DEPOSIT:        { bg: 'rgba(0,145,224,0.13)',   color: 'var(--blue)' },
  REGISTRATION:   { bg: 'rgba(16,185,129,0.13)',  color: 'var(--ok)' },
  PROMO_CODE:     { bg: 'rgba(16,185,129,0.13)',  color: 'var(--ok)' },
  MANUAL:         { bg: 'rgba(245,158,11,0.15)',  color: 'var(--warn)' },
  REFERRAL:       { bg: 'rgba(124,58,237,0.13)',  color: '#7c3aed' },
  BET_PLACED:     { bg: 'rgba(239,68,68,0.12)',   color: '#dc2626' },
  LOGIN:          { bg: 'rgba(100,116,139,0.13)', color: 'var(--g600)' },
  APP_VISIT:      { bg: 'rgba(100,116,139,0.13)', color: 'var(--g600)' },
  MILESTONE:      { bg: 'rgba(245,158,11,0.15)',  color: 'var(--warn)' },
  LEADERBOARD_WON:{ bg: 'rgba(124,58,237,0.13)',  color: '#7c3aed' },
  TOURNAMENT_WON: { bg: 'rgba(124,58,237,0.13)',  color: '#7c3aed' },
  FRIEND_SIGNUP:  { bg: 'rgba(16,185,129,0.13)',  color: 'var(--ok)' },
};

function occurrenceLabel(occ?: number | null): string {
  if (occ === 0) return 'Every occurrence';
  if (occ === 1) return 'First only';
  if (occ != null) return `Occurrence #${occ}`;
  return 'Every occurrence';
}

export default function TriggerRow({ trigger, configureId }: TriggerRowProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);

  const cfg = trigger.trigger_config ?? {};
  const color = TTYPE_COLORS[trigger.trigger_type] ?? { bg: 'var(--g100)', color: 'var(--g600)' };

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

  const minAmt = cfg.min_amount != null ? formatINRCompact(Number(cfg.min_amount)) : null;
  const maxAmt = cfg.max_amount != null ? formatINRCompact(Number(cfg.max_amount)) : null;

  return (
    <div className="code-card">
      <div className="code-top" onClick={() => setOpen(o => !o)}>
        <span
          style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', padding: '4px 10px',
            borderRadius: 'var(--r)', whiteSpace: 'nowrap',
            background: color.bg, color: color.color,
            flexShrink: 0,
          }}
        >
          {trigger.trigger_type}
        </span>

        <div className="code-meta">
          <div className="kv">
            <span className="k">Occurrence</span>
            <span className="v">{occurrenceLabel(cfg.occurrence as number | null)}</span>
          </div>
          {(minAmt || maxAmt) && (
            <div className="kv">
              <span className="k">Amount</span>
              <span className="v">
                {minAmt ?? '—'} → {maxAmt ?? '∞'}
              </span>
            </div>
          )}
          <div className="kv">
            <span className="k">Payment</span>
            <span className="v">{(cfg.payment_method as string) || 'ANY'}</span>
          </div>
          <div className="kv">
            <span className="k">Product</span>
            <span className="v">{(cfg.product as string) || 'ANY'}</span>
          </div>
        </div>

        <Badge active={trigger.active} />
        <button
          className="btn btn-ghost btn-sm btn-icon-only"
          title="Edit trigger"
          onClick={handleEdit}
        >
          <Icon name="pencil" size={13} />
        </button>
        <button
          className="btn btn-ghost btn-sm btn-icon-only"
          title="Delete trigger"
          onClick={handleDelete}
        >
          <Icon name="trash-2" size={13} />
        </button>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color="var(--g400)" />
      </div>

      {open && (
        <div className="code-bottom">
          <div className="bcol">
            <div className="label"><Icon name="zap" size={11} /> Trigger Config</div>
            {Object.keys(cfg).length === 0 ? (
              <div style={{ fontSize: 11.5, color: 'var(--g400)', fontStyle: 'italic' }}>
                No qualifying conditions.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {Object.entries(cfg).map(([k, v]) => (
                  <div key={k} className="kv" style={{ background: 'var(--g100)', padding: '6px 10px', borderRadius: 'var(--r)' }}>
                    <span className="k">{k}</span>
                    <span className="v">{String(v ?? '—')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bcol">
            <div className="label"><Icon name="info" size={11} /> Details</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--g600)' }}>
              <span><strong style={{ color: 'var(--g800)' }}>Trigger ID</strong> · #{trigger.id}</span>
              <span><strong style={{ color: 'var(--g800)' }}>Configure ID</strong> · #{trigger.configure_id ?? configureId}</span>
              <span><strong style={{ color: 'var(--g800)' }}>Status</strong> · {trigger.active ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
