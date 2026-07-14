'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import Icon from '../../components/Icon';
import { DEFAULT_CONNECTORS } from '../constants';
import { getToken } from '../../services/tokenRegistry';
import type { Connector } from '../types';

// ── Email connector API (NEXT_PUBLIC_WYNTA_API_URL) ───────────────────────────
const API_BASE = process.env.NEXT_PUBLIC_WYNTA_API_URL ?? '';
const AUTH_HEADERS: Record<string, string> = process.env.NEXT_PUBLIC_WYNTA_API_TOKEN
  ? { Authorization: process.env.NEXT_PUBLIC_WYNTA_API_TOKEN }
  : {};

// ── Campaign-engine API (NEXT_PUBLIC_CAMPAIGN_API_URL) ────────────────────────
const CAMPAIGN_API_BASE = process.env.NEXT_PUBLIC_CAMPAIGN_API_URL || 'http://3.7.48.14:8004';
const PROJECT_ID        = process.env.NEXT_PUBLIC_PROJECT_ID || 'proj_demo';

function campaignHeaders(): Record<string, string> {
  const t = getToken();
  return t
    ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}
function campaignGetHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// Maps API current_provider → connector id
const PROVIDER_TO_ID: Record<string, string> = {
  gsuite:   'google-smtp',
  mailgun:  'mailgun',
  sendgrid: 'sendgrid-em',
  exchange: 'ms-exchange',
};

const FCM_BRAND_KEY = 'pam_fcm_brand_id';

type FilterType = 'all' | 'connected' | 'disconnected';

const CATEGORIES = ['Email', 'Push'] as const;
// TODO: Email connector UI is temporarily hidden until it's ready to ship.
const VISIBLE_CATEGORIES = CATEGORIES.filter(cat => cat !== 'Email');

/* ── Brand icons ─────────────────────────────────────────────────────────────── */
function ConnectorIcon({ connector }: { connector: Connector }) {
  const base: React.CSSProperties = {
    width: 40, height: 40, borderRadius: 8, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  if (connector.id === 'google-smtp') {
    return (
      <div style={{ ...base, background: '#fff', border: '1px solid #e5e7eb' }}>
        <svg width="20" height="20" viewBox="0 0 48 48">
          <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"/>
          <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"/>
          <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24c0 3.55.85 6.91 2.34 9.88l7.35-5.7z"/>
          <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"/>
        </svg>
      </div>
    );
  }

  if (connector.id === 'mailgun') {
    return (
      <div style={{ ...base, background: '#fff3e0', border: '1px solid #fed7aa' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#f97316" strokeWidth="2"/>
          <circle cx="12" cy="12" r="4" stroke="#f97316" strokeWidth="2"/>
          <circle cx="12" cy="12" r="1" fill="#f97316"/>
        </svg>
      </div>
    );
  }

  if (connector.id === 'sendgrid-em') {
    return (
      <div style={{ ...base, background: '#1a82e2' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="7" height="7" rx="1" fill="#fff"/>
          <rect x="14" y="3" width="7" height="7" rx="1" fill="rgba(255,255,255,0.5)"/>
          <rect x="3" y="14" width="7" height="7" rx="1" fill="rgba(255,255,255,0.5)"/>
          <rect x="14" y="14" width="7" height="7" rx="1" fill="#fff"/>
        </svg>
      </div>
    );
  }

  if (connector.id === 'ms-exchange') {
    return (
      <div style={{ ...base, background: '#0078d4' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="5" width="14" height="14" rx="2" fill="rgba(255,255,255,0.2)" stroke="#fff" strokeWidth="1.5"/>
          <path d="M7 9h6M7 12h4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M15 15l3-3-3-3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    );
  }

  if (connector.id === 'fcm') {
    return (
      <div style={{ ...base, background: '#fff8e1', border: '1px solid #fde68a' }}>
        {/* Firebase flame */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M13.5 2C13.5 2 14.5 5.5 12.5 8C10.7 10.2 8 10 8 10C8 10 9 7.5 7.5 5C6.2 2.8 4 2 4 2C4 2 4.5 6.5 6 9C7.3 11.2 9 12 9 12C9 12 6 12.5 4.5 15C3 17.5 3.5 20 3.5 20C3.5 20 5.5 17 8 16.5C9.5 16.2 11 17 11 17C11 17 9.5 13.5 12 11.5C13.8 10 16 10 16 10C16 10 14 12 14.5 15C15 17.5 17 19 17 19C17 19 17.5 16 19 14C20.3 12.3 22 12 22 12C22 12 20 11 18.5 8.5C17 6 17.5 3 17.5 3C17.5 3 15.5 5.5 15.5 8C15.5 9.5 16 11 16 11C16 11 14.5 9 13.5 7C12.7 5.4 13.5 2 13.5 2Z" fill="#f59e0b" stroke="#d97706" strokeWidth="0.5"/>
        </svg>
      </div>
    );
  }

  return (
    <div style={{ ...base, background: connector.iconBg ?? '#f3f4f6', border: '1px solid #e5e7eb' }}>
      <Icon name={connector.icon} size={18} strokeWidth={1.7} color="#374151" />
    </div>
  );
}

export default function ConnectorSettings() {
  const [connectors, setConnectors] = useState<Connector[]>(DEFAULT_CONNECTORS);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');
  const [connectModal, setConnectModal] = useState<string | null>(null);

  // ── Email state ───────────────────────────────────────────────────────────────
  const [modalEmail, setModalEmail]       = useState('');
  const [modalPassword, setModalPassword] = useState('');
  const [mgDomain, setMgDomain]           = useState('');
  const [mgApiKey, setMgApiKey]           = useState('');
  const [mgRegion, setMgRegion]           = useState('');
  const [exEmail, setExEmail]             = useState('');
  const [exPassword, setExPassword]       = useState('');
  const [sgEmail, setSgEmail]             = useState('');
  const [sgApiKey, setSgApiKey]           = useState('');

  // ── FCM / Push state ──────────────────────────────────────────────────────────
  const [fcmBrandId, setFcmBrandId]               = useState('');
  const [fcmFile, setFcmFile]                     = useState<File | null>(null);
  const [fcmJson, setFcmJson]                     = useState<Record<string, unknown> | null>(null);
  const [fcmParseError, setFcmParseError]         = useState('');
  const [fcmConnectedBrandId, setFcmConnectedBrandId] = useState<string | null>(null);
  const [fcmApiData, setFcmApiData]               = useState<Record<string, unknown> | null>(null);

  // ── Shared modal state ────────────────────────────────────────────────────────
  const [verifying, setVerifying]       = useState(false);
  const [verifyResult, setVerifyResult] = useState<'success' | 'error' | null>(null);
  const [verifyMsg, setVerifyMsg]       = useState('');
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState('');
  const [isManage, setIsManage]         = useState(false);
  const [savedFields, setSavedFields]   = useState<Record<string, Record<string, string>>>({});
  const [connectorApiData, setConnectorApiData] = useState<Record<string, unknown> | null>(null);
  const fetchedRef = useRef(false);
  const fcmFileInputRef = useRef<HTMLInputElement>(null);

  // ── Load email connector status ───────────────────────────────────────────────
  function loadConnectors() {
    fetch(`${API_BASE}/api/v1/workspace/settings/connectors/`, { headers: AUTH_HEADERS })
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => {
        const d = data?.data ?? {};
        const provider: string = ((d.current_provider as string) ?? '').toLowerCase();
        const connectedId = PROVIDER_TO_ID[provider] ?? null;
        setConnectors(cs => cs.map(c =>
          c.category === 'Email'
            ? { ...c, status: c.id === connectedId ? 'connected' : 'disconnected' }
            : c
        ));
        setConnectorApiData(d);
      })
      .catch(() => {});
  }

  // ── Load FCM status for a given brand ────────────────────────────────────────
  function loadFcmStatus(brandId: string) {
    if (!brandId || !PROJECT_ID) return;
    fetch(
      `${CAMPAIGN_API_BASE}/api/v1/campaign/projects/${PROJECT_ID}/settings/fcm/brands/${encodeURIComponent(brandId)}`,
      { headers: campaignGetHeaders() },
    )
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => {
        setFcmApiData(data);
        setFcmConnectedBrandId(brandId);
        setConnectors(cs => cs.map(c => c.id === 'fcm' ? { ...c, status: 'connected' } : c));
        try { localStorage.setItem(FCM_BRAND_KEY, brandId); } catch { /* ignore */ }
      })
      .catch(() => {
        setConnectors(cs => cs.map(c => c.id === 'fcm' ? { ...c, status: 'disconnected' } : c));
        try { localStorage.removeItem(FCM_BRAND_KEY); } catch { /* ignore */ }
      });
  }

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    loadConnectors();
    try {
      const stored = localStorage.getItem(FCM_BRAND_KEY);
      if (stored) loadFcmStatus(stored);
    } catch { /* ignore */ }
  }, []);

  // ── Filtered + searched list ──────────────────────────────────────────────────
  const visible = useMemo(() => {
    return connectors.filter(c => {
      if (filter === 'connected'    && c.status !== 'connected')  return false;
      if (filter === 'disconnected' && c.status === 'connected')  return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.name.toLowerCase().includes(q) && !c.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [connectors, filter, search]);

  // ── Modal helpers ─────────────────────────────────────────────────────────────
  function openConnect(id: string) {
    setIsManage(false);
    setModalEmail(''); setModalPassword('');
    setMgDomain(''); setMgApiKey(''); setMgRegion('');
    setExEmail(''); setExPassword('');
    setSgEmail(''); setSgApiKey('');
    setFcmBrandId(''); setFcmFile(null); setFcmJson(null); setFcmParseError('');
    setVerifyResult(null); setVerifyMsg('');
    setSaveError('');
    setConnectModal(id);
  }

  function openManage(id: string) {
    setIsManage(true);
    const api = connectorApiData ?? {};
    const f   = savedFields[id] ?? {};
    const emailVal  = ((api.emailaddress as string) || (api.username as string) || f.email || '');
    const domainVal = ((api.domain as string) || f.domain || '');
    const regionVal = api.region != null ? String(api.region as number) : (f.region ?? '');
    setModalEmail(emailVal); setModalPassword('');
    setMgDomain(domainVal); setMgApiKey(''); setMgRegion(regionVal);
    setExEmail(emailVal); setExPassword('');
    setSgEmail(emailVal); setSgApiKey('');
    // FCM manage: pre-fill brand from stored state
    setFcmBrandId(fcmConnectedBrandId ?? '');
    setFcmFile(null); setFcmJson(null); setFcmParseError('');
    setVerifyResult(null); setVerifyMsg('');
    setSaveError('');
    setConnectModal(id);
  }

  function closeModal() {
    setConnectModal(null);
    setIsManage(false);
    setVerifyResult(null); setVerifyMsg('');
    setSaveError('');
    setFcmFile(null); setFcmJson(null); setFcmParseError('');
  }

  // ── Email verify / save / disconnect ─────────────────────────────────────────
  function verifyCredentials(payload: Record<string, unknown>) {
    setVerifying(true);
    setVerifyResult(null);
    setVerifyMsg('');
    fetch(`${API_BASE}/api/v1/workspace/settings/connectors/verify/`, {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(res => res.json().then(d => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (ok) {
          setVerifyResult('success');
          setVerifyMsg(d?.message ?? 'Credentials verified successfully.');
        } else {
          setVerifyResult('error');
          setVerifyMsg(d?.message ?? d?.detail ?? 'Verification failed.');
        }
      })
      .catch(() => { setVerifyResult('error'); setVerifyMsg('Network error.'); })
      .finally(() => setVerifying(false));
  }

  function disconnectConnector(id: string) {
    fetch(`${API_BASE}/api/v1/workspace/settings/connectors/disconnect/`, {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); })
      .then(() => loadConnectors())
      .catch(() => loadConnectors());
  }

  function saveConnection(connectorId: string, payload: Record<string, unknown>, fields: Record<string, string>) {
    setSaving(true);
    setSaveError('');
    fetch(`${API_BASE}/api/v1/workspace/settings/connectors/connect/`, {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(res => res.json().then(d => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (ok) {
          setSavedFields(sf => ({ ...sf, [connectorId]: fields }));
          closeModal();
          loadConnectors();
        } else {
          setSaveError(d?.message ?? d?.detail ?? 'Failed to save connection.');
        }
      })
      .catch(() => setSaveError('Network error.'))
      .finally(() => setSaving(false));
  }

  function handleDisconnectFromModal(id: string) {
    closeModal();
    disconnectConnector(id);
  }

  // ── FCM verify / save / disconnect ────────────────────────────────────────────
  function verifyFcmCredentials() {
    if (!fcmJson) return;
    setVerifying(true);
    setVerifyResult(null);
    setVerifyMsg('');
    fetch(
      `${CAMPAIGN_API_BASE}/api/v1/campaign/projects/${PROJECT_ID}/settings/fcm/verify`,
      {
        method: 'POST',
        headers: campaignHeaders(),
        body: JSON.stringify({ service_account_json: fcmJson }),
      },
    )
      .then(res => res.json().then(d => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (ok) {
          setVerifyResult('success');
          setVerifyMsg(d?.message ?? 'Firebase connection verified.');
        } else {
          setVerifyResult('error');
          setVerifyMsg(d?.detail ?? d?.message ?? 'Verification failed.');
        }
      })
      .catch(() => { setVerifyResult('error'); setVerifyMsg('Network error.'); })
      .finally(() => setVerifying(false));
  }

  function saveFcmConnection() {
    if (!fcmJson || !fcmBrandId.trim()) return;
    setSaving(true);
    setSaveError('');
    fetch(
      `${CAMPAIGN_API_BASE}/api/v1/campaign/projects/${PROJECT_ID}/settings/fcm/brands/${encodeURIComponent(fcmBrandId.trim())}`,
      {
        method: 'PUT',
        headers: campaignHeaders(),
        body: JSON.stringify({ service_account_json: fcmJson }),
      },
    )
      .then(res => res.json().then(d => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (ok) {
          closeModal();
          loadFcmStatus(fcmBrandId.trim());
        } else {
          setSaveError(d?.detail ?? d?.message ?? 'Failed to save FCM settings.');
        }
      })
      .catch(() => setSaveError('Network error.'))
      .finally(() => setSaving(false));
  }

  function disconnectFcm() {
    if (!fcmConnectedBrandId) return;
    const brandId = fcmConnectedBrandId;
    closeModal();
    fetch(
      `${CAMPAIGN_API_BASE}/api/v1/campaign/projects/${PROJECT_ID}/settings/fcm/brands/${encodeURIComponent(brandId)}`,
      { method: 'DELETE', headers: campaignGetHeaders() },
    )
      .then(() => {
        setFcmConnectedBrandId(null);
        setFcmApiData(null);
        setConnectors(cs => cs.map(c => c.id === 'fcm' ? { ...c, status: 'disconnected' } : c));
        try { localStorage.removeItem(FCM_BRAND_KEY); } catch { /* ignore */ }
      })
      .catch(() => {
        // reload status to get real state
        if (fcmConnectedBrandId) loadFcmStatus(fcmConnectedBrandId);
      });
  }

  // ── FCM JSON file handling ────────────────────────────────────────────────────
  function handleFcmFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setFcmFile(file);
    setFcmJson(null);
    setFcmParseError('');
    setVerifyResult(null);
    setVerifyMsg('');
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (parsed.type !== 'service_account') {
          setFcmParseError('This does not look like a Firebase service account JSON (missing type: service_account).');
          return;
        }
        setFcmJson(parsed);
      } catch {
        setFcmParseError('Could not parse JSON file.');
      }
    };
    reader.readAsText(file);
  }

  // ── Shared styles ─────────────────────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState<typeof CATEGORIES[number]>('Push');

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 16px', borderRadius: 20, fontSize: 12, fontWeight: 500,
    cursor: 'pointer',
    border: active ? 'none' : '1px solid #d1d5db',
    background: active ? '#0091E0' : '#fff',
    color: active ? '#fff' : '#374151',
  });

  const inputStyle: React.CSSProperties = {
    width: '100%', height: 40, padding: '0 12px', boxSizing: 'border-box',
    border: '1px solid #d1d5db', borderRadius: 6,
    fontSize: 13, color: '#374151', outline: 'none',
  };

  const disconnectBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    height: 40, padding: '0 16px', border: 'none', borderRadius: 20,
    background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', flexShrink: 0,
  };

  const disconnectIcon = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
    </svg>
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  const categoryItems = visible.filter(c => c.category === activeCategory);
  const catDesc = DEFAULT_CONNECTORS.find(c => c.category === activeCategory)?.categoryDescription ?? '';
  const categoryTotal = connectors.filter(c => c.category === activeCategory).length;
  const statusFilters: FilterType[] = categoryTotal > 1 ? ['all', 'connected', 'disconnected'] : ['all'];

  return (
    <div>

      {/* Category tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 20 }}>
        {VISIBLE_CATEGORIES.map(cat => {
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '10px 18px', fontSize: 13.5, fontWeight: 500,
                color: isActive ? '#0091E0' : '#6b7280',
                borderBottom: isActive ? '2px solid #0091E0' : '2px solid transparent',
                marginBottom: -1, background: 'none',
                border: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Category description */}
      {catDesc && (
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>{catDesc}</div>
      )}

      {/* Filter chips + Search */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {statusFilters.map(f => (
            <button key={f} type="button" style={chipStyle(filter === f)} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : f === 'connected' ? 'Connected' : 'Not connected'}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search"
          style={{
            height: 32, padding: '0 12px', width: 200,
            border: '1px solid #d1d5db', borderRadius: 4,
            fontSize: 12, color: '#374151', outline: 'none', background: '#fff',
          }}
        />
      </div>

      {/* Connector rows */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
        {categoryItems.length === 0 && (
          <div style={{ textAlign: 'center', padding: '28px 0', color: '#9ca3af', fontSize: 13 }}>
            No connectors available.
          </div>
        )}
        {categoryItems.map((connector, i) => {
          const isConnected = connector.status === 'connected';
          const isError     = connector.status === 'error';
          return (
            <div
              key={connector.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '16px 18px',
                borderBottom: i < categoryItems.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}
            >
              <ConnectorIcon connector={connector} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{connector.name}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{connector.description}</div>
              </div>

              {isConnected ? (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 12, fontWeight: 500, color: '#16a34a',
                  background: '#f0fdf4', border: '1px solid #bbf7d0',
                  borderRadius: 20, padding: '3px 10px', flexShrink: 0,
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />
                  Connected
                </span>
              ) : (
                <span style={{ fontSize: 12, color: '#9ca3af', marginRight: 4, flexShrink: 0 }}>
                  {isError ? 'Error' : 'Not Connected'}
                </span>
              )}

              <button
                type="button"
                onClick={() => isConnected ? openManage(connector.id) : openConnect(connector.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 16px', borderRadius: 6, flexShrink: 0,
                  border: isConnected ? '1px solid #d1d5db' : 'none',
                  background: isConnected ? '#fff' : '#0091E0',
                  color: isConnected ? '#374151' : '#fff',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Icon
                  name={isConnected ? 'settings' : isError ? 'refresh-cw' : 'link'}
                  size={13}
                  color={isConnected ? '#374151' : '#fff'}
                />
                {isConnected ? 'Manage' : isError ? 'Reconnect' : 'Connect'}
              </button>
            </div>
          );
        })}
      </div>

      {/* ══ FCM modal ══════════════════════════════════════════════════════════ */}
      {connectModal === 'fcm' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', width: 400, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, background: '#fff8e1', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M13.5 2C13.5 2 14.5 5.5 12.5 8C10.7 10.2 8 10 8 10C8 10 9 7.5 7.5 5C6.2 2.8 4 2 4 2C4 2 4.5 6.5 6 9C7.3 11.2 9 12 9 12C9 12 6 12.5 4.5 15C3 17.5 3.5 20 3.5 20C3.5 20 5.5 17 8 16.5C9.5 16.2 11 17 11 17C11 17 9.5 13.5 12 11.5C13.8 10 16 10 16 10C16 10 14 12 14.5 15C15 17.5 17 19 17 19C17 19 17.5 16 19 14C20.3 12.3 22 12 22 12C22 12 20 11 18.5 8.5C17 6 17.5 3 17.5 3C17.5 3 15.5 5.5 15.5 8C15.5 9.5 16 11 16 11C16 11 14.5 9 13.5 7C12.7 5.4 13.5 2 13.5 2Z" fill="#f59e0b" stroke="#d97706" strokeWidth="0.5"/>
                  </svg>
                </div>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>
                  {isManage ? 'Manage Firebase FCM' : 'Connect Firebase FCM'}
                </span>
              </div>
              <button type="button" onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', lineHeight: 1, padding: 2 }}>×</button>
            </div>

            {/* Manage: show current connection info */}
            {isManage && fcmApiData && !fcmJson && (
              <div style={{ marginBottom: 16, padding: '10px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#16a34a', marginBottom: 4 }}>Currently connected</div>
                {fcmConnectedBrandId && (
                  <div style={{ fontSize: 12, color: '#374151' }}>Brand: <strong>{fcmConnectedBrandId}</strong></div>
                )}
                {(() => {
                  const sa = (fcmApiData as { service_account_json?: Record<string, unknown> })?.service_account_json;
                  return sa ? (
                    <>
                      <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>Project: <strong>{sa.project_id as string}</strong></div>
                      <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>Account: <strong>{sa.client_email as string}</strong></div>
                    </>
                  ) : null;
                })()}
              </div>
            )}

            {/* Brand ID */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6 }}>Brand ID</label>
              <input
                type="text"
                value={fcmBrandId}
                onChange={e => setFcmBrandId(e.target.value)}
                placeholder="e.g. brand_01"
                readOnly={isManage && !!fcmConnectedBrandId && !fcmJson}
                style={{ ...inputStyle, background: isManage && !!fcmConnectedBrandId && !fcmJson ? '#f9fafb' : '#fff', color: '#374151' }}
              />
            </div>

            {/* JSON file upload */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6 }}>
                {isManage ? 'Upload new service account JSON (optional)' : 'Firebase service account JSON'}
              </label>

              <input
                ref={fcmFileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFcmFileChange}
                style={{ display: 'none' }}
              />

              <button
                type="button"
                onClick={() => fcmFileInputRef.current?.click()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', height: 40, padding: '0 14px',
                  border: fcmJson ? '1px solid #bbf7d0' : '1px dashed #d1d5db',
                  borderRadius: 6, background: fcmJson ? '#f0fdf4' : '#fafafa',
                  fontSize: 12, color: fcmJson ? '#16a34a' : '#6b7280',
                  cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box',
                }}
              >
                <Icon name={fcmJson ? 'check-circle' : 'upload'} size={14} color={fcmJson ? '#16a34a' : '#9ca3af'} />
                {fcmJson
                  ? (fcmFile?.name ?? 'File loaded')
                  : (fcmFile ? fcmFile.name : 'Choose JSON file…')}
              </button>

              {fcmParseError && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#ef4444' }}>{fcmParseError}</div>
              )}

              {/* Preview parsed info */}
              {fcmJson && (
                <div style={{ marginTop: 8, padding: '8px 10px', background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, color: '#374151' }}>
                  <div>Project: <strong>{fcmJson.project_id as string}</strong></div>
                  <div style={{ marginTop: 2 }}>Account: <strong>{fcmJson.client_email as string}</strong></div>
                </div>
              )}
            </div>

            {/* Verify / save feedback */}
            {verifyMsg && (
              <div style={{ marginBottom: 10, fontSize: 12, color: verifyResult === 'success' ? '#10b981' : '#ef4444' }}>
                {verifyMsg}
              </div>
            )}
            {saveError && (
              <div style={{ marginBottom: 10, fontSize: 12, color: '#ef4444' }}>{saveError}</div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              {isManage && (
                <button type="button" onClick={disconnectFcm} style={disconnectBtnStyle}>
                  {disconnectIcon}
                  Disconnect
                </button>
              )}

              <button
                type="button"
                disabled={verifying || !fcmJson}
                onClick={verifyFcmCredentials}
                style={{
                  flex: 1, height: 40, border: '1px solid #d1d5db', borderRadius: 20,
                  background: '#fff', fontSize: 13, color: '#374151',
                  cursor: !fcmJson || verifying ? 'not-allowed' : 'pointer',
                  fontWeight: 500, opacity: !fcmJson || verifying ? 0.6 : 1,
                }}
              >
                {verifying ? 'Testing…' : 'Test'}
              </button>

              <button
                type="button"
                disabled={saving || !fcmJson || !fcmBrandId.trim()}
                onClick={saveFcmConnection}
                style={{
                  flex: 1, height: 40, border: 'none', borderRadius: 20,
                  background: '#0091E0', color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: saving || !fcmJson || !fcmBrandId.trim() ? 'not-allowed' : 'pointer',
                  opacity: saving || !fcmJson || !fcmBrandId.trim() ? 0.65 : 1,
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MS Exchange modal ═══════════════════════════════════════════════════ */}
      {connectModal === 'ms-exchange' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', width: 360, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>{isManage ? 'Manage MS Exchange' : 'Connect MS Exchange'}</span>
              <button type="button" onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', lineHeight: 1, padding: 2 }}>×</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6 }}>Email Address</label>
              <input type="email" value={exEmail} onChange={e => setExEmail(e.target.value)} placeholder="you@company.com" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6 }}>Password</label>
              <input type="password" value={exPassword} onChange={e => setExPassword(e.target.value)} placeholder="Exchange password" style={inputStyle} />
            </div>
            {verifyMsg && <div style={{ marginBottom: 8, fontSize: 12, color: verifyResult === 'success' ? '#10b981' : '#ef4444' }}>{verifyMsg}</div>}
            {saveError && <div style={{ marginBottom: 8, fontSize: 12, color: '#ef4444' }}>{saveError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              {isManage && (
                <button type="button" onClick={() => handleDisconnectFromModal('ms-exchange')} style={disconnectBtnStyle}>
                  {disconnectIcon} Disconnect
                </button>
              )}
              <button type="button" disabled={verifying}
                onClick={() => verifyCredentials({ emailclient: 'exchange', username: exEmail, password: exPassword, emailaddress: exEmail })}
                style={{ flex: 1, height: 40, border: '1px solid #d1d5db', borderRadius: 20, background: '#fff', fontSize: 13, color: '#374151', cursor: verifying ? 'not-allowed' : 'pointer', fontWeight: 500, opacity: verifying ? 0.7 : 1 }}>
                {verifying ? 'Testing…' : 'Test'}
              </button>
              <button type="button" disabled={saving}
                onClick={() => saveConnection('ms-exchange', { emailclient: 'exchange', username: exEmail, password: exPassword, emailaddress: exEmail }, { email: exEmail })}
                style={{ flex: 1, height: 40, border: 'none', borderRadius: 20, background: '#0091E0', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ SendGrid modal ══════════════════════════════════════════════════════ */}
      {connectModal === 'sendgrid-em' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', width: 360, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>{isManage ? 'Manage SendGrid' : 'Connect SendGrid'}</span>
              <button type="button" onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', lineHeight: 1, padding: 2 }}>×</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6 }}>From Email Address</label>
              <input type="email" value={sgEmail} onChange={e => setSgEmail(e.target.value)} placeholder="noreply@yourdomain.com" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6 }}>API Key</label>
              <input type="password" value={sgApiKey} onChange={e => setSgApiKey(e.target.value)} placeholder="SG.xxxxxxxxxxxxxxxx" style={inputStyle} />
            </div>
            {verifyMsg && <div style={{ marginBottom: 8, fontSize: 12, color: verifyResult === 'success' ? '#10b981' : '#ef4444' }}>{verifyMsg}</div>}
            {saveError && <div style={{ marginBottom: 8, fontSize: 12, color: '#ef4444' }}>{saveError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              {isManage && (
                <button type="button" onClick={() => handleDisconnectFromModal('sendgrid-em')} style={disconnectBtnStyle}>
                  {disconnectIcon} Disconnect
                </button>
              )}
              <button type="button" disabled={verifying}
                onClick={() => verifyCredentials({ emailclient: 'sendgrid', emailaddress: sgEmail, gridapikey: sgApiKey })}
                style={{ flex: 1, height: 40, border: '1px solid #d1d5db', borderRadius: 20, background: '#fff', fontSize: 13, color: '#374151', cursor: verifying ? 'not-allowed' : 'pointer', fontWeight: 500, opacity: verifying ? 0.7 : 1 }}>
                {verifying ? 'Testing…' : 'Test'}
              </button>
              <button type="button" disabled={saving}
                onClick={() => saveConnection('sendgrid-em', { emailclient: 'sendgrid', emailaddress: sgEmail, gridapikey: sgApiKey }, { email: sgEmail })}
                style={{ flex: 1, height: 40, border: 'none', borderRadius: 20, background: '#0091E0', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Mailgun modal ═══════════════════════════════════════════════════════ */}
      {connectModal === 'mailgun' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', width: 360, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>{isManage ? 'Manage Mailgun' : 'Connect Mailgun'}</span>
              <button type="button" onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', lineHeight: 1, padding: 2 }}>×</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6 }}>Domain</label>
              <input type="text" value={mgDomain} onChange={e => setMgDomain(e.target.value)} placeholder="mg.yourdomain.com" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6 }}>API Key</label>
              <input type="password" value={mgApiKey} onChange={e => setMgApiKey(e.target.value)} placeholder="key-xxxxxxxxxxxxxxxx" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6 }}>Region</label>
              <select value={mgRegion} onChange={e => setMgRegion(e.target.value)}
                style={{ ...inputStyle, background: '#fff', appearance: 'auto' }}>
                <option value="">Select region</option>
                <option value="2">US</option>
                <option value="1">EU</option>
              </select>
            </div>
            {verifyMsg && <div style={{ marginBottom: 8, fontSize: 12, color: verifyResult === 'success' ? '#10b981' : '#ef4444' }}>{verifyMsg}</div>}
            {saveError && <div style={{ marginBottom: 8, fontSize: 12, color: '#ef4444' }}>{saveError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              {isManage && (
                <button type="button" onClick={() => handleDisconnectFromModal('mailgun')} style={disconnectBtnStyle}>
                  {disconnectIcon} Disconnect
                </button>
              )}
              <button type="button" disabled={verifying}
                onClick={() => verifyCredentials({ emailclient: 'mailgun', domain: mgDomain, apikey: mgApiKey, region: mgRegion ? parseInt(mgRegion) : 0 })}
                style={{ flex: 1, height: 40, border: '1px solid #d1d5db', borderRadius: 20, background: '#fff', fontSize: 13, color: '#374151', cursor: verifying ? 'not-allowed' : 'pointer', fontWeight: 500, opacity: verifying ? 0.7 : 1 }}>
                {verifying ? 'Testing…' : 'Test'}
              </button>
              <button type="button" disabled={saving}
                onClick={() => saveConnection('mailgun', { emailclient: 'mailgun', domain: mgDomain, apikey: mgApiKey, region: mgRegion ? parseInt(mgRegion) : 0 }, { domain: mgDomain, region: mgRegion })}
                style={{ flex: 1, height: 40, border: 'none', borderRadius: 20, background: '#0091E0', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Google SMTP modal ═══════════════════════════════════════════════════ */}
      {connectModal === 'google-smtp' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', width: 360, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>{isManage ? 'Manage Google' : 'Connect Google'}</span>
              <button type="button" onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', lineHeight: 1, padding: 2 }}>×</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6 }}>Email Address</label>
              <input type="email" value={modalEmail} onChange={e => setModalEmail(e.target.value)} placeholder="you@gmail.com" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6 }}>App Password</label>
              <input type="password" value={modalPassword} onChange={e => setModalPassword(e.target.value)} placeholder="Google app password" style={inputStyle} />
            </div>
            {verifyMsg && <div style={{ marginBottom: 8, fontSize: 12, color: verifyResult === 'success' ? '#10b981' : '#ef4444' }}>{verifyMsg}</div>}
            {saveError && <div style={{ marginBottom: 8, fontSize: 12, color: '#ef4444' }}>{saveError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              {isManage && (
                <button type="button" onClick={() => handleDisconnectFromModal('google-smtp')} style={disconnectBtnStyle}>
                  {disconnectIcon} Disconnect
                </button>
              )}
              <button type="button" disabled={verifying}
                onClick={() => verifyCredentials({ emailclient: 'gsuite', username: modalEmail, password: modalPassword, emailaddress: modalEmail })}
                style={{ flex: 1, height: 40, border: '1px solid #d1d5db', borderRadius: 20, background: '#fff', fontSize: 13, color: '#374151', cursor: verifying ? 'not-allowed' : 'pointer', fontWeight: 500, opacity: verifying ? 0.7 : 1 }}>
                {verifying ? 'Testing…' : 'Test'}
              </button>
              <button type="button" disabled={saving}
                onClick={() => saveConnection('google-smtp', { emailclient: 'gsuite', username: modalEmail, password: modalPassword, emailaddress: modalEmail }, { email: modalEmail })}
                style={{ flex: 1, height: 40, border: 'none', borderRadius: 20, background: '#0091E0', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
