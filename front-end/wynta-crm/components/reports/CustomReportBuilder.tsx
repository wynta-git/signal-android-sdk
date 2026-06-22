'use client';
import { useState, useEffect } from 'react';
import { getToken } from 'wynta-react-common/services/tokenRegistry';
import type { ReportFilters, DateRange } from '../../services/reportsApi';

const SEG_BASE = process.env.NEXT_PUBLIC_SEGMENTATION_API_URL || 'http://3.7.48.14:8003';

interface SegmentOption { segment_id: string; name: string; }

export const ALL_METRICS: { key: string; label: string }[] = [
  { key: 'messages_sent',      label: 'Messages Sent'      },
  { key: 'open_rate',          label: 'Open Rate'          },
  { key: 'ctr',                label: 'Click-through Rate' },
  { key: 'conversions',        label: 'Conversions'        },
  { key: 'conversion_rate',    label: 'Conversion Rate'    },
  { key: 'revenue_influenced', label: 'Revenue Influenced' },
  { key: 'delivery_rate',      label: 'Delivery Rate'      },
  { key: 'bounce_rate',        label: 'Bounce Rate'        },
  { key: 'opt_out_rate',       label: 'Opt-out Rate'       },
  { key: 'segment_size',       label: 'Segment Size'       },
  { key: 'segment_growth',     label: 'Segment Growth'     },
  { key: 'player_health_score',label: 'Player Health Score'},
  { key: 'churn_rate',         label: 'Churn Rate'         },
  { key: 'win_back_rate',      label: 'Win-back Rate'      },
  { key: 'avg_deposits',       label: 'Avg Deposits'       },
  { key: 'active_users',       label: 'Active Users'       },
];

interface Props {
  onSave:   (name: string, metrics: string[], filters: ReportFilters) => void;
  onCancel: () => void;
  saving?:  boolean;
  error?:   string | null;
}

const DEFAULT_FILTERS: ReportFilters = {
  date_range: 'last_7_days',
  channel:    'all',
  segment_id: null,
};

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  last_7_days:  'Last 7 days',
  last_30_days: 'Last 30 days',
  last_90_days: 'Last 90 days',
};

export default function CustomReportBuilder({ onSave, onCancel, saving, error }: Props) {
  const [name,     setName]     = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters,  setFilters]  = useState<ReportFilters>(DEFAULT_FILTERS);
  const [segments, setSegments] = useState<SegmentOption[]>([]);

  useEffect(() => {
    fetch(`${SEG_BASE}/api/v1/segment/segments`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.ok ? r.json() : [])
      .then((data: SegmentOption[]) => setSegments(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  function toggleMetric(key: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function handleSave() {
    if (!name.trim() || selected.size === 0) return;
    const orderedMetrics = ALL_METRICS.map(m => m.key).filter(k => selected.has(k));
    onSave(name.trim(), orderedMetrics, filters);
  }

  const canSave = name.trim().length > 0 && selected.size > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--crm-bg)' }}>
      {/* Header */}
      <div style={{ padding: '20px 28px 16px', borderBottom: '1px solid var(--crm-border)', background: 'var(--crm-white)' }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--crm-fg3)', fontSize: 13, padding: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
          ‹ Back
        </button>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--crm-fg1)' }}>Custom Report</div>
        <div style={{ fontSize: 13, color: 'var(--crm-fg3)', marginTop: 2 }}>Choose your metrics, filters and save</div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, padding: 24, overflow: 'auto' }}>

        {/* Left — Report Details */}
        <div style={{ background: 'var(--crm-white)', border: '1px solid var(--crm-border)', borderRadius: 10, padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--crm-fg1)' }}>Report Details</div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--crm-fg3)', display: 'block', marginBottom: 6 }}>Report Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Weekly VIP Campaign Summary"
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--crm-border)', borderRadius: 7, fontSize: 13, color: 'var(--crm-fg1)', outline: 'none', background: 'var(--crm-white)' }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--crm-fg3)', display: 'block', marginBottom: 6 }}>Date Range</label>
            <select
              value={filters.date_range}
              onChange={e => setFilters(f => ({ ...f, date_range: e.target.value as DateRange }))}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--crm-border)', borderRadius: 7, fontSize: 13, color: 'var(--crm-fg1)', background: 'var(--crm-white)', cursor: 'pointer' }}
            >
              {(Object.keys(DATE_RANGE_LABELS) as DateRange[]).map(k => (
                <option key={k} value={k}>{DATE_RANGE_LABELS[k]}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--crm-fg3)', display: 'block', marginBottom: 6 }}>Channel Filter</label>
            <select
              value={filters.channel}
              onChange={e => setFilters(f => ({ ...f, channel: e.target.value }))}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--crm-border)', borderRadius: 7, fontSize: 13, color: 'var(--crm-fg1)', background: 'var(--crm-white)', cursor: 'pointer' }}
            >
              <option value="all">All Channels</option>
              <option value="push">Push</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="in_app">In-App</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--crm-fg3)', display: 'block', marginBottom: 6 }}>Segment Filter</label>
            <select
              value={filters.segment_id ?? ''}
              onChange={e => setFilters(f => ({ ...f, segment_id: e.target.value || null }))}
              style={{ width: '100%', padding: '9px 12px', border: '1px solid var(--crm-border)', borderRadius: 7, fontSize: 13, color: 'var(--crm-fg1)', background: 'var(--crm-white)', cursor: 'pointer' }}
            >
              <option value="">All Segments</option>
              {segments.map(s => (
                <option key={s.segment_id} value={s.segment_id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Right — Select Metrics */}
        <div style={{ background: 'var(--crm-white)', border: '1px solid var(--crm-border)', borderRadius: 10, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--crm-fg1)' }}>Select Metrics</div>
            <div style={{ fontSize: 12, color: 'var(--crm-fg3)' }}>{selected.size} selected</div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {ALL_METRICS.map(({ key, label }) => {
              const active = selected.has(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleMetric(key)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 20,
                    border: `1px solid ${active ? 'var(--crm-blue)' : 'var(--crm-border-md)'}`,
                    background: active ? 'var(--crm-blue)' : 'var(--crm-white)',
                    color: active ? '#fff' : 'var(--crm-fg2)',
                    fontSize: 13,
                    fontWeight: active ? 500 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '16px 28px', borderTop: '1px solid var(--crm-border)', background: 'var(--crm-white)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        {error ? (
          <span style={{ fontSize: 13, color: 'var(--crm-negative)' }}>⚠ {error}</span>
        ) : <span />}
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onCancel} style={{ padding: '8px 20px', borderRadius: 7, border: '1px solid var(--crm-border-md)', background: 'var(--crm-white)', color: 'var(--crm-fg2)', fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            style={{
              padding: '8px 20px', borderRadius: 7, border: 'none',
              background: canSave ? 'var(--crm-blue)' : 'var(--crm-border)',
              color: canSave ? '#fff' : 'var(--crm-fg4)',
              fontSize: 13, fontWeight: 500,
              cursor: canSave ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'Creating…' : 'Create Report'}
          </button>
        </div>
      </div>
    </div>
  );
}
