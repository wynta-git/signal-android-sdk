'use client';
import { memo, useCallback } from 'react';
import Icon from 'wynta-react-common/components/Icon';
import type { BonusConfigure, NodeType } from '../../types';

interface MenuEvent {
  type: NodeType;
  id: number;
  x: number;
  y: number;
}

interface ConfigureNodeProps {
  cfg: BonusConfigure;
  selected: boolean | null;
  onSelect: (id: number) => void;
  onMenu: (evt: MenuEvent) => void;
}

const ConfigureNode = memo(function ConfigureNode({ cfg, selected, onSelect, onMenu }: ConfigureNodeProps) {
  const onClick = useCallback(() => onSelect(cfg.id), [cfg.id, onSelect]);
  const onMenuClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    onMenu({ type: 'configure', id: cfg.id, x: r.right - 200, y: r.bottom + 4 });
  }, [cfg.id, onMenu]);
  return (
    <div
      className={'tree-row lvl-config' + (selected ? ' selected' : '')}
      onClick={onClick}
      role="treeitem"
      aria-selected={selected ?? undefined}
    >
      <span className="chev placeholder">·</span>
      <span className={'conf-dot ' + (cfg.active ? 'active' : 'inactive')} />
      <span className="tree-name" title={cfg.name}>{cfg.name}</span>
      <span className={'freq-pill ' + cfg.applicability_frequency}>{cfg.applicability_frequency}</span>
      <button className="menu-btn" onClick={onMenuClick} aria-label="More actions">
        <Icon name="more-horizontal" size={14}/>
      </button>
    </div>
  );
});

export default ConfigureNode;
