'use client';
import { useEffect, useRef } from 'react';
import Icon from './Icon';

interface ContextMenuItem {
  icon?: string;
  label: string;
  onClick?: () => void;
  sep?: boolean;
  danger?: boolean;
  shortcut?: string;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);
  const W = 200, H = 6 + items.length * 36 + 4;
  const left = Math.max(8, Math.min(window.innerWidth - W - 8, x));
  const top = Math.max(8, Math.min(window.innerHeight - H - 8, y));
  return (
    <div ref={ref} className="ctx-menu" style={{ left, top, minWidth: W }} role="menu">
      {items.map((it, i) => it.sep ? (
        <div key={i} className="sep" />
      ) : (
        <div
          key={i}
          className={'item' + (it.danger ? ' danger' : '')}
          onClick={() => { it.onClick && it.onClick(); onClose(); }}
          role="menuitem"
        >
          <Icon name={it.icon} size={14} />
          <span style={{ flex: 1 }}>{it.label}</span>
          {it.shortcut && (
            <span style={{ fontSize: 10, color: 'var(--g400)', fontFamily: 'var(--mono)' }}>{it.shortcut}</span>
          )}
        </div>
      ))}
    </div>
  );
}
