'use client';

export interface ReportKpiItem {
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  subColor?: 'up' | 'down' | 'neutral';
}

interface Props {
  items: ReportKpiItem[];
  loading: boolean;
}

export default function ReportKpiRow({ items, loading }: Props) {
  return (
    <div className="dq-grid" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((item) => (
        <div className="dq-stat-card" key={item.label}>
          <div className="dq-stat-label">{item.label}</div>
          {loading ? (
            <div className="dq-skeleton-line" style={{ width: '60%', height: 22, marginBottom: 6 }} />
          ) : (
            <div className="dq-stat-value">{item.value}</div>
          )}
          {!loading && <div className={'dq-stat-sub dq-stat-sub-' + (item.subColor ?? 'neutral')}>{item.sub}</div>}
        </div>
      ))}
    </div>
  );
}
