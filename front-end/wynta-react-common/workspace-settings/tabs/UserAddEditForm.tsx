'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
const API_BASE = process.env.NEXT_PUBLIC_WYNTA_API_URL ?? '';
const AUTH_HEADERS: Record<string, string> = process.env.NEXT_PUBLIC_WYNTA_API_TOKEN
  ? { Authorization: process.env.NEXT_PUBLIC_WYNTA_API_TOKEN }
  : {};

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
  const [saving, setSaving]             = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const reqs: Promise<unknown>[] = [
      fetch(`${API_BASE}/api/v1/users/form-data/`, { headers: AUTH_HEADERS }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    ];
    if (mode === 'edit' && userId != null) {
      reqs.push(fetch(`${API_BASE}/api/v1/users/${userId}/`, { headers: AUTH_HEADERS }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }));
    }
    Promise.all(reqs)
      .then(([fd, ud]) => {
        const formData = fd as { data?: { menu_items?: MenuItems }; menu_items?: MenuItems };
        const menuItemsData: MenuItems = formData?.data?.menu_items ?? formData?.menu_items ?? {};
        setMenuItems(menuItemsData);
        if (ud) {
          const u = ((ud as { data?: Record<string, unknown> })?.data ?? ud) as Record<string, unknown>;
          setFields({
            email:      String(u.email      ?? ''),
            first_name: String(u.first_name ?? ''),
            last_name:  String(u.last_name  ?? ''),
            role:       String(u.role       ?? ''),
          });
          // API returns flat ordered "options" array: parent name then its children
          // Process sequentially to resolve ambiguous names (e.g. "Deductions" is
          // both a top-level leaf AND a child of "Settings")
          const rawOptions: string[] =
            (u.options as string[] | undefined) ??
            (u.permissions as string[] | undefined) ??
            [];
          const normalized: string[] = [];
          let ctx: string | null = null;
          for (const item of rawOptions) {
            const isParentKey = item in menuItemsData;
            if (isParentKey && (menuItemsData[item] as string[]).length > 0) {
              // Parent with children — set context, don't add
              ctx = item;
              continue;
            }
            // Check if item is a child of current context first
            if (ctx && (menuItemsData[ctx] as string[]).includes(item)) {
              normalized.push(`${ctx}/${item}`);
              continue;
            }
            // Leaf parent not under current context
            if (isParentKey) {
              normalized.push(item);
              ctx = null;
              continue;
            }
            // Search all parents
            for (const [parent, children] of Object.entries(menuItemsData)) {
              if ((children as string[]).includes(item)) {
                normalized.push(`${parent}/${item}`);
                break;
              }
            }
          }
          setSelected(new Set(normalized));
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

  function buildOptions(): string[] {
    const result: string[] = [];
    for (const [parent, children] of Object.entries(menuItems)) {
      if (children.length === 0) {
        if (selected.has(parent)) result.push(parent);
      } else {
        const sel = children.filter(c => selected.has(`${parent}/${c}`));
        if (sel.length > 0) { result.push(parent); sel.forEach(c => result.push(c)); }
      }
    }
    return result;
  }

  function handleDelete() {
    if (userId == null) return;
    setDeleting(true);
    fetch(`${API_BASE}/api/v1/users/${userId}/`, { method: 'DELETE', headers: AUTH_HEADERS })
      .then(res => { if (!res.ok) throw new Error('Delete failed'); onBack(); })
      .catch(e => { setFormError((e as Error).message); setShowDeleteModal(false); })
      .finally(() => setDeleting(false));
  }

  function handleSubmit() {
    setSaving(true);
    setFormError(null);
    const url    = mode === 'add' ? `${API_BASE}/api/v1/users/` : `${API_BASE}/api/v1/users/${userId}/`;
    const method = mode === 'add' ? 'POST' : 'PUT';
    const payload = {
      email:     fields.email,
      firstname: fields.first_name,
      lastname:  fields.last_name,
      role:      fields.role,
      options:   buildOptions(),
    };
    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
      body: JSON.stringify(payload),
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, fontSize: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
        {mode === 'edit' && (
          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            style={{
              height: 34, padding: '0 14px',
              background: '#fff', color: '#ef4444',
              border: '1px solid #fca5a5', borderRadius: 4,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
            Delete
          </button>
        )}
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

      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 0', borderTop: '1px solid rgba(231,234,243,0.7)', marginTop: 8, position: 'sticky', bottom: 0, background: '#fff', zIndex: 10 }}>
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

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: '#fff', borderRadius: 8, padding: 24,
            maxWidth: 400, width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, color: '#111827' }}>Delete User</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#6b7280' }}>
              Are you sure you want to delete this user? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                style={{
                  padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 4,
                  background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  padding: '8px 16px', border: 'none', borderRadius: 4,
                  background: '#ef4444', color: '#fff', fontSize: 13,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
