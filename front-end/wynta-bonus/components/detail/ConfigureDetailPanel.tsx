'use client';
import Icon from 'wynta-react-common/components/Icon';
import Badge from 'wynta-react-common/components/Badge';
import Toggle from 'wynta-react-common/components/Toggle';
import ActionBar from 'wynta-react-common/components/ActionBar';
import BudgetGrid from '@/components/primitives/BudgetGrid';
import ValidityBar from 'wynta-react-common/components/ValidityBar';
import UsageBreakdown from '@/components/primitives/UsageBreakdown';
import PlayerSegmentPicker from 'wynta-react-common/components/segments/PlayerSegmentPicker';
import PromoCodeRow from './PromoCodeRow';
import {
  formatINRCompact,
  formatDateShort,
  getUsage,
  getBudget,
  isBudgetInherited,
  formatRelative,
} from '@/services/mocks/utils';

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
  occurrence?: string;
  min_amount?: string | number;
  max_amount?: string | number;
  payment_method?: string;
  product?: string;
  code?: string | null;
  active?: boolean;
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
  no_of_chunks?: number;
  bonus_amount_fixed?: string | null;
  bonus_amount_percent?: string | null;
  bonus_amount_max?: string | number | null;
  wager_chip_type?: string;
  credit_chip_type?: string;
  chunk_expiry_days?: number;
  bonus_expiry_days?: number;
  codes: ManualCode[];
  triggers: ConfigureTrigger[];
  is_manual?: boolean;
}

interface ConfigureDetailPanelProps {
  configure: ExtendedConfigure;
  onAction: (action: { type: string; id?: number; parentId?: number; scope?: string; code?: ManualCode }) => void;
}

export default function ConfigureDetailPanel({ configure, onAction }: ConfigureDetailPanelProps) {
  const cfg = configure;
  const fields = [
    { label: 'Wager',         value: '×' + cfg.wager_multiplier },
    { label: 'Chunks',        value: cfg.no_of_chunks + '×' },
    { label: 'Bonus Expiry',  value: cfg.bonus_expiry_days + ' days' },
    { label: 'Fixed Amount',  value: cfg.bonus_amount_fixed == null ? null : formatINRCompact(Number(cfg.bonus_amount_fixed)) },
    { label: 'Percent Match', value: cfg.bonus_amount_percent == null ? null : cfg.bonus_amount_percent + '%' },
    { label: 'Max Bonus',     value: cfg.bonus_amount_max == null ? '∞' : formatINRCompact(Number(cfg.bonus_amount_max)) },
  ];

  return (
    <div className="detail-content" key={`cfg-${cfg.id}`}>
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
            <button className="btn btn-secondary btn-sm btn-icon-only" title="View change history" onClick={() => onAction({ type: 'OPEN_HISTORY', id: cfg.id })}>
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
        <div className="right">{isBudgetInherited('configure', cfg.id)
          ? <span className="inherits-chip"><Icon name="link" size={10}/> Inherits from subhead</span>
          : <strong>Daily · Weekly · Monthly</strong>}</div>
      </div>
      <BudgetGrid budget={getBudget('configure', cfg.id)} />

      <div className="section-row" style={{ marginTop: 28 }}>
        <div className="section-label">Usage Breakdown</div>
        <div className="right">PENDING → RELEASED → CONSUMED · or EXPIRED · or FORFEITED</div>
      </div>
      <div className="mb-6"><UsageBreakdown usage={getUsage('configure', cfg.id)} /></div>

      <div className="section-label">Bonus Mechanics</div>
      <div className="stat-grid mb-6">
        {fields.map((f, i) => (
          <div key={i} className="stat-tile">
            <div className="label">{f.label}</div>
            <div className={'value' + (f.value === null ? ' muted' : '')}>{f.value === null ? '—' : f.value}</div>
          </div>
        ))}
      </div>

      <div className="section-label">Validity Window</div>
      <div className="card" style={{ padding: '24px 22px 16px', marginBottom: 24 }}>
        <ValidityBar start={cfg.start_date ?? ''} end={cfg.end_date ?? ''} />
        <div style={{ marginTop: 18, display: 'flex', gap: 28, fontSize: 11.5, color: 'var(--g500)' }}>
          <span><strong style={{ color: 'var(--g700)' }}>Chunk expiry</strong> · {cfg.chunk_expiry_days} days</span>
          <span><strong style={{ color: 'var(--g700)' }}>Bonus expiry</strong> · {cfg.bonus_expiry_days} days</span>
          <span><strong style={{ color: 'var(--g700)' }}>Chips</strong> · wager {cfg.wager_chip_type}, credit {cfg.credit_chip_type}</span>
        </div>
      </div>

      <div className="section-label">Eligibility Criteria</div>
      <PlayerSegmentPicker configureId={cfg.id}/>

      <div className="section-label">Promo Codes · {cfg.codes.length}</div>
      {cfg.codes.length === 0 ? (
        <div style={{ padding: 16, border: '1px dashed var(--g200)', borderRadius: 'var(--rl)', textAlign: 'center', fontSize: 12, color: 'var(--g400)', marginBottom: 24 }}>
          No promo codes — add one to make the bonus claimable by code.
        </div>
      ) : (
        <div className="mb-6">
          {cfg.codes.map(code => <PromoCodeRow key={code.id} code={code} configureId={cfg.id} />)}
        </div>
      )}

      <div className="section-label">Release Triggers · {cfg.triggers.length}</div>
      {cfg.triggers.length === 0 ? (
        <div style={{ padding: 16, border: '1px dashed var(--g200)', borderRadius: 'var(--rl)', textAlign: 'center', fontSize: 12, color: 'var(--g400)' }}>
          No triggers — bonus cannot release until a trigger is configured.
        </div>
      ) : cfg.triggers.map(t => (
        <div key={t.id} className="trigger-row">
          <span className={'ttype ' + t.trigger_type}>{t.trigger_type}</span>
          <div className="tinfo">
            <div className="occ">{t.occurrence}</div>
            <div className="meta">
              {formatINRCompact(Number(t.min_amount))} – {formatINRCompact(Number(t.max_amount))} ·
              {' '}{t.payment_method} · {t.product}
              {t.code && <> · code <span style={{ fontFamily: 'var(--mono)', color: 'var(--g700)', fontWeight: 600 }}>{t.code}</span></>}
            </div>
          </div>
          <Badge active={t.active}/>
        </div>
      ))}
      <button
        className="btn btn-secondary btn-sm"
        style={{ marginTop: 8 }}
        onClick={() => onAction({ type: 'NEW_TRIGGER', parentId: cfg.id })}
      >
        <Icon name="plus" size={12}/> Add Trigger
      </button>

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
    </div>
  );
}
