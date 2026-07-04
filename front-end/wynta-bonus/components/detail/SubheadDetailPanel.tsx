'use client';
import React, { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { fetchConfiguresBySubhead, selectConfiguresBySubhead } from '../../store/slices/configuresSlice';
import { selectEntitySpend } from '../../store/slices/spendSlice';
import { formatINRCompact, formatRelative } from '../../services/mocks/utils';
import Badge from 'wynta-react-common/components/Badge';
import Icon from 'wynta-react-common/components/Icon';
import BudgetGrid from '../../components/primitives/BudgetGrid';
import SpendPanel from '../../components/primitives/SpendPanel';
import OwnerPill from '../../components/primitives/OwnerPill';
import ActionBar from 'wynta-react-common/components/ActionBar';
import Toggle from 'wynta-react-common/components/Toggle';
import type { BonusSubhead, SelectedNode } from '../../types';

interface SubheadDetailPanelProps {
  subhead: BonusSubhead;
  onSelect?: (node: SelectedNode) => void;
  onAction: (action: { type: string; id?: number; parentId?: number; scope?: string; nodeType?: string }) => void;
}

export default function SubheadDetailPanel({ subhead, onSelect, onAction }: SubheadDetailPanelProps) {
  const dispatch = useAppDispatch();
  const spendRows = useAppSelector(selectEntitySpend('SUBHEAD', subhead.id));

  useEffect(() => {
    dispatch(fetchConfiguresBySubhead(subhead.id));
  }, [subhead.id, dispatch]);

  const configures = useAppSelector(selectConfiguresBySubhead(subhead.id));

  const activeStakeholders = (subhead.owners ?? []).filter(o => o.active);

  return (
    <React.Fragment key={`sub-${subhead.id}`}>
    <div className="detail-content">
      <div className="card mb-4">
        <div className="card-header">
          <div style={{ flex: 1 }}>
            <div className="title">
              {subhead.name}
              <Badge active={subhead.active}/>
            </div>
            <div className="desc">{subhead.description}</div>
            <div className="meta">
              {subhead.parent_head_id && onSelect && (
                <span style={{ cursor: 'pointer', color: 'var(--blue)' }} onClick={() => onSelect({ type: 'head', id: subhead.parent_head_id! })}>
                  <Icon name="folder" size={11}/> {subhead.parent_head_name}
                </span>
              )}
              {subhead.parent_head_id && onSelect && <span className="dot"/>}
              <span
                style={{ cursor: 'pointer' }}
                title="Edit main owner"
                onClick={() => onAction({ type: 'EDIT_OWNER', scope: 'subhead', id: subhead.id })}
              >
                <Icon name="user" size={11}/> Owner: {subhead.owner} <Icon name="pencil" size={10} color="var(--g400)"/>
              </span>
              <span className="dot"/>
              <span><Icon name="clock" size={11}/> Updated {formatRelative(subhead.updated_at ?? '')}</span>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn btn-secondary btn-sm btn-icon-only" title="View change history" onClick={() => onAction({ type: 'OPEN_HISTORY', id: subhead.id, nodeType: 'subhead' })}>
              <Icon name="history" size={14}/>
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => onAction({ type: 'EDIT_SUBHEAD', id: subhead.id })}>
              <Icon name="pencil" size={12}/> Edit
            </button>
          </div>
        </div>
      </div>

      <div className="section-row"><div className="section-label">Budget Utilization</div><div className="right"><strong>Daily · Weekly · Monthly</strong></div></div>
      <BudgetGrid budget={subhead.budget ?? []} />

      <div className="section-row" style={{ marginTop: 28 }}>
        <div className="section-label">Usage Breakdown</div>
        <div className="right">Across all configures in this subhead</div>
      </div>
      <SpendPanel spendRows={spendRows} />

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
              onClick={() => onSelect && onSelect({ type: 'configure', id: cfg.id })}
            >
              <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.active ? 'var(--ok)' : 'var(--err)' }}/>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--g900)', flex: 1 }}>{cfg.name}</span>
                <span className={'freq-pill ' + cfg.applicability_frequency}>{cfg.applicability_frequency}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--g500)', marginBottom: 8, lineHeight: 1.45 }}>{cfg.description}</div>
              <div className="flex items-center gap-3" style={{ fontSize: 11, color: 'var(--g500)' }}>
                <span><strong style={{ color: 'var(--g700)' }}>×{Number(cfg.wager_multiplier)}</strong> wager</span>
                <span className="dot" style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--g300)' }}/>
                <span>{cfg.no_of_chunks} chunks</span>
                <span className="dot" style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--g300)' }}/>
                <span>max {cfg.bonus_amount_max == null ? '∞' : formatINRCompact(Number(cfg.bonus_amount_max))}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="section-row" style={{ marginTop: 28 }}>
        <div className="section-label">
          Owners · {activeStakeholders.length + (subhead.owner ? 1 : 0)}
        </div>
        <div className="right">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onAction({ type: 'EDIT_OWNERS', scope: 'subhead', id: subhead.id })}
          >
            <Icon name="user-plus" size={12}/> Edit Owners
          </button>
        </div>
      </div>
      <div className="owners-list">
        {!subhead.owner && activeStakeholders.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--g400)', fontStyle: 'italic' }}>No owners assigned.</span>
        )}
        {subhead.owner && (
          <OwnerPill owner={{ username: subhead.owner, role: 'Main Owner', active: true }} isMain/>
        )}
        {activeStakeholders.map((o, i) => <OwnerPill key={i} owner={o}/>)}
      </div>

    </div>

    <ActionBar>
      <button className="btn btn-primary" onClick={() => onAction({ type: 'EDIT_SUBHEAD', id: subhead.id })}>
        <Icon name="pencil" size={13}/> Edit Subhead
      </button>
      <button className="btn btn-secondary" onClick={() => onAction({ type: 'NEW_CONFIGURE', parentId: subhead.id })}>
        <Icon name="plus" size={13}/> Add Configure
      </button>
      <button className="btn btn-secondary" onClick={() => onAction({ type: 'EDIT_BUDGET', scope: 'subhead', id: subhead.id })}>
        <Icon name="wallet" size={13}/> Manage Budget
      </button>
      <button className="btn btn-secondary" onClick={() => onAction({ type: 'EDIT_OWNERS', scope: 'subhead', id: subhead.id })}>
        <Icon name="users" size={13}/> Manage Owners
      </button>
      <div style={{ flex: 1 }}/>
      <Toggle on={subhead.active} onChange={() => {}} label={subhead.active ? 'Active' : 'Paused'}/>
    </ActionBar>
    </React.Fragment>
  );
}
