'use client';
import { useAppSelector } from '../../store/hooks';
import { selectDashboardSummary, selectDashboardStatus } from '../../store/slices/dashboardSlice';

const SEGMENT_COLORS  = ['#10b981', '#f59e0b', '#ef4444', '#0091e0'];
const SEGMENT_LABELS  = ['Healthy', 'At-Risk', 'Churned', 'New'];

function fmt(n: number | undefined | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function DonutChart({ values, colors, totalUsers, size = 180, stroke = 30 }: {
  values: number[];
  colors: string[];
  totalUsers: number;
  size?: number;
  stroke?: number;
}) {
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum === 0) return <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--g100)' }} />;

  const r    = (size - stroke) / 2;
  const cx   = size / 2;
  const cy   = size / 2;
  const circ = 2 * Math.PI * r;

  let cumulative = 0;
  const slices = values.map((v, i) => {
    if (v === 0) { cumulative += v; return null; }
    const arcLen     = (v / sum) * circ;
    const startAngle = (cumulative / sum) * 360 - 90;
    cumulative += v;
    return (
      <circle
        key={i}
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={colors[i]}
        strokeWidth={stroke}
        strokeDasharray={`${arcLen} ${circ - arcLen}`}
        style={{ transform: `rotate(${startAngle}deg)`, transformOrigin: `${cx}px ${cy}px` }}
      />
    );
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={11} fill="var(--crm-fg4)">Total</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize={16} fontWeight={700} fill="var(--crm-fg1)">
        {fmt(totalUsers)}
      </text>
    </svg>
  );
}

export default function SegmentsBreakdown() {
  const summary = useAppSelector(selectDashboardSummary);
  const status  = useAppSelector(selectDashboardStatus);
  const loading = status.summary === 'loading';
  const health  = summary?.player_health;
  const optin   = summary?.channel_optin;

  // Order matches SEGMENT_LABELS: Healthy, At-Risk, Churned, New
  const values = health
    ? [health.healthy.count, health.at_risk.count, health.churned.count, health.new.count]
    : [];

  const sum = values.reduce((a, b) => a + b, 0);

  const optinCards = optin ? [
    { label: 'Opted-in to Push',     value: optin.push.count  },
    { label: 'Opted-in to Email',    value: optin.email.count },
    { label: 'Opted-in to SMS',      value: optin.sms.count   },
    { label: 'Opted-in to WhatsApp', value: 0                 },
  ] : [];

  return (
    <div style={{
      background: 'var(--crm-white)', border: '1px solid var(--crm-border)',
      borderRadius: 6, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ background: 'var(--crm-bg)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--crm-border)' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--crm-blue)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
          <path d="M22 12A10 10 0 0 0 12 2v10z" />
        </svg>
        <h2 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--crm-fg1)', margin: 0 }}>
          Player Segments Breakdown
        </h2>
      </div>

      {/* Chart + legend */}
      {loading && (
        <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 180, height: 180, borderRadius: '50%', background: 'var(--g100)' }} />
          <div style={{ width: 200, height: 14, background: 'var(--g100)', borderRadius: 4 }} />
        </div>
      )}

      {!loading && !health && (
        <p style={{ fontSize: 12, color: 'var(--crm-fg4)', textAlign: 'center', padding: '40px 0' }}>
          No breakdown data available
        </p>
      )}

      {!loading && health && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 20px 12px' }}>
          <DonutChart values={values} colors={SEGMENT_COLORS} totalUsers={health.total_users} />
          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', justifyContent: 'center', marginTop: 16 }}>
            {SEGMENT_LABELS.map((label, i) => {
              const count = values[i];
              const pct = sum > 0 ? (count / sum * 100).toFixed(0) : '0';
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: SEGMENT_COLORS[i], flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: 'var(--crm-fg3)' }}>
                    {label} ({pct}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Opt-in cards */}
      {!loading && optinCards.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
          margin: '0 14px 14px', paddingTop: 10,
          borderTop: '1px solid var(--crm-border)',
        }}>
          {optinCards.map(card => (
            <div key={card.label} style={{ background: 'var(--crm-bg)', borderRadius: 4, padding: '8px 10px' }}>
              <div style={{ fontSize: 10, color: 'var(--crm-fg3)', marginBottom: 2 }}>{card.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--crm-fg1)' }}>{fmt(card.value)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
