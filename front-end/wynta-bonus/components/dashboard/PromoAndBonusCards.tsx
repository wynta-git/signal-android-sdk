'use client';
import Icon from 'wynta-react-common/components/Icon';
import CountUp from 'wynta-react-common/components/CountUp';
import { formatINRCompact } from '../../services/mocks/utils';
import type { BonusDashboardSummary } from '../../types';

interface Props {
  summary: BonusDashboardSummary | null;
  loading: boolean;
}

function Sparkline({ points }: { points: number[] }) {
  if (!points || points.length < 2) return <span className="dq-sparkline-empty">—</span>;
  const w = 90, h = 28;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const step = w / (points.length - 1);
  const pts = points.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(' ');
  return (
    <svg width={w} height={h} className="dq-sparkline">
      <polyline points={pts} fill="none" stroke="var(--ok)" strokeWidth={1.8} />
    </svg>
  );
}

export default function PromoAndBonusCards({ summary, loading }: Props) {
  const s = summary;
  const trendCounts = (s?.promo_codes_trend ?? []).map((p) => p.count);

  const granted = s?.monthly_granted ?? 0;
  const limit = s?.monthly_limit ?? 0;
  const pct = s?.monthly_pct ?? 0;

  return (
    <div className="dq-cards-row">
      <div className="dq-card">
        <div className="dq-card-header">
          <span className="dq-card-icon"><Icon name="ticket" size={14} strokeWidth={2} /></span>
          Total Active Promo Codes
        </div>
        {loading ? (
          <div className="dq-skeleton-line" style={{ width: '40%', height: 30 }} />
        ) : (
          <div className="dq-promo-row">
            <div className="dq-promo-left">
              <div className="dq-promo-number"><CountUp value={s?.active_promo_codes ?? 0} /></div>
              <div className="dq-promo-sub">↗ +{s?.promo_codes_created_this_period ?? 0} this week</div>
              <div className="dq-promo-pills">
                <span className="kpi-pill"><span className="kpi-pill-n">{s?.active_heads ?? 0}</span> Heads</span>
                <span className="kpi-pill"><span className="kpi-pill-n">{s?.active_subheads ?? 0}</span> Subheads</span>
              </div>
            </div>
            <Sparkline points={trendCounts} />
          </div>
        )}
      </div>

      <div className="dq-card dq-card-wide">
        <div className="dq-card-header">
          <span className="dq-card-icon"><Icon name="wallet" size={14} strokeWidth={2} /></span>
          Total Monthly Bonus
        </div>
        {loading ? (
          <div className="dq-skeleton-line" style={{ width: '50%', height: 30 }} />
        ) : (
          <>
            <div className="dq-bonus-head">
              <div className="dq-bonus-number">{formatINRCompact(granted)}</div>
              <div className="dq-bonus-of">of {formatINRCompact(limit)} · {pct.toFixed(0)}% budget</div>
            </div>
            <div className="dq-bonus-progress"><div style={{ width: Math.min(100, pct) + '%' }} /></div>
            <div className="dq-bonus-breakdown">
              <div className="dq-bonus-stat">
                <span className="dq-dot released" /> Released · {(s?.released_pct ?? 0).toFixed(0)}%
                <div className="dq-bonus-stat-value">{formatINRCompact(s?.monthly_released ?? 0)}</div>
              </div>
              <div className="dq-bonus-stat">
                <span className="dq-dot pending" /> Pending · {(s?.pending_pct ?? 0).toFixed(0)}%
                <div className="dq-bonus-stat-value">{formatINRCompact(s?.monthly_pending ?? 0)}</div>
              </div>
              <div className="dq-bonus-stat">
                <span className="dq-dot expiring" /> Expired · {(s?.expiry_pct ?? 0).toFixed(0)}%
                <div className="dq-bonus-stat-value">{formatINRCompact(s?.monthly_expiring ?? 0)}</div>
              </div>
              <div className="dq-bonus-stat">
                <span className="dq-dot forfeit" /> Forfeited · {(s?.forfeit_pct ?? 0).toFixed(0)}%
                <div className="dq-bonus-stat-value">{formatINRCompact(s?.monthly_forfeit ?? 0)}</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
