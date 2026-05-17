'use client';
import { useCountUp } from './CountUp';
import { formatINRCompact } from '@/services/mocks/utils';

export default function CountUpCurrency({ value }) {
  const display = useCountUp(value, 600, formatINRCompact);
  return <>{display}</>;
}
