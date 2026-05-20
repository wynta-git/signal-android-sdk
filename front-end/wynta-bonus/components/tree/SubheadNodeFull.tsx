'use client';
import { memo, useCallback } from 'react';
import Icon from 'wynta-react-common/components/Icon';
import ConfigureNode from './ConfigureNode';
import { MOCK_SUBHEADS } from '../../services/mocks/subheads';
import { MOCK_CONFIGURES } from '../../services/mocks/configures';
import type { SubheadSummary, SelectedNode, NodeType, BonusConfigure } from '../../types';

interface MenuEvent {
  type: NodeType;
  id: number;
  x: number;
  y: number;
}

interface SubheadNodeFullProps {
  subSummary: SubheadSummary;
  expanded: boolean;
  onToggle: (id: number) => void;
  selected: boolean | null;
  onSelect: (id: number) => void;
  selectedNode: SelectedNode | null;
  onSelectConfigure: (id: number) => void;
  onMenu: (evt: MenuEvent) => void;
  loadingChildren: boolean;
}

const SubheadNodeFull = memo(function SubheadNodeFull({
  subSummary, expanded, onToggle, selected, onSelect,
  selectedNode, onSelectConfigure, onMenu, loadingChildren,
}: SubheadNodeFullProps) {
  const detail = MOCK_SUBHEADS[subSummary.id];
  const configures: BonusConfigure[] = detail
    ? (detail.configures as number[]).map((id: number) => MOCK_CONFIGURES[id]).filter(Boolean)
    : [];

  const onMenuClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    onMenu({ type: 'subhead', id: subSummary.id, x: r.right - 200, y: r.bottom + 4 });
  }, [subSummary.id, onMenu]);

  return (
    <div className="tree-node">
      <div
        className={'tree-row lvl-subhead' + (selected ? ' selected' : '')}
        onClick={() => onSelect(subSummary.id)}
        role="treeitem"
        aria-expanded={expanded}
        aria-selected={selected ?? undefined}
      >
        <button
          className={'chev' + (expanded ? ' open' : '')}
          onClick={(e) => { e.stopPropagation(); onToggle(subSummary.id); }}
          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          <Icon name="chevron-right" size={12}/>
        </button>
        <span className={'sub-dot ' + (subSummary.active ? 'active' : 'inactive')} />
        <span className="tree-name" title={subSummary.name}>{subSummary.name}</span>
        <span className="tree-meta">{configures.length} configs</span>
        <button className="menu-btn" onClick={onMenuClick} aria-label="More actions">
          <Icon name="more-horizontal" size={14}/>
        </button>
      </div>
      <div className={'tree-children' + (expanded ? ' open' : '')}>
        {loadingChildren ? (
          <>
            <div className="shimmer" style={{ width: '70%' }}/>
            <div className="shimmer" style={{ width: '55%' }}/>
            <div className="shimmer" style={{ width: '60%' }}/>
          </>
        ) : configures.length === 0 ? (
          <div style={{ padding: '8px 10px 8px 44px', fontSize: 11.5, color: 'var(--g400)', fontStyle: 'italic' }}>
            No configures yet
          </div>
        ) : configures.map(cfg => (
          <ConfigureNode
            key={cfg.id}
            cfg={cfg}
            selected={selectedNode && selectedNode.type === 'configure' && selectedNode.id === cfg.id}
            onSelect={onSelectConfigure}
            onMenu={onMenu}
          />
        ))}
      </div>
    </div>
  );
});

export default SubheadNodeFull;
