'use client';
import { useState, useMemo } from 'react';
import Icon from '../../components/Icon';
import { DEFAULT_CONNECTORS } from '../constants';
import type { Connector } from '../types';

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

                    <span style={{ fontSize: 12, color: '#9ca3af', marginRight: 4, flexShrink: 0 }}>
                      {isConnected ? 'Connected' : isError ? 'Error' : 'Not Connected'}
                    </span>

                    <button
                      type="button"
                      onClick={() => toggle(connector.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 16px', borderRadius: 6, flexShrink: 0,
                        border: isConnected ? '1px solid #e5e7eb' : 'none',
                        background: isConnected ? '#fff' : '#0091E0',
                        color: isConnected ? '#374151' : '#fff',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      <Icon
                        name={isConnected ? 'link-2-off' : isError ? 'refresh-cw' : 'link'}
                        size={13}
                        color={isConnected ? '#374151' : '#fff'}
                      />
                      {isConnected ? 'Disconnect' : isError ? 'Reconnect' : 'Connect'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

    </div>
  );
}
