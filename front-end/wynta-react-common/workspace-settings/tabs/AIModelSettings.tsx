'use client';
import { useState, useMemo } from 'react';
import { DEFAULT_AI_MODELS } from '../constants';
import type { AIModel } from '../types';

type AISortCol = 'provider' | 'createdOn';

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

const AI_MODULE_OPTIONS = ['ChatGPT', 'Gemini', 'Claude', 'Llama', 'Mistral', 'Custom'];

export default function AIModelSettings() {
  const [models, setModels] = useState<AIModel[]>(DEFAULT_AI_MODELS);
  const [sort, setSort] = useState<{ col: AISortCol; dir: 'asc' | 'desc' } | null>(null);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newProvider, setNewProvider] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [page, setPage] = useState(1);
  const [actionOpen, setActionOpen] = useState<string | null>(null);

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

  function handleAdd() {
    if (!newProvider) return;
    const today = new Date().toISOString().slice(0, 10);
    setModels(prev => [...prev, {
      id: String(prev.length + 1),
      provider: newProvider,
      createdOn: today,
      isDefault: prev.length === 0,
    }]);
    setNewProvider('');
    setShowAdd(false);
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

  /* ── Add AI Model view ── */
  if (showAdd) {
    return (
      <div style={{ paddingTop: 24 }}>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => setShowAdd(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, color: '#6b7280' }}
          >
            AI Model
          </button>
          <span>›</span>
          <span style={{ color: '#111827', fontWeight: 500 }}>Add AI Model</span>
        </div>

        {/* Info banner */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '12px 16px', background: '#f3f4f6',
          border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 20,
        }}>
          <span style={{ color: '#6b7280', fontSize: 14, flexShrink: 0, marginTop: 1 }}>ℹ</span>
          <span style={{ fontSize: 13, color: '#374151' }}>
            <strong>Choose the AI model</strong> that best fits your needs for speed, intelligence and output quality.{' '}
            <a href="#" style={{ color: '#0091E0', fontWeight: 500 }}>Help &amp; Support</a>
          </span>
        </div>

        {/* Form */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#374151', marginBottom: 6 }}>
            AI Module <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select
            value={newProvider}
            onChange={e => setNewProvider(e.target.value)}
            style={{
              width: '100%', maxWidth: 520, height: 38, padding: '0 10px',
              border: '1px solid #d1d5db', borderRadius: 4,
              fontSize: 13, color: newProvider ? '#374151' : '#9ca3af',
              background: '#fff', outline: 'none', cursor: 'pointer',
            }}
          >
            <option value="" disabled>Select</option>
            {AI_MODULE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          style={{
            height: 36, padding: '0 24px',
            background: '#0091E0', color: '#fff',
            border: 'none', borderRadius: 4,
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            letterSpacing: 0.8, textTransform: 'uppercase',
          }}
        >
          SUBMIT
        </button>
      </div>
    );
  }

  /* ── Main list view ── */
  return (
    <div style={{ paddingTop: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>AI Model</h2>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
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

      {/* Table card */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'visible' }}>
        {/* Search */}
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

        {/* Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thBase} onClick={() => toggleSort('provider')}>
                AI Provider <SortIcon dir={sort?.col === 'provider' ? sort.dir : null} />
              </th>
              <th style={{ ...thBase, ...thBorder }} onClick={() => toggleSort('createdOn')}>
                Created On <SortIcon dir={sort?.col === 'createdOn' ? sort.dir : null} />
              </th>
              <th style={{ ...thBase, ...thBorder }}>
                Action <SortIcon dir={null} />
              </th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(model => (
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
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 16, color: '#6b7280', padding: '2px 6px', letterSpacing: 2,
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
                          <button type="button" onClick={() => {
                            setModels(ms => ms.map(m => ({ ...m, isDefault: m.id === model.id })));
                            setActionOpen(null);
                          }} style={{
                            display: 'block', width: '100%', padding: '9px 14px',
                            background: 'none', border: 'none',
                            textAlign: 'left', fontSize: 12, cursor: 'pointer', color: '#374151',
                          }}>
                            Set as Default
                          </button>
                        )}
                        <button type="button" onClick={() => {
                          setModels(ms => ms.filter(m => m.id !== model.id));
                          setActionOpen(null);
                        }} style={{
                          display: 'block', width: '100%', padding: '9px 14px',
                          background: 'none', border: 'none',
                          textAlign: 'left', fontSize: 12, cursor: 'pointer', color: '#ef4444',
                        }}>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={3} style={{ ...tdBase, textAlign: 'center', color: '#9ca3af', padding: 28 }}>
                  No AI models configured
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
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
            <span>Showing: {start + 1} - {Math.min(start + rowsPerPage, filtered.length)} of {filtered.length}</span>
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
