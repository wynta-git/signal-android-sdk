'use client';
import { useRef, useState, useEffect } from 'react';
import Icon from '@/components/primitives/Icon';
import Badge from '@/components/primitives/Badge';
import Toggle from '@/components/primitives/Toggle';
import ActionBar from '@/components/primitives/ActionBar';
import BudgetGrid from '@/components/primitives/BudgetGrid';
import BudgetRing from '@/components/primitives/BudgetRing';
import ValidityBar from '@/components/primitives/ValidityBar';
import UsageBreakdown from '@/components/primitives/UsageBreakdown';
import LifecycleBar from '@/components/primitives/LifecycleBar';
import PlayerSegmentPicker from '@/components/segments/PlayerSegmentPicker';
import {
  formatINRCompact,
  formatDateShort,
  getUsage,
  getBudget,
  isBudgetInherited,
  usageGranted,
  formatRelative,
} from '@/services/mocks/utils';

function PromoCodeRow({ code, onAction }) {
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState(false);
  const cardRef = useRef(null);
  const usage = getUsage('code', code.id);
  const budget = getBudget('code', code.id);
  const inherited = isBudgetInherited('code', code.id);

  useEffect(() => {
    const onHi = (e) => {
      if (e.detail && e.detail.codeId === code.id) {
        setOpen(true);
        setFlash(true);
        if (cardRef.current) {
          const rect = cardRef.current.getBoundingClientRect();
          const target = window.scrollY + rect.top - 120;
          window.scrollTo({ top: target, behavior: 'smooth' });
        }
        const t = setTimeout(() => setFlash(false), 2400);
        return () => clearTimeout(t);
      }
    };
    window.addEventListener('wynta:highlight-code', onHi);
    return () => window.removeEventListener('wynta:highlight-code', onHi);
  }, [code.id]);

  return (
    <div className={'code-card' + (flash ? ' is-highlighted' : '')} ref={cardRef}>
      <div className="code-top" onClick={() => setOpen(o => !o)}>
        <span className="code-string">{code.code}</span>
        {code.manual && code.audience_label && (
          <span className="audience-chip" title={code.audience_label}>
            <Icon name={code.audience_type === 'UPLOAD' ? 'upload' : 'users'} size={11}/>
            <span className="lbl">{code.audience_label}</span>
            <span className="cnt">{(code.audience_count || 0).toLocaleString('en-IN')}</span>
          </span>
        )}
        <div className="code-meta">
          <div className="kv">
            <span className="k">Max</span>
            <span className="v">{code.max_amount === null ? '∞' : formatINRCompact(code.max_amount)}</span>
          </div>
          <div className="kv">
            <span className="k">Valid</span>
            <span className="v">{formatDateShort(code.valid_from)} → {formatDateShort(code.valid_to)}</span>
          </div>
          <div className="kv">
            <span className="k">Auto-apply</span>
            <span className="v">{code.auto_apply ? 'Yes' : 'No'}</span>
          </div>
          <div className="kv">
            <span className="k">Order</span>
            <span className="v">#{code.display_order}</span>
          </div>
        </div>
        <div style={{ flex: '0 0 110px', minWidth: 0 }}>
          <LifecycleBar usage={usage} size="sm"/>
          <div style={{ fontSize: 10.5, color: 'var(--g500)', marginTop: 4, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
            {formatINRCompact(usageGranted(usage))} granted
          </div>
        </div>
        {code.manual && (
          <button
            className="btn btn-primary btn-sm"
            onClick={(e) => { e.stopPropagation(); onAction && onAction({ type: 'ISSUE_CODE_BONUS', code }); }}
            title="Issue this bonus to its audience"
          >
            <Icon name="send" size={12}/> Issue Bonus
          </button>
        )}
        <button
          className="btn btn-ghost btn-sm btn-icon-only"
          aria-label="Copy code"
          onClick={(e) => { e.stopPropagation(); navigator.clipboard && navigator.clipboard.writeText(code.code); }}
        >
          <Icon name="copy" size={13}/>
        </button>
        <Badge active={code.active}/>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color="var(--g400)"/>
      </div>
      {open && (
        <div className="code-bottom">
          <div className="bcol">
            <div className="label">
              <Icon name="wallet" size={11}/> Budget
              {inherited && <span className="inherits-chip"><Icon name="link" size={10}/> Inherits from configure</span>}
            </div>
            <div className="code-mini-rings">
              {budget.length === 0 ? (
                <div style={{ fontSize: 11.5, color: 'var(--g400)', fontStyle: 'italic' }}>No budget caps.</div>
              ) : budget.map(b => (
                <div key={b.period_type} className="code-mini-ring">
                  <BudgetRing used={b.used} limit={b.limit} size={44} stroke={4}/>
                  <div className="mtext">
                    <span className="pname">{b.period_type}</span>
                    <span className="used">{formatINRCompact(b.used)}</span>
                    <span> of {b.limit === null ? '∞' : formatINRCompact(b.limit)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bcol">
            <div className="label"><Icon name="activity" size={11}/> Lifecycle</div>
            <UsageBreakdown usage={usage} dense/>
            {code.manual && (
              <div className="manual-campaign-meta">
                <div className="mcm-row">
                  <Icon name="user" size={11}/>
                  <span>Issued by <strong>{code.issued_by || '—'}</strong></span>
                </div>
                <div className="mcm-row">
                  <Icon name="clock" size={11}/>
                  <span>Issued {code.issued_at ? formatRelative(code.issued_at) : '—'}</span>
                </div>
                {code.campaign_note && (
                  <div className="mcm-note">
                    <Icon name="message-square" size={11}/>
                    <span>{code.campaign_note}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConfigureDetailPanel({ configure, onAction }) {
  const cfg = configure;
  const fields = [
    { label: 'Wager',         value: '×' + cfg.wager_multiplier },
    { label: 'Chunks',        value: cfg.no_of_chunks + '×' },
    { label: 'Bonus Expiry',  value: cfg.bonus_expiry_days + ' days' },
    { label: 'Fixed Amount',  value: cfg.bonus_amount_fixed === null ? null : formatINRCompact(cfg.bonus_amount_fixed) },
    { label: 'Percent Match', value: cfg.bonus_amount_percent === null ? null : cfg.bonus_amount_percent + '%' },
    { label: 'Max Bonus',     value: cfg.bonus_amount_max === null ? '∞' : formatINRCompact(cfg.bonus_amount_max) },
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
              <span><Icon name="calendar" size={11}/> {formatDateShort(cfg.start_date)} → {formatDateShort(cfg.end_date)}</span>
              <span className="dot"/>
              <span><Icon name="coins" size={11}/> {cfg.wager_chip_type} → {cfg.credit_chip_type}</span>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn btn-secondary btn-sm btn-icon-only" title="View change history" onClick={() => onAction({ type: 'OPEN_HISTORY', nodeType: 'configure', id: cfg.id })}>
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
        <ValidityBar start={cfg.start_date} end={cfg.end_date} />
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
          {cfg.codes.map(code => <PromoCodeRow key={code.id} code={code} onAction={onAction} />)}
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
              {formatINRCompact(t.min_amount)} – {formatINRCompact(t.max_amount)} ·
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
