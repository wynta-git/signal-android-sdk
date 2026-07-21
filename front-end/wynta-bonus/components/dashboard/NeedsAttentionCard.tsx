'use client';
import Icon from 'wynta-react-common/components/Icon';
import type { BonusDashboardAlertsResponse } from '../../types';

interface Props {
  data: BonusDashboardAlertsResponse | null;
  loading: boolean;
}

export default function NeedsAttentionCard({ data, loading }: Props) {
  const alerts = data?.alerts ?? [];
  return (
    <div className="dq-card">
      <div className="dq-card-header">
        Needs Attention
        {!loading && alerts.length > 0 && <span className="dq-alert-count">{alerts.length} alerts</span>}
      </div>
      <div className="dq-alert-list">
        {loading &&
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="dq-skeleton-line" style={{ height: 40, marginBottom: 8 }} />
          ))}
        {!loading && alerts.length === 0 && <div className="dq-empty-cell">Nothing needs attention right now</div>}
        {!loading && alerts.map((a, i) => (
          <div className={'dq-alert-row dq-alert-' + a.severity} key={i}>
            <span className="dq-alert-icon">
              <Icon name={a.severity === 'critical' ? 'alert-circle' : 'alert-triangle'} size={16} strokeWidth={2} />
            </span>
            <div>
              <div className="dq-alert-title">{a.title}</div>
              <div className="dq-alert-subtitle">{a.subtitle}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
