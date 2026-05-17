'use client';
import { useState, useRef, useEffect } from 'react';
import Icon from '@/components/primitives/Icon';
import { BRANDS } from '@/services/mocks/constants';

export default function BrandSwitcher({ value, onChange, compact = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const brand = BRANDS.find(b => b.id === value) || BRANDS[0];

  useEffect(() => {
    if (!open) return;
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div className={'brand-switcher' + (compact ? ' compact' : '')} ref={ref}>
      {!compact && <div className="bs-label">Brand</div>}
      <button
        type="button"
        className={'bs-trigger' + (open ? ' open' : '')}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="bs-mono" style={{ background: brand.color }}>{brand.id}</span>
        <div className="bs-text">
          <span className="bs-name">{brand.name}</span>
          <span className="bs-site">{brand.site_id}</span>
        </div>
        <Icon name="chevrons-up-down" size={14} color="var(--g400)"/>
      </button>
      {open && (
        <div className="bs-menu" role="listbox">
          {BRANDS.map(b => (
            <div
              key={b.id}
              role="option"
              aria-selected={b.id === brand.id}
              className={'bs-item' + (b.id === brand.id ? ' active' : '')}
              onClick={() => { onChange(b.id); setOpen(false); }}
            >
              <span className="bs-mono" style={{ background: b.color }}>{b.id}</span>
              <div className="bs-text">
                <span className="bs-name">{b.name}</span>
                <span className="bs-site">{b.site_id}</span>
              </div>
              {b.id === brand.id && <Icon name="check" size={14} color="var(--blue)" strokeWidth={2.4}/>}
            </div>
          ))}
          <div className="bs-sep"/>
          <div className="bs-item ghost">
            <Icon name="plus" size={13} color="var(--g500)"/>
            <span style={{ fontSize: 12, color: 'var(--g500)' }}>Add brand…</span>
          </div>
        </div>
      )}
    </div>
  );
}
