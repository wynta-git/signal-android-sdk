'use client';
import { useEffect, useRef } from 'react';

declare global {
  interface Window { __DJH_SIDEBAR__?: string; }
}

interface Props {
  onNavChange?: (id: string) => void;
  activeNav?: string;
}

export default function DjSidebarSlot({ onNavChange, activeNav }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Attach click handlers to Django-rendered nav items after hydration
  useEffect(() => {
    if (!ref.current || !onNavChange) return;
    const items = ref.current.querySelectorAll<HTMLElement>('[data-dj-nav-id]');
    const cleanups: Array<() => void> = [];
    items.forEach(el => {
      const id = el.getAttribute('data-dj-nav-id')!;
      const handler = () => onNavChange(id);
      el.addEventListener('click', handler);
      cleanups.push(() => el.removeEventListener('click', handler));
    });
    return () => cleanups.forEach(fn => fn());
  }, [onNavChange]);

  // Sync active class when React state changes
  useEffect(() => {
    if (!ref.current || !activeNav) return;
    ref.current.querySelectorAll<HTMLElement>('[data-dj-nav-id]').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-dj-nav-id') === activeNav);
    });
  }, [activeNav]);

  return (
    <div
      id="dj-sidebar-placeholder"
      ref={ref}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: typeof window !== 'undefined' ? (window.__DJH_SIDEBAR__ ?? '') : '',
      }}
    />
  );
}
