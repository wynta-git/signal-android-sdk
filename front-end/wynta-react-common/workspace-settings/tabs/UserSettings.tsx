'use client';
import { useState, useEffect, useMemo } from 'react';
import UserAddEditForm from './UserAddEditForm';

interface ApiUser {
  id: number | null;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  date_joined: string;
}

interface UserRow {
  key: string;
  id: number | null;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  joinedAt: string;
}

type UserSortCol = 'email' | 'firstName' | 'lastName' | 'role' | 'joinedAt';
type View = 'list' | 'add' | 'edit';

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

const COLS: { key: UserSortCol; label: string }[] = [
  { key: 'email',     label: 'Email'      },
  { key: 'firstName', label: 'First Name' },
  { key: 'lastName',  label: 'Last Name'  },
  { key: 'role',      label: 'Role'       },
  { key: 'joinedAt',  label: 'Joined On'  },
];

export default function UserSettings() {
  const [view, setView]               = useState<View>('list');
  const [editUserId, setEditUserId]   = useState<number | null>(null);
  const [users, setUsers]             = useState<UserRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(false);
  const [search, setSearch]           = useState('');
  const [sort, setSort]               = useState<{ col: UserSortCol; dir: 'asc' | 'desc' } | null>(null);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [page, setPage]               = useState(1);
  const [deleteId, setDeleteId]       = useState<number | null>(null);
  const [deleting, setDeleting]       = useState(false);

  function loadUsers() {
    setLoading(true);
    setError(false);
    fetch('/api/v1/users/', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        const list: ApiUser[] = data?.data ?? [];
        setUsers(list.map((u, i) => ({
          key:       u.id != null ? String(u.id) : `user-${i}`,
          id:        u.id,
          email:     u.email,
          firstName: u.first_name,
          lastName:  u.last_name,
          role:      u.role,
          joinedAt:  u.date_joined,
        })));
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadUsers(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDelete() {
    if (deleteId == null) return;
    setDeleting(true);
    fetch(`/api/v1/users/${deleteId}/`, { method: 'DELETE', credentials: 'include' })
      .then(() => { setDeleteId(null); loadUsers(); })
      .catch(() => {})
      .finally(() => setDeleting(false));
  }

  const filtered = useMemo(() => {
    let list = [...users];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(u =>
        u.email.toLowerCase().includes(q) ||
        u.firstName.toLowerCase().includes(q) ||
        u.lastName.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
      );
    }
    if (sort) {
      list.sort((a, b) => {
        const va = a[sort.col];
        const vb = b[sort.col];
        return sort.dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    return list;
  }, [users, search, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const start      = (page - 1) * rowsPerPage;
  const paginated  = filtered.slice(start, start + rowsPerPage);

  function toggleSort(col: UserSortCol) {
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

  if (view === 'add') {
    return (
      <UserAddEditForm
        mode="add"
        onBack={() => setView('list')}
        onSaved={() => { setView('list'); loadUsers(); }}
      />
    );
  }

  if (view === 'edit' && editUserId != null) {
    return (
      <UserAddEditForm
        mode="edit"
        userId={editUserId}
        onBack={() => setView('list')}
        onSaved={() => { setView('list'); loadUsers(); }}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, marginTop: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>Users</h2>
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
          Add User
        </button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search"
            style={{
              height: 32, padding: '0 10px', width: 200,
              border: '1px solid #e5e7eb', borderRadius: 4,
              fontSize: 12, color: '#374151', outline: 'none',
            }}
          />
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{
            fontFamily: 'sans-serif', lineHeight: 1.15,
            borderCollapse: 'collapse', width: '100%',
            backgroundColor: 'transparent', marginTop: 0, marginBottom: 0,
          }}>
            <thead>
              <tr>
                {COLS.map((col, i) => (
                  <th
                    key={col.key}
                    style={{ ...thBase, ...(i > 0 ? thBorder : {}) }}
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.label}
                    <SortIcon dir={sort?.col === col.key ? sort.dir : null} />
                  </th>
                ))}
                <th style={{ ...thBase, ...thBorder, cursor: 'default' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} style={{ ...tdBase, textAlign: 'center', color: '#9ca3af', padding: 24 }}>
                    Loading users…
                  </td>
                </tr>
              )}
              {!loading && error && (
                <tr>
                  <td colSpan={6} style={{ ...tdBase, textAlign: 'center', color: '#ef4444', padding: 24 }}>
                    Failed to load users
                  </td>
                </tr>
              )}
              {!loading && !error && paginated.map(user => (
                <tr key={user.key}>
                  <td style={{ ...tdBase, color: '#2563eb' }}>{user.email}</td>
                  <td style={{ ...tdBase, ...thBorder }}>{user.firstName}</td>
                  <td style={{ ...tdBase, ...thBorder }}>{user.lastName}</td>
                  <td style={{ ...tdBase, ...thBorder, textTransform: 'capitalize' }}>{user.role}</td>
                  <td style={{ ...tdBase, ...thBorder }}>{user.joinedAt}</td>
                  <td style={{ ...tdBase, ...thBorder }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (user.id != null) { setEditUserId(user.id); setView('edit'); }
                        }}
                        style={{
                          padding: '3px 10px', border: '1px solid #d1d5db', borderRadius: 4,
                          background: '#fff', fontSize: 11, cursor: 'pointer', color: '#374151',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => { if (user.id != null) setDeleteId(user.id); }}
                        style={{
                          padding: '3px 10px', border: '1px solid #fca5a5', borderRadius: 4,
                          background: '#fff', fontSize: 11, cursor: 'pointer', color: '#ef4444',
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && !error && paginated.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ ...tdBase, textAlign: 'center', color: '#9ca3af', padding: 24 }}>
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

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
              <button
                key={i + 1}
                onClick={() => setPage(i + 1)}
                style={{
                  width: 28, height: 28, border: '1px solid #e5e7eb', borderRadius: 4,
                  background: page === i + 1 ? '#0091E0' : '#fff',
                  color: page === i + 1 ? '#fff' : '#374151',
                  fontSize: 12, cursor: 'pointer', fontWeight: page === i + 1 ? 600 : 400,
                }}
              >
                {i + 1}
              </button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={paginationBtn(page >= totalPages)}>Next</button>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteId != null && (
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
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                style={{
                  padding: '8px 16px', border: '1px solid #d1d5db', borderRadius: 4,
                  background: '#fff', fontSize: 13, cursor: 'pointer', color: '#374151',
                }}
              >
                Cancel
              </button>
              <button
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
