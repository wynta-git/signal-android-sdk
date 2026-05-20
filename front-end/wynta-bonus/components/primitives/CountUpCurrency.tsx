'use client';
import { useCountUp } from 'wynta-react-common/components/CountUp';
import { formatINRCompact } from '../../services/mocks/utils';

interface CountUpCurrencyProps {
  value: number;
}

export default function CountUpCurrency({ value }: CountUpCurrencyProps) {
  const display = useCountUp(value, 600, formatINRCompact);
  return <>{display}</>;
}
