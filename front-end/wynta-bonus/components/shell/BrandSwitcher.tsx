'use client';
import { useState, useRef, useEffect } from 'react';
import { useAppSelector } from '@/store/hooks';
import { selectAllBrands } from '@/store/slices/brandsSlice';
import Icon from 'wynta-react-common/components/Icon';

interface BrandSwitcherProps {
  value: number | null;
  onChange: (siteId: number) => void;
  compact?: boolean;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

export default function BrandSwitcher({ value, onChange, compact = false }: BrandSwitcherProps) {
  const brands = useAppSelector(selectAllBrands);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const brand = brands.find(b => b.site_id === value) || brands[0];

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  if (!brand) return null;

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
        <span className="bs-mono" style={{ background: brand.color }}>{initials(brand.name)}</span>
        <div className="bs-text">
          <span className="bs-name">{brand.name}</span>
          <span className="bs-site">{brand.description}</span>
        </div>
        <Icon name="chevrons-up-down" size={14} color="var(--g400)"/>
      </button>
      {open && (
        <div className="bs-menu" role="listbox">
          {brands.map(b => (
            <div
              key={b.site_id}
              role="option"
              aria-selected={b.site_id === brand.site_id}
              className={'bs-item' + (b.site_id === brand.site_id ? ' active' : '')}
              onClick={() => { onChange(b.site_id); setOpen(false); }}
            >
              <span className="bs-mono" style={{ background: b.color }}>{initials(b.name)}</span>
              <div className="bs-text">
                <span className="bs-name">{b.name}</span>
                <span className="bs-site">{b.description}</span>
              </div>
              {b.site_id === brand.site_id && <Icon name="check" size={14} color="var(--blue)" strokeWidth={2.4}/>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
