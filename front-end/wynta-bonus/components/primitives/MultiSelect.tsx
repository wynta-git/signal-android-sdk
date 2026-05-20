'use client';
import { useState, useEffect, useRef } from 'react';
import Icon from './Icon';

interface MultiSelectProps {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}

export default function MultiSelect({ options, value, onChange }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);
  const toggle = (o: string) => {
    const has = value.includes(o);
    onChange(has ? value.filter(x => x !== o) : [...value, o]);
  };
  const summary = value.length === 0 ? 'Select…' : value.length === 1 ? value[0] : `${value.length} selected`;
  return (
    <div className="rule-multi" ref={ref}>
      <button type="button" className="rule-multi-trigger" onClick={() => setOpen(o => !o)}>
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
        <Icon name="chevron-down" size={12} color="var(--g400)"/>
      </button>
      {open && (
        <div className="rule-multi-menu">
          {options.map(o => (
            <label key={o} className={'rule-multi-item' + (value.includes(o) ? ' on' : '')}>
              <input type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)}/>
              <span>{o}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
