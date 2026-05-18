'use client';
import { useState, useEffect, useRef } from 'react';

export function useCountUp(
  target: number,
  duration = 600,
  formatter: (n: number) => string | number = (n) => Math.round(n),
): string | number {
  const [value, setValue] = useState(0);
  const startedRef = useRef(false);
  useEffect(() => {
    if (!isFinite(target)) { setValue(target); return; }
    startedRef.current = true;
    const start = performance.now();
    let raf: number;
    const tick = (t: number) => {
      const elapsed = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - elapsed, 3);
      setValue(target * e);
      if (elapsed < 1) raf = requestAnimationFrame(tick);
      else setValue(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return formatter(value);
}

interface CountUpProps {
  value: number;
  duration?: number;
  format?: (n: number) => string | number;
}

export default function CountUp({ value, duration = 600, format }: CountUpProps) {
  const display = useCountUp(value, duration, format || ((n) => Math.round(n).toLocaleString('en-IN')));
  return <>{display}</>;
}
