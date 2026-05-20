'use client';
import Icon from 'wynta-react-common/components/Icon';
import type { Player, Segment } from '@/types';

interface PromoCodeResult {
  id: string | number;
  code: string;
}

interface ConfigResult {
  id: number;
  name: string;
}

export interface SearchResultItem {
  kind: 'player' | 'segment' | 'code' | 'head' | 'subhead' | 'configure';
  payload: Player | Segment | PromoCodeResult | ConfigResult;
  parentId?: number;
  parentName?: string;
  crumb?: string;
}

interface SearchResultRowProps {
  item: SearchResultItem;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
}

function _initials(name: string): string {
  return name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
}

export default function SearchResultRow({ item, active, onHover, onClick }: SearchResultRowProps) {
  const cls = 'gp-pop-item' + (active ? ' active' : '');

  if (item.kind === 'player') {
    const p = item.payload as Player;
    return (
      <div className={cls} onMouseEnter={onHover} onClick={onClick}>
        <span className="avatar">{_initials(p.name)}</span>
        <div className="ident">
          <div className="name">{p.name}</div>
          <div className="sub">{p.email} · {p.state}</div>
        </div>
        <span className="pid">#{p.id}</span>
      </div>
    );
  }

  if (item.kind === 'segment') {
    const s = item.payload as Segment;
    return (
      <div className={cls} onMouseEnter={onHover} onClick={onClick}>
        <span className="gp-mark seg"><Icon name="users" size={13}/></span>
        <div className="ident">
          <div className="name">{s.label}</div>
          <div className="sub">{s.hint}</div>
        </div>
        <span className="pid">{s.count.toLocaleString('en-IN')}</span>
      </div>
    );
  }

  if (item.kind === 'code') {
    const code = item.payload as PromoCodeResult;
    return (
      <div className={cls} onMouseEnter={onHover} onClick={onClick}>
        <span className="gp-mark code"><Icon name="ticket" size={13}/></span>
        <div className="ident">
          <div className="name" style={{ fontFamily: 'var(--mono)' }}>{code.code}</div>
          <div className="sub">{item.parentName}</div>
        </div>
        <span className="pid">Configure #{item.parentId}</span>
      </div>
    );
  }

  if (item.kind === 'head' || item.kind === 'subhead' || item.kind === 'configure') {
    const cfg = item.payload as ConfigResult;
    const icon = item.kind === 'head' ? 'folder' : item.kind === 'subhead' ? 'layers' : 'sliders-horizontal';
    return (
      <div className={cls} onMouseEnter={onHover} onClick={onClick}>
        <span className="gp-mark cfg"><Icon name={icon} size={13}/></span>
        <div className="ident">
          <div className="name">{cfg.name}</div>
          <div className="sub">{item.crumb}</div>
        </div>
        <span className="pid" style={{ textTransform: 'capitalize' }}>{item.kind}</span>
      </div>
    );
  }

  return null;
}
