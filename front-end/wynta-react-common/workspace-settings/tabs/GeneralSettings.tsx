'use client';
import { useState, useEffect } from 'react';
import { DEFAULT_WORKSPACE } from '../constants';
import type { WorkspaceInfo } from '../types';

interface TimezoneOption { value: string; label: string; }

const inputStyle: React.CSSProperties = {
  height: 36, padding: '0 10px',
  border: '1px solid #d1d5db', borderRadius: 4,
  fontSize: 13, color: '#374151', background: '#fff',
  outline: 'none', boxSizing: 'border-box',
};

const cardStyle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 400,
  lineHeight: 1.5,
  textAlign: 'left',
  fontFamily: 'sans-serif',
  color: '#525252',
  wordWrap: 'break-word',
  boxSizing: 'border-box',
  outline: 'none',
  marginBottom: '1.5rem',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: 24,
  background: '#fff',
};

export default function GeneralSettings() {
  const [info, setInfo]           = useState<WorkspaceInfo>(DEFAULT_WORKSPACE);
  const [saved, setSaved]         = useState(false);
  const [timezones, setTimezones] = useState<TimezoneOption[]>([]);
  const [tzLoading, setTzLoading] = useState(true);
  const [tzError, setTzError]     = useState(false);

  useEffect(() => {
    fetch('/api/v1/workspace/settings/general/', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        console.log('[GeneralSettings] API response:', data);
        const raw: unknown[] =
          data?.data?.timezones ??
          data?.data?.timezone_list ??
          data?.timezones ??
          data?.timezone_list ??
          (Array.isArray(data?.data) ? data.data : null) ??
          [];
        const tzList: TimezoneOption[] = raw.map((tz: unknown) =>
          typeof tz === 'string'
            ? { value: tz, label: tz }
            : (tz as TimezoneOption)
        );
        if (tzList.length > 0) {
          setTimezones(tzList);
          const utc = tzList.find(tz => tz.value === 'UTC') ?? tzList[0];
          setInfo(v => ({ ...v, timezone: utc.value }));
        }
      })
      .catch((err) => { console.error('[GeneralSettings] fetch error:', err); setTzError(true); })
      .finally(() => setTzLoading(false));
  }, []);

  function handleSubmit() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div style={{ paddingTop: 24, display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Avatar + Workspace Logo row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Avatar */}
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 18 }}>Avatar</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: '#0091E0', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, fontWeight: 700, letterSpacing: -1,
            }}>
              WE
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginTop: 4 }}>Webby Gomes</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>webtest@gmail.com</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <label style={{
              padding: '4px 10px',
              border: '1px solid #d1d5db', borderRadius: 4,
              fontSize: 12, color: '#374151', cursor: 'pointer', background: '#fff',
            }}>
              Choose File
              <input type="file" style={{ display: 'none' }} accept="image/png,image/jpeg" />
            </label>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>no file selected</span>
          </div>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: '6px 0 0', lineHeight: 1.5 }}>
            Recommended: square image, at least 200×200px. PNG or JPG.
          </p>
        </div>

        {/* Workspace Logo */}
        <div style={cardStyle}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 18 }}>Workspace Logo</div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: '#0091E0', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, fontWeight: 700,
            }}>
              D
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0091E0', marginTop: 4 }}>Demo Affiliates</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>Current workspace logo</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <label style={{
              padding: '4px 10px',
              border: '1px solid #d1d5db', borderRadius: 4,
              fontSize: 12, color: '#374151', cursor: 'pointer', background: '#fff',
            }}>
              Choose File
              <input type="file" style={{ display: 'none' }} accept="image/png,image/jpeg" />
            </label>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>no file selected</span>
          </div>
          <p style={{ fontSize: 11, color: '#9ca3af', margin: '6px 0 0', lineHeight: 1.5 }}>
            Please refrain from uploading logos that are white in colour.
          </p>
        </div>
      </div>

      {/* Timezone */}
      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 16 }}>Timezone</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <label style={{ fontSize: 13, color: '#374151', minWidth: 140, flexShrink: 0 }}>Default timezone</label>
          <select
            value={info.timezone}
            onChange={e => setInfo(v => ({ ...v, timezone: e.target.value }))}
            disabled={tzLoading}
            style={{ ...inputStyle, flex: 1, maxWidth: 400, cursor: tzLoading ? 'not-allowed' : 'pointer', opacity: tzLoading ? 0.6 : 1 }}
          >
            {tzLoading && <option value="">Loading timezones…</option>}
            {tzError  && <option value="">Failed to load timezones</option>}
            {timezones.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Submit */}
      <div style={{
        marginTop: 'auto',
        display: 'flex', flexWrap: 'wrap', alignItems: 'stretch',
        width: '100%', height: 65,
        background: '#ffffff',
        border: '0.0625rem solid rgba(231, 234, 243, 0.7)',
        borderBottom: 'none', borderLeft: 'none',
      }}>
        <span style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 24 }}>
          <button
            type="button"
            onClick={handleSubmit}
            style={{
              height: 40, padding: '0 32px',
              background: saved ? '#10b981' : '#0091E0',
              color: '#fff', border: 'none', borderRadius: 4,
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'background 0.2s',
            }}
          >
            {saved ? 'SAVED' : 'SUBMIT'}
            {!saved && <span style={{ fontSize: 16, lineHeight: 1 }}>»</span>}
          </button>
        </span>
      </div>

    </div>
  );
}
