'use client';

declare global {
  interface Window { __DJH_SLOT__?: string; }
}

export default function DjHeaderSlot() {
  return (
    <div
      id="dj-header-placeholder"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: typeof window !== 'undefined' ? (window.__DJH_SLOT__ ?? '') : '',
      }}
    />
  );
}
