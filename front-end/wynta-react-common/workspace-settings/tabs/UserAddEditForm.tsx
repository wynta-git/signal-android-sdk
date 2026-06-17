'use client';
import { useState, useEffect, useMemo } from 'react';

type MenuItems = Record<string, string[]>;

interface Props {
  mode: 'add' | 'edit';
  userId?: number;
  onBack: () => void;
  onSaved: () => void;
}

function Checkbox({ checked, indeterminate, onChange }: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
}) {
  const active = checked || !!indeterminate;
  return (
    <div
      onClick={onChange}
      style={{
        width: 18, height: 18, borderRadius: 3,
        border: `2px solid ${active ? '#0091E0' : '#d1d5db'}`,
        background: active ? '#0091E0' : '#fff',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, transition: 'border-color 0.1s, background 0.1s',
      }}
    >
      {indeterminate && !checked && (
        <div style={{ width: 8, height: 2, background: '#fff', borderRadius: 1 }} />
      )}
      {checked && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

export default function UserAddEditForm({ mode, userId, onBack, onSaved }: Props) {
  const [menuItems, setMenuItems] = useState<MenuItems>({});
  const [loading, setLoading]     = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [fields, setFields]       = useState({ email: '', first_name: '', last_name: '', role: '' });
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [permSearch, setPermSearch] = useState('');
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    const reqs: Promise<unknown>[] = [
      fetch('/api/v1/users/form-data/', { credentials: 'include' }).then(r => r.json()),
    ];
    if (mode === 'edit' && userId != null) {
      reqs.push(fetch(`/api/v1/users/${userId}/`, { credentials: 'include' }).then(r => r.json()));
    }
    Promise.all(reqs)
      .then(([fd, ud]) => {
        const formData = fd as { menu_items?: MenuItems };
        setMenuItems(formData?.menu_items ?? {});
        if (ud) {
          const u = ((ud as { data?: Record<string, unknown> })?.data ?? ud) as Record<string, unknown>;
          setFields({
            email:      String(u.email      ?? ''),
            first_name: String(u.first_name ?? ''),
            last_name:  String(u.last_name  ?? ''),
            role:       String(u.role       ?? ''),
          });
          const perms = (u.permissions as string[] | undefined) ?? [];
          setSelected(new Set(perms));
        }
      })
      .catch(() => setFormError('Failed to load form data'))
      .finally(() => setLoading(false));
  }, [mode, userId]);

  const entries = useMemo(() => Object.entries(menuItems), [menuItems]);

  function leafKey(parent: string, child?: string) {
    return child != null ? `${parent}/${child}` : parent;
  }

  function parentState(parent: string, children: string[]): 'checked' | 'indeterminate' | 'unchecked' {
    if (children.length === 0) return selected.has(parent) ? 'checked' : 'unchecked';
    const count = children.filter(c => selected.has(`${parent}/${c}`)).length;
    if (count === 0) return 'unchecked';
    if (count === children.length) return 'checked';
    return 'indeterminate';
  }

  function toggleParent(parent: string, children: string[]) {
    setSelected(prev => {
      const next = new Set(prev);
      if (children.length === 0) {
        if (next.has(parent)) next.delete(parent); else next.add(parent);
      } else {
        const state = parentState(parent, children);
        if (state === 'checked') {
          children.forEach(c => next.delete(`${parent}/${c}`));
        } else {
          children.forEach(c => next.add(`${parent}/${c}`));
        }
      }
      return next;
    });
  }

  function toggleChild(parent: string, child: string) {
    setSelected(prev => {
      const next = new Set(prev);
      const k = `${parent}/${child}`;
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  const allLeafKeys = useMemo(() =>
    entries.flatMap(([p, children]) =>
      children.length === 0 ? [p] : children.map(c => `${p}/${c}`)
    ), [entries]);

  const totalCount    = allLeafKeys.length;
  const selectedCount = allLeafKeys.filter(k => selected.has(k)).length;
  const allState: 'checked' | 'indeterminate' | 'unchecked' =
    selectedCount === 0 ? 'unchecked' : selectedCount === totalCount ? 'checked' : 'indeterminate';

  function toggleAll() {
    setSelected(allState === 'checked' ? new Set() : new Set(allLeafKeys));
  }

  const filteredEntries = useMemo(() => {
    if (!permSearch) return entries;
    const q = permSearch.toLowerCase();
    return entries
      .map(([parent, children]): [string, string[]] | null => {
        const parentMatch   = parent.toLowerCase().includes(q);
        const matchChildren = children.filter(c => c.toLowerCase().includes(q));
        if (!parentMatch && matchChildren.length === 0) return null;
        return [parent, parentMatch ? children : matchChildren];
      })
      .filter((x): x is [string, string[]] => x != null);
  }, [entries, permSearch]);

  function handleSubmit() {
    setSaving(true);
    setFormError(null);
    const url    = mode === 'add' ? '/api/v1/users/' : `/api/v1/users/${userId}/`;
    const method = mode === 'add' ? 'POST' : 'PUT';
    fetch(url, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fields, permissions: Array.from(selected) }),
    })
      .then(res => { if (!res.ok) throw new Error('Save failed'); onSaved(); })
      .catch(e => setFormError((e as Error).message))
      .finally(() => setSaving(false));
  }

  const inputStyle: React.CSSProperties = {
    height: 38, padding: '0 10px',
    border: '1px solid #d1d5db', borderRadius: 4,
    fontSize: 13, color: '#374151', background: '#fff',
    outline: 'none', width: '100%', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12, color: '#6b7280', marginBottom: 4, display: 'block',
  };

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 8 }}>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 14 }}>
        <span onClick={onBack} style={{ color: '#6b7280', cursor: 'pointer' }}>Users</span>
        <span style={{ color: '#9ca3af' }}>›</span>
        <span style={{ color: '#111827', fontWeight: 500 }}>
          {mode === 'add' ? 'Add User' : 'Edit User'}
        </span>
        <span style={{
          width: 16, height: 16, borderRadius: '50%',
          border: '1px solid #d1d5db',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, color: '#6b7280',
        }}>i</span>
      </div>

      {formError && (
        <div style={{
          background: '#fee2e2', color: '#dc2626', borderRadius: 4,
          padding: '8px 12px', fontSize: 13, marginBottom: 12,
        }}>
          {formError}
        </div>
      )}

      {/* Fields */}
      <div style={{
        border: '1px solid #e5e7eb', borderRadius: 6,
        padding: '20px 24px', background: '#fff', marginBottom: 16,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>Email Address</label>
            <input
              value={fields.email}
              onChange={e => setFields(f => ({ ...f, email: e.target.value }))}
              placeholder="This email address must be of the primary user of th..."
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>First Name</label>
            <input
              value={fields.first_name}
              onChange={e => setFields(f => ({ ...f, first_name: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Last Name</label>
            <input
              value={fields.last_name}
              onChange={e => setFields(f => ({ ...f, last_name: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Role</label>
            <input
              value={fields.role}
              onChange={e => setFields(f => ({ ...f, role: e.target.value }))}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Permissions */}
      <div style={{
        border: '1px solid #e5e7eb', borderRadius: 6,
        background: '#fff', marginBottom: 16, overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ fontSize: 13, color: '#374151', marginBottom: 12 }}>
            Select the access you'd like this user to have
          </div>
          <div style={{ position: 'relative', width: 240 }}>
            <svg
              width="13" height="13" viewBox="0 0 13 13" fill="none"
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            >
              <circle cx="5.5" cy="5.5" r="4.5" stroke="#9ca3af" strokeWidth="1.4" />
              <line x1="9" y1="9" x2="12" y2="12" stroke="#9ca3af" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <input
              value={permSearch}
              onChange={e => setPermSearch(e.target.value)}
              placeholder="Search.."
              style={{
                height: 34, padding: '0 10px 0 30px',
                border: '1px solid #e5e7eb', borderRadius: 20,
                fontSize: 12, color: '#374151', outline: 'none',
                width: '100%', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        <div style={{ padding: '12px 20px' }}>
          {!permSearch && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Checkbox
                checked={allState === 'checked'}
                indeterminate={allState === 'indeterminate'}
                onChange={toggleAll}
              />
              <span style={{ fontSize: 13, color: '#374151' }}>
                Select All{' '}
                <span style={{ color: '#6b7280' }}>({selectedCount}/{totalCount})</span>
              </span>
            </div>
          )}

          {filteredEntries.map(([parent, children], gi) => {
            const pState = parentState(parent, children);
            return (
              <div
                key={parent}
                style={{
                  borderTop: gi > 0 ? '1px solid #f3f4f6' : undefined,
                  paddingTop: gi > 0 ? 10 : 0,
                  marginBottom: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: children.length > 0 ? 8 : 0 }}>
                  <Checkbox
                    checked={pState === 'checked'}
                    indeterminate={pState === 'indeterminate'}
                    onChange={() => toggleParent(parent, children)}
                  />
                  <span style={{ fontSize: 13, fontWeight: children.length > 0 ? 500 : 400, color: '#374151' }}>
                    {parent}
                  </span>
                </div>
                {children.map(child => (
                  <div
                    key={child}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 28, marginBottom: 6 }}
                  >
                    <Checkbox
                      checked={selected.has(leafKey(parent, child))}
                      onChange={() => toggleChild(parent, child)}
                    />
                    <span style={{ fontSize: 13, color: '#374151' }}>{child}</span>
                  </div>
                ))}
              </div>
            );
          })}

          {filteredEntries.length === 0 && (
            <div style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>No permissions match your search.</div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        padding: '12px 0', borderTop: '1px solid rgba(231,234,243,0.7)',
      }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          style={{
            height: 40, padding: '0 32px',
            background: '#0091E0', color: '#fff',
            border: 'none', borderRadius: 4,
            fontSize: 14, fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'SAVING…' : 'SUBMIT'}
        </button>
      </div>
    </div>
  );
}
