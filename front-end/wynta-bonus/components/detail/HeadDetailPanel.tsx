'use client';
import { useState } from 'react';
import { useAppDispatch } from '../../store/hooks';
import { selectNode } from '../../store/slices/treeSlice';
import { getUsage, formatRelative } from '../../services/mocks/utils';
import Badge from 'wynta-react-common/components/Badge';
import Icon from 'wynta-react-common/components/Icon';
import BudgetGrid from '../../components/primitives/BudgetGrid';
import UsageBreakdown from '../../components/primitives/UsageBreakdown';
import OwnerPill from '../../components/primitives/OwnerPill';
import ActionBar from 'wynta-react-common/components/ActionBar';
import Toggle from 'wynta-react-common/components/Toggle';
import type { BonusHead } from '../../types';

interface HeadDetailPanelProps {
  head: BonusHead;
  onAction: (action: { type: string; id?: number; parentId?: number; scope?: string }) => void;
}

export default function HeadDetailPanel({ head, onAction }: HeadDetailPanelProps) {
  const dispatch = useAppDispatch();
  const [openSubheads, setOpenSubheads] = useState<Set<number>>(() => new Set());
  const toggleSub = (id: number) => {
    setOpenSubheads(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  return (
    <div className="detail-content" key={`head-${head.id}`}>
      <div className="card mb-4">
        <div className="card-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="title">
              {head.name}
              <Badge active={head.active} />
            </div>
            <div className="desc">{head.description}</div>
            <div className="meta">
              <span><Icon name="globe" size={11}/> Site {head.site_id}</span>
              <span className="dot"/>
              <span><Icon name="user" size={11}/> {head.owner}</span>
              <span className="dot"/>
              <span><Icon name="clock" size={11}/> Updated {formatRelative(head.updated_at ?? '')}</span>
            </div>
          </div>
          <div className="header-actions">
            <button
              className="btn btn-secondary btn-sm btn-icon-only"
              title="View change history"
              onClick={() => onAction({ type: 'OPEN_HISTORY', id: head.id })}
            >
              <Icon name="history" size={14}/>
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => onAction({ type: 'EDIT_HEAD', id: head.id })}>
              <Icon name="pencil" size={12}/> Edit
            </button>
          </div>
        </div>
      </div>

      <div className="section-row">
        <div className="section-label">Budget Utilization</div>
        <div className="right"><strong>Daily · Weekly · Monthly</strong></div>
      </div>
      <BudgetGrid budget={head.budget} />

      <div className="section-row" style={{ marginTop: 28 }}>
        <div className="section-label">Usage Breakdown</div>
        <div className="right">Across all configures in this head</div>
      </div>
      <UsageBreakdown usage={getUsage('head', head.id)} />

      <div className="section-label" style={{ marginTop: 28 }}>
        Subheads · {head.subheads.length}
      </div>
      <div>
        {head.subheads.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--g400)', fontStyle: 'italic' }}>No subheads yet.</span>
        )}
        {head.subheads.map(sh => {
          const open = openSubheads.has(sh.id);
          return (
            <div key={sh.id} className="subhead-row">
              <div className="head" onClick={() => toggleSub(sh.id)}>
                <span className={'badge ' + (sh.active ? 'active' : 'inactive')} style={{ padding: '3px 6px' }}>
                  <span className="ind"/>
                </span>
                <div className="meta">
                  <div className="name">{sh.name}</div>
                  <div className="owner">{sh.description}</div>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={(e) => { e.stopPropagation(); dispatch(selectNode({ type: 'subhead', id: sh.id })); }}
                >
                  Open <Icon name="arrow-right" size={11}/>
                </button>
                <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color="var(--g400)"/>
              </div>
              {open && (
                <div className="body">
                  <span style={{ fontSize: 12, color: 'var(--g500)' }}>{sh.description || '—'}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="section-label" style={{ marginTop: 28 }}>
        Owners & Permissions · {head.owners.length}
      </div>
      <div className="owners-list mb-4">
        {head.owners.map((o, i) => <OwnerPill key={i} owner={o} />)}
      </div>

      <ActionBar>
        <button className="btn btn-primary" onClick={() => onAction({ type: 'EDIT_HEAD', id: head.id })}>
          <Icon name="pencil" size={13}/> Edit Head
        </button>
        <button className="btn btn-secondary" onClick={() => onAction({ type: 'NEW_SUBHEAD', parentId: head.id })}>
          <Icon name="plus" size={13}/> Add Subhead
        </button>
        <button className="btn btn-secondary" onClick={() => onAction({ type: 'EDIT_BUDGET', scope: 'head', id: head.id })}>
          <Icon name="wallet" size={13}/> Manage Budget
        </button>
        <div style={{ flex: 1 }} />
        <Toggle on={head.active} onChange={() => {}} label={head.active ? 'Active' : 'Paused'} />
      </ActionBar>
    </div>
  );
}
