'use client';
import React, { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { createEligibility, deleteTrigger, fetchConfigure } from '../../store/slices/configuresSlice';
import { openDrawer } from '../../store/slices/uiSlice';
import Icon from 'wynta-react-common/components/Icon';
import Badge from 'wynta-react-common/components/Badge';
import Toggle from 'wynta-react-common/components/Toggle';
import ActionBar from 'wynta-react-common/components/ActionBar';
import BudgetGrid from '../../components/primitives/BudgetGrid';
import ValidityBar from 'wynta-react-common/components/ValidityBar';
import SpendPanel from '../../components/primitives/SpendPanel';
import PlayerSegmentPicker from 'wynta-react-common/components/segments/PlayerSegmentPicker';
import PromoCodeRow from './PromoCodeRow';
import { selectEntitySpend } from '../../store/slices/spendSlice';
import {
  formatINRCompact,
  formatDateShort,
  formatRelative,
} from '../../services/mocks/utils';

interface ManualCode {
  id: string | number;
  code: string;
  manual?: boolean;
  audience_label?: string;
  audience_type?: string;
  audience_count?: number;
  max_amount?: number | null;
  valid_from?: string;
  valid_to?: string;
  auto_apply?: boolean;
  display_order?: number;
  active?: boolean;
  issued_by?: string;
  issued_at?: string;
  campaign_note?: string;
  per_player_amount?: string | number;
}

interface ConfigureTrigger {
  id: number;
  trigger_type: string;
  description?: string | null;
  occurrence?: number;
  min_trigger_amount?: string | number | null;
  max_trigger_amount?: string | number | null;
  payment_method?: string | null;
  product?: string | null;
  active?: boolean;
  release_type?: string | null;
}

interface ExtendedConfigure {
  id: number;
  subhead_id: number;
  name: string;
  description?: string;
  active: boolean;
  priority?: number;
  applicability_frequency?: string;
  start_date?: string;
  end_date?: string;
  wager_multiplier?: number;
  product_wager_multiplier?: Record<string, number> | null;
  no_of_chunks?: number;
  bonus_amount_fixed?: string | null;
  bonus_amount_percent?: string | null;
  bonus_amount_max?: string | number | null;
  cashback_bonus_amount_fixed?: string | null;
  cashback_bonus_amount_percent?: string | null;
  cashback_bonus_amount_max?: string | number | null;
  wager_chip_type?: string;
  credit_chip_type?: string;
  chunk_expiry_days?: number;
  bonus_expiry_days?: number;
  budget?: Array<{ period_type: 'DAILY' | 'WEEKLY' | 'MONTHLY'; limit: string | number | null; used?: string | number; reset_at?: string }>;
  codes: ManualCode[];
  triggers: ConfigureTrigger[];
  eligibilities?: Array<{ id?: number; key?: string; value?: string | number; rule_value?: string | number; [k: string]: unknown }>;
  is_manual?: boolean;
}

const TTYPE_COLORS: Record<string, { bg: string; color: string }> = {
  DEPOSIT_SUCCESS: { bg: 'rgba(0,145,224,0.13)',   color: 'var(--blue)' },
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

function fmtAmt(v: unknown): string | null {
  if (v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : '₹' + n.toLocaleString('en-IN');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TriggerCard({ trigger, configureId, dispatch }: { trigger: any; configureId: number; dispatch: ReturnType<typeof useAppDispatch> }) {
  const [open, setOpen] = useState(false);
  const cfg: Record<string, unknown> = (trigger.trigger_config && typeof trigger.trigger_config === 'object') ? trigger.trigger_config : {};
  const color = TTYPE_COLORS[trigger.trigger_type as string] ?? { bg: 'var(--g100)', color: 'var(--g600)' };
  const minAmt = fmtAmt(cfg.min_amount);
  const maxAmt = fmtAmt(cfg.max_amount);

  return (
    <div className="code-card">
      <div className="code-top" onClick={() => setOpen(o => !o)}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 'var(--r)', whiteSpace: 'nowrap', flexShrink: 0, background: color.bg, color: color.color }}>
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
        <button
          className="btn btn-ghost btn-sm btn-icon-only"
          title="Edit"
          onClick={(e) => { e.stopPropagation(); dispatch(openDrawer({ type: 'EDIT_TRIGGER', id: trigger.id, parentId: configureId, trigger } as import('../../types').DrawerState)); }}
        >
          <Icon name="pencil" size={13} />
        </button>
        <button
          className="btn btn-ghost btn-sm btn-icon-only"
          title="Delete"
          onClick={async (e) => {
            e.stopPropagation();
            if (!window.confirm(`Delete ${trigger.trigger_type} trigger?`)) return;
            await dispatch(deleteTrigger({ triggerId: trigger.id, configureId }));
          }}
        >
          <Icon name="trash-2" size={13} />
        </button>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color="var(--g400)" />
      </div>
      {open && (
        <div className="code-bottom">
          <div className="bcol">
            <div className="label"><Icon name="zap" size={11} /> Config</div>
            {Object.keys(cfg).length === 0
              ? <span style={{ fontSize: 11.5, color: 'var(--g400)', fontStyle: 'italic' }}>No qualifying conditions.</span>
              : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(cfg).map(([k, v]) => (
                    <div key={k} className="kv" style={{ background: 'var(--g100)', padding: '5px 10px', borderRadius: 'var(--r)' }}>
                      <span className="k">{k}</span>
                      <span className="v">{String(v ?? '—')}</span>
                    </div>
                  ))}
                </div>
            }
          </div>
          <div className="bcol">
            <div className="label"><Icon name="info" size={11} /> Details</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: 'var(--g600)' }}>
              <span><strong style={{ color: 'var(--g800)' }}>Trigger ID</strong> · #{trigger.id}</span>
              <span><strong style={{ color: 'var(--g800)' }}>Status</strong> · {trigger.active ? 'Active' : 'Inactive'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ConfigureDetailPanelProps {
  configure: ExtendedConfigure;
  onAction: (action: { type: string; id?: number; parentId?: number; scope?: string; nodeType?: string; code?: ManualCode }) => void;
}

export default function ConfigureDetailPanel({ configure, onAction }: ConfigureDetailPanelProps) {
  const cfg = configure;
  const dispatch = useAppDispatch();
  const selectedBrand = useAppSelector(s => s.ui.selectedBrand);
  const bridgeData = useAppSelector(s => s.users.bridgeData);
  const spendRows = useAppSelector(selectEntitySpend('CONFIGURE', cfg.id));
  const currentUser: string = (bridgeData?.user as { username?: string } | null)?.username ?? 'system';

  const handleSegmentSelect = async (segmentId: string | number | null) => {
    if (segmentId == null) return;
    await dispatch(createEligibility({
      configureId: cfg.id,
      payload: {
        site_id: selectedBrand,
        eligibility_key: 'segment_id',
        eligibility_value: String(segmentId),
        eligibility_value_type: 'INT',
        active: true,
        created_by: currentUser,
      },
    }));
    dispatch(fetchConfigure(cfg.id));
  };
  const wagerPerChunk = (() => {
    const fixed = cfg.bonus_amount_fixed != null ? Number(cfg.bonus_amount_fixed) : null;
    const chunks = cfg.no_of_chunks ?? 1;
    const mult = cfg.wager_multiplier ?? 0;
    if (fixed != null && chunks > 0 && mult > 0) {
      return formatINRCompact((fixed / chunks) * mult);
    }
    return null;
  })();

  const hasCashback =
    cfg.cashback_bonus_amount_fixed != null ||
    cfg.cashback_bonus_amount_percent != null;

  const bonusAmountLabel = cfg.bonus_amount_fixed != null
    ? formatINRCompact(Number(cfg.bonus_amount_fixed))
    : cfg.bonus_amount_percent != null
      ? cfg.bonus_amount_percent + '%' + (cfg.bonus_amount_max != null ? ` (max ${formatINRCompact(Number(cfg.bonus_amount_max))})` : '')
      : null;

  return (
    <React.Fragment key={`cfg-${cfg.id}`}>
    <div className="detail-content">
      <div className="card mb-4">
        <div className="card-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="title">
              {cfg.name}
              <Badge active={cfg.active}/>
              <span className={'badge frequency ' + cfg.applicability_frequency}>
                <Icon name="repeat" size={10}/> {cfg.applicability_frequency}
              </span>
              <span className="badge priority">
                <Icon name="flag" size={10}/> P{cfg.priority}
              </span>
            </div>
            <div className="desc">{cfg.description}</div>
            <div className="meta">
              <span><Icon name="hash" size={11}/> Configure #{cfg.id}</span>
              <span className="dot"/>
              <span><Icon name="calendar" size={11}/> {formatDateShort(cfg.start_date ?? '')} → {formatDateShort(cfg.end_date ?? '')}</span>
              <span className="dot"/>
              <span><Icon name="coins" size={11}/> {cfg.wager_chip_type} → {cfg.credit_chip_type}</span>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn btn-secondary btn-sm btn-icon-only" title="View change history" onClick={() => onAction({ type: 'OPEN_HISTORY', id: cfg.id, nodeType: 'configure' })}>
              <Icon name="history" size={14}/>
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => onAction({ type: 'EDIT_CONFIGURE', id: cfg.id })}>
              <Icon name="pencil" size={12}/> Edit
            </button>
          </div>
        </div>
      </div>

      <div className="section-row">
        <div className="section-label">Budget Utilization</div>
        <div className="right">{!cfg.budget || cfg.budget.length === 0
          ? <span className="inherits-chip"><Icon name="link" size={10}/> Inherits from subhead</span>
          : <strong>Daily · Weekly · Monthly</strong>}</div>
      </div>
      <BudgetGrid budget={cfg.budget ?? []} />

      <div className="section-row" style={{ marginTop: 28 }}>
        <div className="section-label">Usage Breakdown</div>
        <div className="right">PENDING → RELEASED → CONSUMED · or EXPIRED · or FORFEITED</div>
      </div>
      <div className="mb-6"><SpendPanel spendRows={spendRows} /></div>

      <div className="section-row">
        <div className="section-label">Bonus Mechanics</div>
        <button
          className="btn btn-ghost btn-sm btn-icon-only"
          title="Edit mechanics"
          onClick={() => dispatch(openDrawer({ type: 'EDIT_CHUNKS', id: cfg.id, configure: cfg as unknown as Record<string, unknown> } as import('../../types').DrawerState))}
        >
          <Icon name="pencil" size={13}/>
        </button>
      </div>
      <div className="card mb-6" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Bonus amount */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--g100)' }}>
          <span style={{ fontSize: 12, color: 'var(--g500)' }}>Bonus Amount</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: bonusAmountLabel == null ? 'var(--g300)' : 'var(--g800)' }}>{bonusAmountLabel ?? '—'}</span>
        </div>
        {/* Wager */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--g100)' }}>
          <span style={{ fontSize: 12, color: 'var(--g500)' }}>Wager Multiplier</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: cfg.wager_multiplier == null ? 'var(--g300)' : 'var(--g800)' }}>
            {cfg.wager_multiplier != null ? `×${cfg.wager_multiplier}` : '—'}
          </span>
        </div>
        {/* Product wager multipliers */}
        {cfg.product_wager_multiplier && Object.keys(cfg.product_wager_multiplier).length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid var(--g100)' }}>
            <span style={{ fontSize: 12, color: 'var(--g500)' }}>Product Wager Multipliers</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end', maxWidth: '65%' }}>
              {Object.entries(cfg.product_wager_multiplier).map(([product, mult]) => (
                <span
                  key={product}
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    color: 'var(--g800)',
                    background: 'var(--g100)',
                    padding: '2px 8px',
                    borderRadius: 'var(--r)',
                  }}
                >
                  {product} ×{mult}
                </span>
              ))}
            </div>
          </div>
        )}
        {/* Chunks */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--g100)' }}>
          <span style={{ fontSize: 12, color: 'var(--g500)' }}>Chunks</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--g800)' }}>
            {cfg.no_of_chunks ?? 1}× {wagerPerChunk ? <span style={{ color: 'var(--g400)', fontWeight: 400 }}>· {wagerPerChunk}/chunk</span> : null}
          </span>
        </div>
        {/* Expiry */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--g100)' }}>
          <span style={{ fontSize: 12, color: 'var(--g500)' }}>Chunk Expiry</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: cfg.chunk_expiry_days == null ? 'var(--g300)' : 'var(--g800)' }}>
            {cfg.chunk_expiry_days != null ? `${cfg.chunk_expiry_days} days` : '—'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--g100)' }}>
          <span style={{ fontSize: 12, color: 'var(--g500)' }}>Bonus Expiry</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: cfg.bonus_expiry_days == null ? 'var(--g300)' : 'var(--g800)' }}>
            {cfg.bonus_expiry_days != null ? `${cfg.bonus_expiry_days} days` : '—'}
          </span>
        </div>
        {/* Chips */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: hasCashback ? '1px solid var(--g100)' : 'none' }}>
          <span style={{ fontSize: 12, color: 'var(--g500)' }}>Chips</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--g800)' }}>
            wager <span style={{ color: 'var(--blue)' }}>{cfg.wager_chip_type ?? '—'}</span>
            {' · '}credit <span style={{ color: 'var(--blue)' }}>{cfg.credit_chip_type ?? '—'}</span>
          </span>
        </div>
        {/* Cashback */}
        {hasCashback && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--g100)' }}>
            <span style={{ fontSize: 12, color: 'var(--g500)' }}>Cashback</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--g800)' }}>
              {cfg.cashback_bonus_amount_fixed != null
                ? formatINRCompact(Number(cfg.cashback_bonus_amount_fixed))
                : cfg.cashback_bonus_amount_percent != null
                  ? cfg.cashback_bonus_amount_percent + '%'
                  : '—'}
              {cfg.cashback_bonus_amount_max != null && (
                <span style={{ color: 'var(--g400)', fontWeight: 400 }}> · max {formatINRCompact(Number(cfg.cashback_bonus_amount_max))}</span>
              )}
            </span>
          </div>
        )}
        {/* Validity Window */}
        <div style={{ marginTop: 16, padding: '10px 0 4px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--g400)' }}>Validity Window</span>
          <ValidityBar start={cfg.start_date ?? ''} end={cfg.end_date ?? ''} />
        </div>
      </div>

      <div className="section-label">Eligibility Criteria</div>
      <PlayerSegmentPicker configureId={cfg.id} eligibilities={cfg.eligibilities} onSelect={handleSegmentSelect}/>

      <div className="section-label">Promo Codes · {(cfg.codes ?? []).length}</div>
      {(cfg.codes ?? []).length === 0 ? (
        <div style={{ padding: 16, border: '1px dashed var(--g200)', borderRadius: 'var(--rl)', textAlign: 'center', fontSize: 12, color: 'var(--g400)', marginBottom: 24 }}>
          No promo codes — add one to make the bonus claimable by code.
        </div>
      ) : (
        <div className="mb-6">
          {(cfg.codes ?? []).map(code => <PromoCodeRow key={code.id} code={code} configureId={cfg.id} />)}
        </div>
      )}

      {(() => {
        const allTriggers = cfg.triggers ?? [];
        const bonusTriggers = allTriggers.filter(t => !t.release_type || t.release_type === 'BONUS_RELEASE');
        const chunkTriggers = allTriggers.filter(t => t.release_type === 'CHUNK_RELEASE');
        return (
          <>
            <div className="section-row">
              <div className="section-label">Bonus Release · {bonusTriggers.length}</div>
              <button className="btn btn-secondary btn-sm" onClick={() => dispatch(openDrawer({ type: 'NEW_TRIGGER', parentId: cfg.id, releaseType: 'BONUS_RELEASE' }))}>
                <Icon name="plus" size={12}/> Add
              </button>
            </div>
            {bonusTriggers.length === 0 ? (
              <div style={{ padding: 16, border: '1px dashed var(--g200)', borderRadius: 'var(--rl)', textAlign: 'center', fontSize: 12, color: 'var(--g400)', marginBottom: 8 }}>
                No bonus release triggers configured.
              </div>
            ) : (
              <div className="mb-4">
                {bonusTriggers.map(t => (
                  <TriggerCard key={t.id} trigger={t} configureId={cfg.id} dispatch={dispatch} />
                ))}
              </div>
            )}

            <div className="section-row" style={{ marginTop: 16 }}>
              <div className="section-label">Chunk Release · {chunkTriggers.length}</div>
              <button className="btn btn-secondary btn-sm" onClick={() => dispatch(openDrawer({ type: 'NEW_TRIGGER', parentId: cfg.id, releaseType: 'CHUNK_RELEASE' }))}>
                <Icon name="plus" size={12}/> Add
              </button>
            </div>
            {chunkTriggers.length === 0 ? (
              <div style={{ padding: 16, border: '1px dashed var(--g200)', borderRadius: 'var(--rl)', textAlign: 'center', fontSize: 12, color: 'var(--g400)', marginBottom: 8 }}>
                No chunk release triggers configured.
              </div>
            ) : (
              <div className="mb-6">
                {chunkTriggers.map(t => (
                  <TriggerCard key={t.id} trigger={t} configureId={cfg.id} dispatch={dispatch} />
                ))}
              </div>
            )}
          </>
        );
      })()}

    </div>

    <ActionBar>
      {cfg.is_manual ? (
        <button className="btn btn-primary" onClick={() => onAction({ type: 'NEW_MANUAL_BONUS', parentId: cfg.id })}>
          <Icon name="plus" size={13}/> New Manual Campaign
        </button>
      ) : (
        <button className="btn btn-primary" onClick={() => onAction({ type: 'EDIT_CONFIGURE', id: cfg.id })}>
          <Icon name="pencil" size={13}/> Edit Configure
        </button>
      )}
      <button className="btn btn-secondary" onClick={() => onAction({ type: 'NEW_PROMOCODE', parentId: cfg.id })}>
        <Icon name="ticket" size={13}/> Add Promo Code
      </button>
      <button className="btn btn-secondary" onClick={() => onAction({ type: 'NEW_TRIGGER', parentId: cfg.id })}>
        <Icon name="zap" size={13}/> Add Trigger
      </button>
      <button className="btn btn-secondary" onClick={() => onAction({ type: 'EDIT_BUDGET', scope: 'configure', id: cfg.id })}>
        <Icon name="wallet" size={13}/> Manage Budget
      </button>
      <div style={{ flex: 1 }}/>
      <Toggle on={cfg.active} onChange={() => {}} label={cfg.active ? 'Active' : 'Paused'}/>
    </ActionBar>
    </React.Fragment>
  );
}
