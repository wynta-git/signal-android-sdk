'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import Icon from '../../components/Icon';
import { DEFAULT_CONNECTORS } from '../constants';
import type { Connector } from '../types';

const API_BASE = process.env.NEXT_PUBLIC_WYNTA_API_URL ?? '';
const AUTH_HEADERS: Record<string, string> = process.env.NEXT_PUBLIC_WYNTA_API_TOKEN
  ? { Authorization: process.env.NEXT_PUBLIC_WYNTA_API_TOKEN }
  : {};

// Maps API current_provider value → connector id in DEFAULT_CONNECTORS
const PROVIDER_TO_ID: Record<string, string> = {
  gsuite:   'google-smtp',
  mailgun:  'mailgun',
  sendgrid: 'sendgrid-em',
  exchange: 'ms-exchange',
};

type FilterType = 'all' | 'connected' | 'disconnected';

const CATEGORIES = ['Email'] as const;

/* Brand icon boxes for known connectors */
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
  // Google fields
  const [modalEmail, setModalEmail]     = useState('');
  const [modalPassword, setModalPassword] = useState('');
  // Mailgun fields
  const [mgDomain, setMgDomain]   = useState('');
  const [mgApiKey, setMgApiKey]   = useState('');
  const [mgRegion, setMgRegion]   = useState('');
  // MS Exchange fields
  const [exEmail, setExEmail]     = useState('');
  const [exPassword, setExPassword] = useState('');
  // SendGrid fields
  const [sgEmail, setSgEmail]     = useState('');
  const [sgApiKey, setSgApiKey]   = useState('');
  // Verify state
  const [verifying, setVerifying]       = useState(false);
  const [verifyResult, setVerifyResult] = useState<'success' | 'error' | null>(null);
  const [verifyMsg, setVerifyMsg]       = useState('');
  // Save state
  const [saving, setSaving]         = useState(false);
  const [saveError, setSaveError]   = useState('');
  // Manage mode (opened from a connected connector)
  const [isManage, setIsManage]     = useState(false);
  // Saved non-sensitive fields per connector id
  const [savedFields, setSavedFields] = useState<Record<string, Record<string, string>>>({});
  // Raw data from the connectors API (for pre-filling Manage modal)
  const [connectorApiData, setConnectorApiData] = useState<Record<string, unknown> | null>(null);
  const fetchedRef = useRef(false);

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

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    loadConnectors();
  }, []);

  const visible = useMemo(() => {
    return connectors.filter(c => {
      if (filter === 'connected'    && c.status !== 'connected')    return false;
      if (filter === 'disconnected' && c.status === 'connected')    return false;
      if (search) {
        const q = search.toLowerCase();
        if (!c.name.toLowerCase().includes(q) && !c.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [connectors, filter, search]);

  function toggle(id: string) {
    setConnectors(cs => cs.map(c =>
      c.id === id
        ? { ...c, status: c.status === 'connected' ? 'disconnected' : 'connected' }
        : c
    ));
  }

  function openConnect(id: string) {
    setIsManage(false);
    setModalEmail(''); setModalPassword('');
    setMgDomain(''); setMgApiKey(''); setMgRegion('');
    setExEmail(''); setExPassword('');
    setSgEmail(''); setSgApiKey('');
    setVerifyResult(null); setVerifyMsg('');
    setSaveError('');
    setConnectModal(id);
  }

  function openManage(id: string) {
    setIsManage(true);
    const api = connectorApiData ?? {};
    const f   = savedFields[id] ?? {};
    // API fields take precedence over locally-cached savedFields
    const emailVal  = ((api.emailaddress as string) || (api.username as string) || f.email || '');
    const domainVal = ((api.domain as string) || f.domain || '');
    const regionVal = api.region != null ? String(api.region as number) : (f.region ?? '');
    setModalEmail(emailVal); setModalPassword('');
    setMgDomain(domainVal); setMgApiKey(''); setMgRegion(regionVal);
    setExEmail(emailVal); setExPassword('');
    setSgEmail(emailVal); setSgApiKey('');
    setVerifyResult(null); setVerifyMsg('');
    setSaveError('');
    setConnectModal(id);
  }

  function closeModal() {
    setConnectModal(null);
    setIsManage(false);
    setVerifyResult(null); setVerifyMsg('');
    setSaveError('');
  }

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

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 16px', borderRadius: 20, fontSize: 12, fontWeight: 500,
    cursor: 'pointer',
    border: active ? 'none' : '1px solid #d1d5db',
    background: active ? '#0091E0' : '#fff',
    color: active ? '#fff' : '#374151',
  });

  return (
    <div style={{ paddingTop: 24 }}>
      {CATEGORIES.map((category, ci) => {
        const items = visible.filter(c => c.category === category);
        const firstInCat = DEFAULT_CONNECTORS.find(c => c.category === category);
        const catDesc = firstInCat?.categoryDescription ?? '';

        return (
          <div key={category} style={{ marginBottom: ci < CATEGORIES.length - 1 ? 32 : 0 }}>
            {/* Category header */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{category}</div>
              {catDesc && (
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>{catDesc}</div>
              )}
            </div>

            {/* Filter chips + Search */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['all', 'connected', 'disconnected'] as FilterType[]).map(f => (
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
              {items.length === 0 && (
                <div style={{ textAlign: 'center', padding: '28px 0', color: '#9ca3af', fontSize: 13 }}>
                  No connectors available.
                </div>
              )}
              {items.map((connector, i) => {
                const isConnected = connector.status === 'connected';
                const isError     = connector.status === 'error';
                return (
                  <div
                    key={connector.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '16px 18px',
                      borderBottom: i < items.length - 1 ? '1px solid #f3f4f6' : 'none',
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
          </div>
        );
      })}

      {/* ── MS Exchange modal ── */}
      {connectModal === 'ms-exchange' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', width: 360, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>{isManage ? 'Manage MS Exchange' : 'Connect MS Exchange'}</span>
              <button type="button" onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', lineHeight: 1, padding: 2 }}>×</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6 }}>Email Address</label>
              <input type="email" value={exEmail} onChange={e => setExEmail(e.target.value)} placeholder="you@company.com"
                style={{ width: '100%', height: 40, padding: '0 12px', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6 }}>Password</label>
              <input type="password" value={exPassword} onChange={e => setExPassword(e.target.value)} placeholder="Exchange password"
                style={{ width: '100%', height: 40, padding: '0 12px', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
            </div>
            {verifyMsg && <div style={{ marginBottom: 8, fontSize: 12, color: verifyResult === 'success' ? '#10b981' : '#ef4444' }}>{verifyMsg}</div>}
            {saveError && <div style={{ marginBottom: 8, fontSize: 12, color: '#ef4444' }}>{saveError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              {isManage && (
                <button type="button" onClick={() => handleDisconnectFromModal('ms-exchange')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, height: 40, padding: '0 16px', border: 'none', borderRadius: 20, background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  Disconnect
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

      {/* ── SendGrid modal ── */}
      {connectModal === 'sendgrid-em' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', width: 360, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>{isManage ? 'Manage SendGrid' : 'Connect SendGrid'}</span>
              <button type="button" onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', lineHeight: 1, padding: 2 }}>×</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6 }}>From Email Address</label>
              <input type="email" value={sgEmail} onChange={e => setSgEmail(e.target.value)} placeholder="noreply@yourdomain.com"
                style={{ width: '100%', height: 40, padding: '0 12px', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6 }}>API Key</label>
              <input type="password" value={sgApiKey} onChange={e => setSgApiKey(e.target.value)} placeholder="SG.xxxxxxxxxxxxxxxx"
                style={{ width: '100%', height: 40, padding: '0 12px', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
            </div>
            {verifyMsg && <div style={{ marginBottom: 8, fontSize: 12, color: verifyResult === 'success' ? '#10b981' : '#ef4444' }}>{verifyMsg}</div>}
            {saveError && <div style={{ marginBottom: 8, fontSize: 12, color: '#ef4444' }}>{saveError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              {isManage && (
                <button type="button" onClick={() => handleDisconnectFromModal('sendgrid-em')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, height: 40, padding: '0 16px', border: 'none', borderRadius: 20, background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  Disconnect
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

      {/* ── Mailgun modal ── */}
      {connectModal === 'mailgun' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', width: 360, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>{isManage ? 'Manage Mailgun' : 'Connect Mailgun'}</span>
              <button type="button" onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', lineHeight: 1, padding: 2 }}>×</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6 }}>Domain</label>
              <input type="text" value={mgDomain} onChange={e => setMgDomain(e.target.value)} placeholder="mg.yourdomain.com"
                style={{ width: '100%', height: 40, padding: '0 12px', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6 }}>API Key</label>
              <input type="password" value={mgApiKey} onChange={e => setMgApiKey(e.target.value)} placeholder="key-xxxxxxxxxxxxxxxx"
                style={{ width: '100%', height: 40, padding: '0 12px', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6 }}>Region</label>
              <select value={mgRegion} onChange={e => setMgRegion(e.target.value)}
                style={{ width: '100%', height: 40, padding: '0 12px', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none', background: '#fff', appearance: 'auto' }}>
                <option value="">Select region</option>
                <option value="2">US</option>
                <option value="1">EU</option>
              </select>
            </div>
            {verifyMsg && <div style={{ marginBottom: 8, fontSize: 12, color: verifyResult === 'success' ? '#10b981' : '#ef4444' }}>{verifyMsg}</div>}
            {saveError && <div style={{ marginBottom: 8, fontSize: 12, color: '#ef4444' }}>{saveError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              {isManage && (
                <button type="button" onClick={() => handleDisconnectFromModal('mailgun')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, height: 40, padding: '0 16px', border: 'none', borderRadius: 20, background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  Disconnect
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

      {/* ── Google modal ── */}
      {connectModal === 'google-smtp' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px', width: 360, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>{isManage ? 'Manage Google' : 'Connect Google'}</span>
              <button type="button" onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', lineHeight: 1, padding: 2 }}>×</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6 }}>Email Address</label>
              <input type="email" value={modalEmail} onChange={e => setModalEmail(e.target.value)} placeholder="you@gmail.com"
                style={{ width: '100%', height: 40, padding: '0 12px', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#374151', marginBottom: 6 }}>App Password</label>
              <input type="password" value={modalPassword} onChange={e => setModalPassword(e.target.value)} placeholder="Google app password"
                style={{ width: '100%', height: 40, padding: '0 12px', boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#374151', outline: 'none' }} />
            </div>
            {verifyMsg && <div style={{ marginBottom: 8, fontSize: 12, color: verifyResult === 'success' ? '#10b981' : '#ef4444' }}>{verifyMsg}</div>}
            {saveError && <div style={{ marginBottom: 8, fontSize: 12, color: '#ef4444' }}>{saveError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              {isManage && (
                <button type="button" onClick={() => handleDisconnectFromModal('google-smtp')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, height: 40, padding: '0 16px', border: 'none', borderRadius: 20, background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                  Disconnect
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
