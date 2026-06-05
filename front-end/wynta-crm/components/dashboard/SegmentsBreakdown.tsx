'use client';
import { useAppSelector } from '../../store/hooks';
import { selectDashboardSummary, selectDashboardStatus } from '../../store/slices/dashboardSlice';

const DONUT_COLORS = ['#0091e0', '#10b981', '#f59e0b', '#ef4444'];
const DONUT_LABELS = ['New', 'Healthy', 'At Risk', 'Churned'];

function fmt(n: number | undefined | null): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function DonutChart({ values, colors, size = 140, stroke = 26 }: {
  values: number[];
  colors: string[];
  size?: number;
  stroke?: number;
}) {
  const total = values.reduce((a, b) => a + b, 0);
  if (total === 0) return <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--g100)' }} />;

  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;

  let offset = 0;
  const slices = values.map((v, i) => {
    const pct = v / total;
    const dash = pct * circ;
    const gap  = circ - dash;
    const slice = (
      <circle
        key={i}
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={colors[i]}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${gap}`}
        strokeDashoffset={-offset * circ / total * circ / circ}
        style={{ transform: `rotate(${offset * 360 / total - 90}deg)`, transformOrigin: `${cx}px ${cy}px` }}
      />
    );
    offset += v;
    return slice;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize={11} fill="var(--crm-fg4)">Total</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--crm-fg1)">
        {fmt(total)}
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

  const values = health
    ? [health.new, health.healthy, health.at_risk, health.churned]
    : [];

  return (
    <div style={{
      background: 'var(--crm-white)', border: '1px solid var(--crm-border)',
      borderRadius: 6, padding: '16px 20px',
    }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--crm-fg1)' }}>Segments Breakdown</h2>
      </div>

      {loading && (
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ width: 140, height: 140, borderRadius: '50%', background: 'var(--g100)' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ height: 20, background: 'var(--g100)', borderRadius: 4 }} />
            ))}
          </div>
        </div>
      )}

      {!loading && !health && (
        <p style={{ fontSize: 12, color: 'var(--crm-fg4)', textAlign: 'center', padding: '20px 0' }}>
          No breakdown data available
        </p>
      )}

      {!loading && health && (
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <DonutChart values={values} colors={DONUT_COLORS} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {DONUT_LABELS.map((label, i) => {
              const count = values[i];
              const total = health.total;
              const pct = total > 0 ? (count / total * 100).toFixed(1) : '0.0';
              return (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: DONUT_COLORS[i], flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--crm-fg3)', flex: 1 }}>{label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--crm-fg1)' }}>{fmt(count)}</span>
                  <span style={{ fontSize: 11, color: 'var(--crm-fg4)', minWidth: 36, textAlign: 'right' }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Channel opt-in counts */}
      {!loading && optin && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--crm-border)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--crm-fg4)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Channel Opt-ins
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            {(Object.entries(optin) as [string, { opted_in: number; total: number }][]).map(([ch, v]) => {
              const pct = v.total > 0 ? (v.opted_in / v.total * 100).toFixed(0) : '0';
              return (
                <div key={ch} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--crm-fg1)' }}>{fmt(v.opted_in)}</div>
                  <div style={{ fontSize: 10, color: 'var(--crm-fg4)', marginTop: 1 }}>{ch.toUpperCase()} · {pct}%</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
