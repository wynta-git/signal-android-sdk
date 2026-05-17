'use client';
import HeadNode from './HeadNode';
import PlayerSegmentsPanel from '@/components/segments/PlayerSegmentsPanel';
import Icon from '@/components/primitives/Icon';

export default function HierarchyTree({
  heads,
  expandedHeads, expandedSubheads,
  selectedNode,
  loadingSubheads,
  onSelectNode,
  onToggleHead, onToggleSubhead,
  onAddHead,
  onMenu,
  selectedBrand,
  onBrandChange,
}) {
  return (
    <aside className="tree-panel" role="tree" aria-label="Bonus hierarchy">
      <div className="tree-header">
        <span className="title">Bonus Tree</span>
        <button className="ghost-btn" onClick={onAddHead}>
          <Icon name="plus" size={12} strokeWidth={2.4}/> Head
        </button>
      </div>
      <div className="tree-body">
        {heads.map(head => (
          <HeadNode
            key={head.id}
            head={head}
            expanded={expandedHeads.has(head.id)}
            onToggle={onToggleHead}
            selected={selectedNode && selectedNode.type === 'head' && selectedNode.id === head.id}
            onSelect={(id, type) => onSelectNode({ type: type || 'head', id })}
            expandedSubheads={expandedSubheads}
            loadingSubheads={loadingSubheads}
            onToggleSubhead={onToggleSubhead}
            selectedNode={selectedNode}
            onMenu={onMenu}
          />
        ))}
      </div>
      <PlayerSegmentsPanel/>
    </aside>
  );
}
