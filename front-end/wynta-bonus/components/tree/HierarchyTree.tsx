'use client';
import HeadNode from './HeadNode';
import PlayerSegmentsPanel from '@/components/segments/PlayerSegmentsPanel';
import Icon from 'wynta-react-common/components/Icon';
import type { BonusHead, SelectedNode, NodeType } from '@/types';

interface MenuEvent {
  type: NodeType;
  id: number;
  x: number;
  y: number;
}

interface HierarchyTreeProps {
  heads: BonusHead[];
  expandedHeads: Set<number>;
  expandedSubheads: Set<number>;
  selectedNode: SelectedNode | null;
  loadingSubheads: Set<number>;
  onSelectNode: (node: SelectedNode) => void;
  onToggleHead: (id: number) => void;
  onToggleSubhead: (id: number) => void;
  onAddHead: () => void;
  onMenu: (evt: MenuEvent) => void;
  selectedBrand: number | null;
  onBrandChange?: (brand: number) => void;
}

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
}: HierarchyTreeProps) {
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
