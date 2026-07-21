'use client';
import { formatINRCompact } from '../../services/mocks/utils';
import type { BonusDashboardSummary } from '../../types';

interface Props {
  summary: BonusDashboardSummary | null;
  loading: boolean;
}

interface StageBox {
  label: string;
  amount: number;
  pct: number;
  hint: string;
  colorClass: string;
}

function Box({ box, loading }: { box: StageBox; loading: boolean }) {
  return (
    <div className="dq-lc-box">
      <div className="dq-lc-box-label">{box.label}</div>
      {loading ? (
        <div className="dq-skeleton-line" style={{ width: '70%', height: 20 }} />
      ) : (
        <>
          <div className="dq-lc-box-value">{formatINRCompact(box.amount)}</div>
          <div className="dq-lc-box-sub">
            <span className={'dq-dot ' + box.colorClass} /> {box.pct.toFixed(0)}% <span className="dq-lc-box-hint">{box.hint}</span>
          </div>
          <div className="dq-lc-box-bar"><div className={box.colorClass} style={{ width: Math.min(100, box.pct) + '%' }} /></div>
        </>
      )}
    </div>
  );
}

export default function BonusLifecycleFunnel({ summary, loading }: Props) {
  const s = summary;
  const issued: StageBox = {
    label: 'Credited', amount: s?.monthly_granted ?? 0, pct: 100, hint: '', colorClass: 'released',
  };
  const released: StageBox = {
    label: 'Released', amount: s?.monthly_released ?? 0, pct: s?.released_pct ?? 0,
    hint: 'wagering complete', colorClass: 'released',
  };
  const pending: StageBox = {
    label: 'Pending', amount: s?.monthly_pending ?? 0, pct: s?.pending_pct ?? 0,
    hint: 'still wagering', colorClass: 'pending',
  };
  const consumed: StageBox = {
    label: 'Consumed', amount: s?.monthly_consumed ?? 0, pct: s?.consumed_pct ?? 0,
    hint: 'of credited', colorClass: 'consumed',
  };
  const expired: StageBox = {
    label: 'Expired', amount: s?.monthly_expiring ?? 0, pct: s?.expiry_pct ?? 0,
    hint: 'lapsed', colorClass: 'expiring',
  };
  const forfeited: StageBox = {
    label: 'Forfeited', amount: s?.monthly_forfeit ?? 0, pct: s?.forfeit_pct ?? 0,
    hint: 'cancelled', colorClass: 'forfeit',
  };

  return (
    <div className="dq-card dq-lifecycle-card">
      <div className="dq-card-header">Bonus Lifecycle
        <span className="dq-lifecycle-hint">This month · flow of credited bonus value</span>
      </div>
      <div className="dq-lifecycle-groups">
        <div className="dq-lc-group">
          <div className="dq-lc-group-label">ISSUED</div>
          <div className="dq-lc-group-boxes"><Box box={issued} loading={loading} /></div>
        </div>
        <div className="dq-lc-arrow">→</div>
        <div className="dq-lc-group">
          <div className="dq-lc-group-label">IN SYSTEM</div>
          <div className="dq-lc-group-boxes">
            <Box box={released} loading={loading} />
            <Box box={pending} loading={loading} />
          </div>
        </div>
        <div className="dq-lc-arrow">→</div>
        <div className="dq-lc-group">
          <div className="dq-lc-group-label">OUTCOMES</div>
          <div className="dq-lc-group-boxes">
            <Box box={consumed} loading={loading} />
            <Box box={expired} loading={loading} />
            <Box box={forfeited} loading={loading} />
          </div>
        </div>
      </div>
    </div>
  );
}
