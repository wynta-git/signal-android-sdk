'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
const API_BASE = process.env.NEXT_PUBLIC_WYNTA_API_URL ?? '';
const AUTH_HEADERS: Record<string, string> = process.env.NEXT_PUBLIC_WYNTA_API_TOKEN
  ? { Authorization: process.env.NEXT_PUBLIC_WYNTA_API_TOKEN }
  : {};

interface ApiModel {
  id: number;
  provider: string;
  created_at: string;
  is_default: boolean;
}

interface Provider {
  id: number;
  name: string;
}

interface ModelRow {
  id: string;
  provider: string;
  createdOn: string;
  isDefault: boolean;
}

type AISortCol = 'provider' | 'createdOn';
type View = 'list' | 'add';

function SortIcon({ dir }: { dir: 'asc' | 'desc' | null }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1, marginLeft: 5, verticalAlign: 'middle' }}>
      <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
        <path d="M4 0L8 5H0L4 0Z" fill={dir === 'asc' ? '#6b7280' : '#d1d5db'} />
      </svg>
      <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
        <path d="M4 5L0 0H8L4 5Z" fill={dir === 'desc' ? '#6b7280' : '#d1d5db'} />
      </svg>
    </span>
  );
}

export default function AIModelSettings() {
  const [view, setView]                     = useState<View>('list');
  const [models, setModels]                 = useState<ModelRow[]>([]);
  const [providers, setProviders]           = useState<Provider[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(false);
  const [sort, setSort]                     = useState<{ col: AISortCol; dir: 'asc' | 'desc' } | null>(null);
  const [search, setSearch]                 = useState('');
  const [rowsPerPage, setRowsPerPage]       = useState(20);
  const [page, setPage]                     = useState(1);
  const [actionOpen, setActionOpen]         = useState<string | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [apiKey, setApiKey]                 = useState('');
  const [addingModel, setAddingModel]       = useState(false);
  const [addError, setAddError]             = useState('');
  const [actionLoading, setActionLoading]   = useState<string | null>(null);
  const fetchedRef = useRef(false);

  function loadData() {
    setLoading(true);
    setError(false);
    fetch(`${API_BASE}/api/v1/workspace/settings/ai-models/`, { headers: AUTH_HEADERS })
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => {
        const list: ApiModel[] = data?.data?.models ?? [];
        const avail: Provider[] = data?.data?.available_providers ?? [];
        setModels(list.map(m => ({
          id:        String(m.id),
          provider:  m.provider,
          createdOn: m.created_at,
          isDefault: m.is_default,
        })));
        setProviders(avail);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => { // eslint-disable-line react-hooks/exhaustive-deps
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    loadData();
  }, []);

  function handleAdd() {
    if (!selectedProviderId || !apiKey) return;
    setAddingModel(true);
    setAddError('');
    fetch(`${API_BASE}/api/v1/workspace/settings/ai-models/`, {
      method: 'POST',
      headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider_id: Number(selectedProviderId), api_key: apiKey }),
    })
      .then(res => res.json().then(d => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        if (ok) {
          setSelectedProviderId('');
          setApiKey('');
          setView('list');
          loadData();
        } else {
          setAddError(d?.message ?? d?.detail ?? 'Failed to save AI model.');
        }
      })
      .catch(() => setAddError('Network error.'))
      .finally(() => setAddingModel(false));
  }

  function handleDelete(modelId: string) {
    setActionLoading(modelId);
    setActionOpen(null);
    fetch(`${API_BASE}/api/v1/workspace/settings/ai-models/${modelId}/`, {
      method: 'DELETE',
      headers: AUTH_HEADERS,
    })
      .then(() => loadData())
      .catch(() => loadData())
      .finally(() => setActionLoading(null));
  }

  function handleSetDefault(modelId: string) {
    setActionLoading(modelId);
    setActionOpen(null);
    fetch(`${API_BASE}/api/v1/workspace/settings/ai-models/${modelId}/set-default/`, {
      method: 'POST',
      headers: AUTH_HEADERS,
    })
      .then(() => loadData())
      .catch(() => loadData())
      .finally(() => setActionLoading(null));
  }

  const filtered = useMemo(() => {
    let list = [...models];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(m => m.provider.toLowerCase().includes(q));
    }
    if (sort) {
      list.sort((a, b) => {
        const va = sort.col === 'provider' ? a.provider : a.createdOn;
        const vb = sort.col === 'provider' ? b.provider : b.createdOn;
        return sort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return list;
  }, [models, search, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const start      = (page - 1) * rowsPerPage;
  const paginated  = filtered.slice(start, start + rowsPerPage);

  function toggleSort(col: AISortCol) {
    setSort(s => s?.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
    setPage(1);
  }

  const thBase: React.CSSProperties = {
    padding: '10px 14px', fontSize: 12, fontWeight: 500, color: '#6b7280',
    textAlign: 'left', cursor: 'pointer', borderBottom: '1px solid #e5e7eb',
    userSelect: 'none', whiteSpace: 'nowrap', background: '#fafafa',
  };
  const tdBase: React.CSSProperties = {
    padding: '11px 14px', fontSize: 13, color: '#374151',
    borderBottom: '1px solid #f3f4f6',
  };
  const thBorder: React.CSSProperties = { borderLeft: '1px solid #f3f4f6' };

  const paginationBtn = (disabled: boolean): React.CSSProperties => ({
    padding: '3px 10px', border: '1px solid #e5e7eb', borderRadius: 4,
    background: '#fff', fontSize: 12, cursor: disabled ? 'default' : 'pointer',
    color: disabled ? '#d1d5db' : '#374151',
  });

  const fieldStyle: React.CSSProperties = {
    width: '100%', maxWidth: 520, height: 38, padding: '0 10px',
    border: '1px solid #d1d5db', borderRadius: 4,
    fontSize: 13, color: '#374151',
    background: '#fff', outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6,
  };

  /* ── Add AI Model view ── */
  if (view === 'add') {
    return (
      <div style={{ paddingTop: 8 }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 14 }}>
          <span
            onClick={() => { setSelectedProviderId(''); setApiKey(''); setAddError(''); setView('list'); }}
            style={{ color: '#6b7280', cursor: 'pointer' }}
          >
            AI Model
          </span>
          <span style={{ color: '#9ca3af' }}>›</span>
          <span style={{ color: '#111827', fontWeight: 500 }}>Add AI Model</span>
          <span style={{
            width: 16, height: 16, borderRadius: '50%',
            border: '1px solid #d1d5db',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, color: '#6b7280',
          }}>i</span>
        </div>

        {/* Info banner */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '12px 16px', background: '#f3f4f6',
          border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 24,
          maxWidth: 560,
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="8" cy="8" r="7.5" stroke="#9ca3af" />
            <rect x="7.25" y="7" width="1.5" height="5" rx="0.75" fill="#9ca3af" />
            <circle cx="8" cy="4.5" r="0.75" fill="#9ca3af" />
          </svg>
          <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
            <strong>Choose the AI model</strong> that best fits your needs for speed, intelligence and output quality.{' '}
            <a href="#" style={{ color: '#0091E0', fontWeight: 500, textDecoration: 'underline' }}>Help &amp; Support</a>
          </span>
        </div>

        {/* AI Module */}
        <div style={{ marginBottom: 18, maxWidth: 520 }}>
          <label style={labelStyle}>
            AI Module <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select
            value={selectedProviderId}
            onChange={e => setSelectedProviderId(e.target.value)}
            style={{
              ...fieldStyle,
              cursor: 'pointer',
              color: selectedProviderId ? '#374151' : '#9ca3af',
              appearance: 'auto',
            }}
          >
            <option value="" disabled>Select</option>
            {providers.map(p => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </select>
        </div>

        {/* API Key */}
        <div style={{ marginBottom: 24, maxWidth: 520 }}>
          <label style={labelStyle}>
            API Key <span style={{ color: '#ef4444' }}>*</span>
            <span style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 14, height: 14, borderRadius: '50%',
              border: '1px solid #9ca3af',
              fontSize: 9, color: '#9ca3af',
              marginLeft: 4, verticalAlign: 'middle', cursor: 'default',
            }}>i</span>
          </label>
          <input
            type="text"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            style={fieldStyle}
          />
        </div>

        {/* Submit */}
        {addError && <div style={{ marginBottom: 10, fontSize: 12, color: '#ef4444' }}>{addError}</div>}
        <button
          type="button"
          onClick={handleAdd}
          disabled={!selectedProviderId || !apiKey || addingModel}
          style={{
            height: 36, padding: '0 24px',
            background: selectedProviderId && apiKey && !addingModel ? '#0091E0' : '#93c5fd',
            color: '#fff', border: 'none', borderRadius: 4,
            fontSize: 12, fontWeight: 700,
            cursor: selectedProviderId && apiKey && !addingModel ? 'pointer' : 'not-allowed',
            letterSpacing: 0.8, textTransform: 'uppercase',
          }}
        >
          {addingModel ? 'Saving…' : 'SUBMIT'}
        </button>
      </div>
    );
  }

  /* ── List view ── */
  return (
    <div style={{ paddingTop: 8 }}>
      {actionOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 19 }}
          onClick={() => setActionOpen(null)}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>AI Model</h2>
        <button
          type="button"
          onClick={() => setView('add')}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            height: 34, padding: '0 14px',
            background: '#0091E0', color: '#fff',
            border: 'none', borderRadius: 4,
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <span style={{
            width: 16, height: 16, borderRadius: '50%',
            border: '1.5px solid #fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, lineHeight: 1, fontWeight: 300,
          }}>+</span>
          Add AI Model
        </button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'visible' }}>
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'flex-end', borderBottom: '1px solid #f3f4f6' }}>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search"
            style={{
              height: 32, padding: '0 10px', width: 180,
              border: '1px solid #e5e7eb', borderRadius: 4,
              fontSize: 12, color: '#374151', outline: 'none',
            }}
          />
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thBase} onClick={() => toggleSort('provider')}>
                AI Provider <SortIcon dir={sort?.col === 'provider' ? sort.dir : null} />
              </th>
              <th style={{ ...thBase, ...thBorder }} onClick={() => toggleSort('createdOn')}>
                Created On <SortIcon dir={sort?.col === 'createdOn' ? sort.dir : null} />
              </th>
              <th style={{ ...thBase, ...thBorder, cursor: 'default' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={3} style={{ ...tdBase, textAlign: 'center', color: '#9ca3af', padding: 28 }}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={3} style={{ ...tdBase, textAlign: 'center', color: '#ef4444', padding: 28 }}>
                  Failed to load AI models
                </td>
              </tr>
            )}
            {!loading && !error && paginated.map(model => (
              <tr key={model.id}>
                <td style={tdBase}>
                  {model.provider}
                  {model.isDefault && (
                    <span style={{
                      marginLeft: 8, fontSize: 11, fontWeight: 600,
                      color: '#16a34a', background: '#dcfce7',
                      padding: '2px 8px', borderRadius: 10,
                    }}>
                      Default
                    </span>
                  )}
                </td>
                <td style={{ ...tdBase, ...thBorder }}>{model.createdOn}</td>
                <td style={{ ...tdBase, ...thBorder, position: 'relative' }}>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <button
                      type="button"
                      onClick={() => setActionOpen(actionOpen === model.id ? null : model.id)}
                      disabled={actionLoading === model.id}
                      style={{
                        background: 'none', border: 'none', cursor: actionLoading === model.id ? 'not-allowed' : 'pointer',
                        fontSize: 16, color: '#6b7280', padding: '2px 6px', letterSpacing: 2,
                        opacity: actionLoading === model.id ? 0.4 : 1,
                      }}
                    >
                      •••
                    </button>
                    {actionOpen === model.id && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, zIndex: 20,
                        background: '#fff', border: '1px solid #e5e7eb',
                        borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        minWidth: 140, overflow: 'hidden',
                      }}>
                        {!model.isDefault && (
                          <button
                            type="button"
                            onClick={() => handleSetDefault(model.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              width: '100%', padding: '9px 14px',
                              background: 'none', border: 'none',
                              textAlign: 'left', fontSize: 12, cursor: 'pointer', color: '#374151',
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="#374151" stroke="none">
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                            </svg>
                            Set as Default
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(model.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            width: '100%', padding: '9px 14px',
                            background: 'none', border: 'none',
                            textAlign: 'left', fontSize: 12, cursor: 'pointer', color: '#ef4444',
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/>
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && !error && paginated.length === 0 && (
              <tr>
                <td colSpan={3} style={{ ...tdBase, textAlign: 'center', color: '#9ca3af', padding: 28 }}>
                  No AI models configured
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderTop: '1px solid #f3f4f6',
          fontSize: 12, color: '#6b7280',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Rows per page:</span>
            <select
              value={rowsPerPage}
              onChange={e => { setRowsPerPage(Number(e.target.value)); setPage(1); }}
              style={{ height: 26, padding: '0 4px', border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 12, color: '#374151' }}
            >
              {[10, 20, 50].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>
              Showing: {filtered.length === 0 ? 0 : start + 1} – {Math.min(start + rowsPerPage, filtered.length)} of {filtered.length}
            </span>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={paginationBtn(page === 1)}>Previous</button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i + 1} onClick={() => setPage(i + 1)} style={{
                width: 28, height: 28, border: '1px solid #e5e7eb', borderRadius: 4,
                background: page === i + 1 ? '#0091E0' : '#fff',
                color: page === i + 1 ? '#fff' : '#374151',
                fontSize: 12, cursor: 'pointer', fontWeight: page === i + 1 ? 600 : 400,
              }}>{i + 1}</button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={paginationBtn(page >= totalPages)}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
