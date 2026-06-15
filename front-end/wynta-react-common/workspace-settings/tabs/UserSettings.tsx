'use client';
import { useState, useMemo } from 'react';
import { DEFAULT_USERS } from '../constants';
import type { WorkspaceUser } from '../types';

type UserSortCol = 'email' | 'firstName' | 'lastName' | 'role' | 'joinedAt';

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
  const [users] = useState<WorkspaceUser[]>(DEFAULT_USERS);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ col: UserSortCol; dir: 'asc' | 'desc' } | null>(null);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [page, setPage] = useState(1);

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
        const map: Record<UserSortCol, string> = {
          email: a.email, firstName: a.firstName, lastName: a.lastName,
          role: a.role, joinedAt: a.joinedAt,
        };
        const mapB: Record<UserSortCol, string> = {
          email: b.email, firstName: b.firstName, lastName: b.lastName,
          role: b.role, joinedAt: b.joinedAt,
        };
        return sort.dir === 'asc'
          ? map[sort.col].localeCompare(mapB[sort.col])
          : mapB[sort.col].localeCompare(map[sort.col]);
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

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, marginTop: 10 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>Add Users</h2>
        <button type="button" style={{
          display: 'flex', alignItems: 'center', gap: 7,
          height: 34, padding: '0 14px',
          background: '#0091E0', color: '#fff',
          border: 'none', borderRadius: 4,
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>
          <span style={{
            width: 16, height: 16, borderRadius: '50%',
            border: '1.5px solid #fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, lineHeight: 1, fontWeight: 300,
          }}>+</span>
          Add User
        </button>
      </div>

      {/* Table card */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
        {/* Search */}
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

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            fontFamily: 'sans-serif',
            lineHeight: 1.15,
            wordWrap: 'break-word',
            borderCollapse: 'collapse',
            maxWidth: '100%',
            backgroundColor: 'transparent',
            marginTop: 0,
            marginBottom: 0,
            maxHeight: 400,
            overflow: 'auto',
            width: '100%',
          }}>
            <thead>
              <tr>
                {COLS.map((col, i) => (
                  <th key={col.key} style={{ ...thBase, ...(i > 0 ? thBorder : {}) }} onClick={() => toggleSort(col.key)}>
                    {col.label}
                    <SortIcon dir={sort?.col === col.key ? sort.dir : null} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map(user => (
                <tr key={user.id}>
                  <td style={{ ...tdBase, color: '#2563eb' }}>{user.email}</td>
                  <td style={{ ...tdBase, ...thBorder }}>{user.firstName}</td>
                  <td style={{ ...tdBase, ...thBorder }}>{user.lastName}</td>
                  <td style={{ ...tdBase, ...thBorder, textTransform: 'capitalize' }}>
                    {user.role === 'owner' ? 'Account Manager' : user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </td>
                  <td style={{ ...tdBase, ...thBorder }}>{user.joinedAt}</td>
                </tr>
              ))}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ ...tdBase, textAlign: 'center', color: '#9ca3af', padding: 24 }}>
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

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
