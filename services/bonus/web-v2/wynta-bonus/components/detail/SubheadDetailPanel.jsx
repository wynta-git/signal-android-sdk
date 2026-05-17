'use client';
import { MOCK_CONFIGURES } from '@/services/mocks/configures';
import { getUsage, getBudget, isBudgetInherited, formatINRCompact, formatRelative } from '@/services/mocks/utils';
import Badge from '@/components/primitives/Badge';
import Icon from '@/components/primitives/Icon';
import BudgetGrid from '@/components/primitives/BudgetGrid';
import UsageBreakdown from '@/components/primitives/UsageBreakdown';
import OwnerPill from '@/components/primitives/OwnerPill';
import ValidityBar from '@/components/primitives/ValidityBar';
import ActionBar from '@/components/primitives/ActionBar';
import Toggle from '@/components/primitives/Toggle';
import ChangeHistory from './ChangeHistory';

export default function SubheadDetailPanel({ subhead, onSelect, onAction }) {
  const configures = subhead.configures.map(id => MOCK_CONFIGURES[id]).filter(Boolean);

  return (
    <div className="detail-content" key={`sub-${subhead.id}`}>
      <div className="card mb-4">
        <div className="card-header">
          <div style={{ flex: 1 }}>
            <div className="title">
              {subhead.name}
              <Badge active={subhead.active}/>
            </div>
            <div className="desc">{subhead.description}</div>
            <div className="meta">
              <span style={{ cursor: 'pointer', color: 'var(--blue)' }} onClick={() => onSelect({ type: 'head', id: subhead.parent_head_id })}>
                <Icon name="folder" size={11}/> {subhead.parent_head_name}
              </span>
              <span className="dot"/>
              <span><Icon name="user" size={11}/> {subhead.owner}</span>
              <span className="dot"/>
              <span><Icon name="clock" size={11}/> Updated {formatRelative(subhead.updated_at)}</span>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn btn-secondary btn-sm btn-icon-only" title="View change history" onClick={() => onAction({ type: 'OPEN_HISTORY', nodeType: 'subhead', id: subhead.id })}>
              <Icon name="history" size={14}/>
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => onAction({ type: 'EDIT_SUBHEAD', id: subhead.id })}>
              <Icon name="pencil" size={12}/> Edit
            </button>
          </div>
        </div>
      </div>

      <div className="section-row"><div className="section-label">Budget Utilization</div><div className="right"><strong>Daily · Weekly · Monthly</strong></div></div>
      <BudgetGrid budget={subhead.budget} />

      <div className="section-row" style={{ marginTop: 28 }}>
        <div className="section-label">Usage Breakdown</div>
        <div className="right">Across all configures in this subhead</div>
      </div>
      <UsageBreakdown usage={getUsage('subhead', subhead.id)} />

      <div className="section-label" style={{ marginTop: 28 }}>
        Configures · {configures.length}
      </div>
      {configures.length === 0 ? (
        <div style={{ padding: 20, border: '1px dashed var(--g200)', borderRadius: 'var(--rl)', textAlign: 'center', fontSize: 12, color: 'var(--g400)' }}>
          No configures yet — add one to start awarding bonuses.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {configures.map(cfg => (
            <div
              key={cfg.id}
              className="card interactive"
              style={{ padding: 14, cursor: 'pointer' }}
              onClick={() => onSelect({ type: 'configure', id: cfg.id })}
            >
              <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.active ? 'var(--ok)' : 'var(--err)' }}/>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--g900)', flex: 1 }}>{cfg.name}</span>
                <span className={'freq-pill ' + cfg.applicability_frequency}>{cfg.applicability_frequency}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--g500)', marginBottom: 8, lineHeight: 1.45 }}>{cfg.description}</div>
              <div className="flex items-center gap-3" style={{ fontSize: 11, color: 'var(--g500)' }}>
                <span><strong style={{ color: 'var(--g700)' }}>×{cfg.wager_multiplier}</strong> wager</span>
                <span className="dot" style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--g300)' }}/>
                <span>{cfg.no_of_chunks} chunks</span>
                <span className="dot" style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--g300)' }}/>
                <span>max {cfg.bonus_amount_max === null ? '∞' : formatINRCompact(cfg.bonus_amount_max)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="section-label" style={{ marginTop: 28 }}>
        Owners · {subhead.owners.length}
      </div>
      <div className="owners-list">
        {subhead.owners.map((o, i) => <OwnerPill key={i} owner={o}/>)}
      </div>

      <ActionBar>
        <button className="btn btn-primary" onClick={() => onAction({ type: 'EDIT_SUBHEAD', id: subhead.id })}>
          <Icon name="pencil" size={13}/> Edit Subhead
        </button>
        <button className="btn btn-secondary" onClick={() => onAction({ type: 'NEW_CONFIGURE', parentId: subhead.id })}>
          <Icon name="plus" size={13}/> Add Configure
        </button>
        {subhead.is_manual && (
          <span style={{ fontSize: 11.5, color: 'var(--g500)', marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="info" size={12}/>
            Bonuses are issued per promo code — open a configure to send.
          </span>
        )}
        <button className="btn btn-secondary" onClick={() => onAction({ type: 'EDIT_BUDGET', scope: 'subhead', id: subhead.id })}>
          <Icon name="wallet" size={13}/> Manage Budget
        </button>
        <div style={{ flex: 1 }}/>
        <Toggle on={subhead.active} onChange={() => {}} label={subhead.active ? 'Active' : 'Paused'}/>
      </ActionBar>
    </div>
  );
}
