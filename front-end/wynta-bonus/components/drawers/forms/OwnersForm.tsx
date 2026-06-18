'use client';
import { useState } from 'react';
import { useAppSelector } from '../../../store/hooks';
import { selectHeadById } from '../../../store/slices/headsSlice';
import { selectSubheadById } from '../../../store/slices/subheadsSlice';
import { selectAllUsers } from 'wynta-react-common/store/slices/usersSlice';
import Icon from 'wynta-react-common/components/Icon';
import DrawerFooter from '../../../components/drawers/DrawerFooter';
import type { DrawerState, OwnerEntry, OwnerRole } from '../../../types';

const ROLE_OPTIONS: { value: OwnerRole; label: string }[] = [
  { value: 'OPS_LEAD', label: 'Ops Lead' },
  { value: 'CAMPAIGN_MANAGER', label: 'Campaign Manager' },
  { value: 'FINANCE_APPROVER', label: 'Finance Approver' },
  { value: 'ESCALATION_CONTACT', label: 'Escalation Contact' },
];

interface OwnerRow {
  username: string;
  role: string;
}

interface OwnersFormProps {
  state: DrawerState;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

export default function OwnersForm({ state, submitting, onCancel, onSubmit }: OwnersFormProps) {
  const scope = state.scope === 'subhead' ? 'subhead' : 'head';
  const head = useAppSelector(
    scope === 'head' && state.id != null ? selectHeadById(state.id) : () => undefined,
  );
  const subhead = useAppSelector(
    scope === 'subhead' && state.id != null ? selectSubheadById(state.id) : () => undefined,
  );
  const entity = scope === 'head' ? head : subhead;
  const users = useAppSelector(selectAllUsers);

  const existing: OwnerEntry[] = entity?.owners ?? [];
  const [rows, setRows] = useState<OwnerRow[]>(() =>
    existing.filter((o) => o.active).map((o) => ({ username: o.username, role: o.role })),
  );
  const [error, setError] = useState<string | null>(null);

  const setRow = (i: number, patch: Partial<OwnerRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => {
    setRows((rs) => [...rs, { username: '', role: 'CAMPAIGN_MANAGER' }]);
    setError(null);
  };
  const removeRow = (i: number) => {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
    setError(null);
  };

  // Selectable usernames: system users plus anything already assigned
  // (older records may reference users that no longer exist in the list).
  const usernameOptions = Array.from(
    new Set([...users.map((u) => u.display_name), ...existing.map((o) => o.username)]),
  ).sort();

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    if (rows.some((r) => r.username === '')) {
      setError('Choose a user for every row, or remove the empty rows.');
      return;
    }
    const names = rows.map((r) => r.username);
    if (new Set(names).size !== names.length) {
      setError('Each user can only be listed once.');
      return;
    }
    // Owners that were active before but are no longer listed are soft-removed
    const removed = existing
      .filter((o) => o.active && !names.includes(o.username))
      .map((o) => ({ username: o.username, role: o.role, active: false }));
    const owners = [
      ...rows.map((r) => ({ username: r.username, role: r.role, active: true })),
      ...removed,
    ];
    if (owners.length === 0) {
      setError('Add at least one owner.');
      return;
    }
    setError(null);
    onSubmit({ owners });
  };

  return (
    <form onSubmit={handle} style={{ display: 'contents' }}>
      <div className="drawer-body">
        {entity && (
          <div className="field-group">
            <label>{scope === 'head' ? 'Head' : 'Subhead'}</label>
            <span className="parent-chip">
              <Icon name={scope === 'head' ? 'folder' : 'folder-tree'} size={11} /> {entity.name}
            </span>
          </div>
        )}

        <div className="field-group">
          <label>Owners</label>
          {rows.length === 0 && (
            <div className="helper" style={{ fontStyle: 'italic' }}>
              No owners assigned — add one below.
            </div>
          )}
        </div>

        {rows.map((row, i) => (
          <div
            key={i}
            style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}
          >
            <select
              value={row.username}
              onChange={(e) => { setRow(i, { username: e.target.value }); setError(null); }}
              style={{ flex: 1.4, height: 36, padding: '0 12px', border: '1px solid var(--g200)', borderRadius: 'var(--r)', fontSize: 13, color: 'var(--g900)', background: '#fff' }}
            >
              <option value="" disabled>Select user…</option>
              {usernameOptions.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <select
              value={row.role}
              onChange={(e) => setRow(i, { role: e.target.value })}
              style={{ flex: 1, height: 36, padding: '0 12px', border: '1px solid var(--g200)', borderRadius: 'var(--r)', fontSize: 13, color: 'var(--g900)', background: '#fff' }}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-icon-only"
              title="Remove owner"
              onClick={() => removeRow(i)}
            >
              <Icon name="trash-2" size={14} color="var(--err)" />
            </button>
          </div>
        ))}

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ width: 'fit-content' }}
          onClick={addRow}
        >
          <Icon name="user-plus" size={13} /> Add owner
        </button>

        {error && (
          <div className="helper" style={{ color: '#D64545', marginTop: 10 }}>
            {error}
          </div>
        )}

        <div className="helper" style={{ marginTop: 14 }}>
          Removing an owner deactivates their assignment — the change is recorded in the{' '}
          {scope} history.
        </div>
      </div>
      <DrawerFooter submitting={submitting} onCancel={onCancel} label="Save Owners" />
    </form>
  );
}
