'use client';
import { formatINRCompact } from '../../services/mocks/utils';
import type { BonusDashboardActivityResponse } from '../../types';

interface Props {
  data: BonusDashboardActivityResponse | null;
  loading: boolean;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!isFinite(then)) return '—';
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function initials(userId: string): string {
  return userId.slice(0, 2).toUpperCase();
}

function describe(eventType: string): string {
  if (eventType === 'CREDITED') return 'Bonus credited —';
  if (eventType === 'EXPIRED') return 'Bonus expired —';
  if (eventType === 'FORFEITED') return 'Bonus forfeited —';
  return 'Bonus updated —';
}

export default function RecentActivityFeed({ data, loading }: Props) {
  return (
    <div className="dq-card">
      <div className="dq-card-header">
        Recent Activity
        <span className="dq-lifecycle-hint">Last 2 hours</span>
      </div>
      <div className="dq-activity-list">
        {loading &&
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="dq-activity-row">
              <div className="dq-skeleton-line dq-avatar-skeleton" />
              <div className="dq-skeleton-line" style={{ flex: 1, height: 14 }} />
            </div>
          ))}
        {!loading && (!data || data.activities.length === 0) && (
          <div className="dq-empty-cell">No recent activity</div>
        )}
        {!loading && data?.activities.map((a, i) => (
          <div className="dq-activity-row" key={i}>
            <div className={'dq-avatar dq-avatar-' + a.event_type.toLowerCase()}>{initials(a.pam_user_id)}</div>
            <div className="dq-activity-body">
              <span>{describe(a.event_type)} <span className="dq-activity-link">{a.configure_name}</span> for {formatINRCompact(a.amount)}</span>
              <div className="dq-activity-time">{timeAgo(a.occurred_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
