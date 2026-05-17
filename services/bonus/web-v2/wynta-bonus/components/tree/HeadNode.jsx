'use client';
import { useCallback } from 'react';
import Icon from '@/components/primitives/Icon';
import SubheadNodeFull from './SubheadNodeFull';

export default function HeadNode({ head, expanded, onToggle, selected, onSelect, expandedSubheads, onToggleSubhead, loadingSubheads, selectedNode, onMenu }) {
  const activeSubheads = head.subheads.filter(s => s.active).length;

  const onMenuClick = useCallback((e) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    onMenu({ type: 'head', id: head.id, x: r.right - 200, y: r.bottom + 4 });
  }, [head.id, onMenu]);

  return (
    <div className="tree-node">
      <div
        className={'tree-row lvl-head' + (selected ? ' selected' : '')}
        onClick={() => onSelect(head.id)}
        role="treeitem"
        aria-expanded={expanded}
        aria-selected={selected}
      >
        <button
          className={'chev' + (expanded ? ' open' : '')}
          onClick={(e) => { e.stopPropagation(); onToggle(head.id); }}
          style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          <Icon name="chevron-right" size={12}/>
        </button>
        <span className={'head-icon' + (head.active ? '' : ' inactive')}>
          <Icon name="folder" size={11} color="#fff" strokeWidth={2.2}/>
        </span>
        <span className="tree-name" title={head.name}>{head.name}</span>
        <span className="tree-badge">{activeSubheads}/{head.subheads.length}</span>
        <button className="menu-btn" onClick={onMenuClick} aria-label="More actions">
          <Icon name="more-horizontal" size={14}/>
        </button>
      </div>
      <div className={'tree-children' + (expanded ? ' open' : '')}>
        {head.subheads.map(sub => (
          <SubheadNodeFull
            key={sub.id}
            subSummary={sub}
            expanded={expandedSubheads.has(sub.id)}
            loadingChildren={loadingSubheads.has(sub.id)}
            onToggle={onToggleSubhead}
            selected={selectedNode && selectedNode.type === 'subhead' && selectedNode.id === sub.id}
            selectedNode={selectedNode}
            onSelect={(id) => onSelect(id, 'subhead')}
            onSelectConfigure={(id) => onSelect(id, 'configure')}
            onMenu={onMenu}
          />
        ))}
      </div>
    </div>
  );
}
