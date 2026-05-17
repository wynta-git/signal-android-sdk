'use client';
import Icon from '@/components/primitives/Icon';

function _initials(name) { return name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase(); }

export default function SearchResultRow({ item, active, onHover, onClick }) {
  const cls = 'gp-pop-item' + (active ? ' active' : '');

  if (item.kind === 'player') {
    const p = item.payload;
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
    const s = item.payload;
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
    return (
      <div className={cls} onMouseEnter={onHover} onClick={onClick}>
        <span className="gp-mark code"><Icon name="ticket" size={13}/></span>
        <div className="ident">
          <div className="name" style={{ fontFamily: 'var(--mono)' }}>{item.payload.code}</div>
          <div className="sub">{item.parentName}</div>
        </div>
        <span className="pid">Configure #{item.parentId}</span>
      </div>
    );
  }

  if (item.kind === 'head' || item.kind === 'subhead' || item.kind === 'configure') {
    const icon = item.kind === 'head' ? 'folder' : item.kind === 'subhead' ? 'layers' : 'sliders-horizontal';
    return (
      <div className={cls} onMouseEnter={onHover} onClick={onClick}>
        <span className="gp-mark cfg"><Icon name={icon} size={13}/></span>
        <div className="ident">
          <div className="name">{item.payload.name}</div>
          <div className="sub">{item.crumb}</div>
        </div>
        <span className="pid" style={{ textTransform: 'capitalize' }}>{item.kind}</span>
      </div>
    );
  }

  return null;
}
