'use client';
import { useState } from 'react';
import { useAppSelector } from '../../../store/hooks';
import { selectHeadById } from '../../../store/slices/headsSlice';
import { selectSubheadById } from '../../../store/slices/subheadsSlice';
import { selectAllUsers } from 'wynta-react-common/store/slices/usersSlice';
import Icon from 'wynta-react-common/components/Icon';
import DrawerFooter from '../../../components/drawers/DrawerFooter';
import type { DrawerState } from '../../../types';

interface OwnerFormProps {
  state: DrawerState;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

export default function OwnerForm({ state, submitting, onCancel, onSubmit }: OwnerFormProps) {
  const scope = state.scope === 'subhead' ? 'subhead' : 'head';
  const head = useAppSelector(
    scope === 'head' && state.id != null ? selectHeadById(state.id) : () => undefined,
  );
  const subhead = useAppSelector(
    scope === 'subhead' && state.id != null ? selectSubheadById(state.id) : () => undefined,
  );
  const entity = scope === 'head' ? head : subhead;
  const users = useAppSelector(selectAllUsers);

  const [owner, setOwner] = useState(entity?.owner ?? '');
  const [error, setError] = useState<string | null>(null);

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!owner) {
      setError('Choose a main owner.');
      return;
    }
    setError(null);
    onSubmit({ owner });
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
          <label>Main Owner</label>
          <select
            value={owner}
            onChange={(e) => { setOwner(e.target.value); setError(null); }}
            required
          >
            <option value="" disabled>Select owner…</option>
            {users.map((u) => (
              <option key={u.id} value={u.display_name}>
                {u.display_name} — {u.role}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="helper" style={{ color: '#D64545', marginTop: 10 }}>
            {error}
          </div>
        )}

        <div className="helper" style={{ marginTop: 14 }}>
          The main owner is the single accountable person for this {scope}. To manage the
          full list of stakeholders and their roles, use &quot;Edit Owners&quot; instead.
        </div>
      </div>
      <DrawerFooter submitting={submitting} onCancel={onCancel} label="Save Owner" />
    </form>
  );
}
