'use client';
import { useState } from 'react';
import { useAppSelector } from '@/store/hooks';
import { selectHeadById } from '@/store/slices/headsSlice';
import Toggle from '@/components/primitives/Toggle';
import DrawerFooter from '@/components/drawers/DrawerFooter';
import type { DrawerState } from '@/types';

interface HeadFormProps {
  mode: 'new' | 'edit';
  state: DrawerState;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
}

export default function HeadForm({ mode, state, submitting, onCancel, onSubmit }: HeadFormProps) {
  const head = useAppSelector(selectHeadById(state.id ?? 0));
  const [name, setName] = useState(head?.name || '');
  const [description, setDescription] = useState(head?.description || '');
  const [owner, setOwner] = useState(head?.owner || 'vanessa@wynta.com');
  const [siteId, setSiteId] = useState(String(head?.site_id || 'wynta-demo'));
  const [active, setActive] = useState(head ? head.active : true);

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, description, owner, site_id: siteId, active });
  };

  return (
    <form onSubmit={handle} style={{ display: 'contents' }}>
      <div className="drawer-body">
        <div className="field-group">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Welcome Bonus Program" required/>
        </div>
        <div className="field-group">
          <label>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this program do?"/>
        </div>
        {mode === 'new' && (
          <div className="field-group">
            <label>Site ID</label>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              <option value="wynta-demo">wynta-demo</option>
              <option value="wynta-eu">wynta-eu</option>
              <option value="wynta-asia">wynta-asia</option>
            </select>
          </div>
        )}
        <div className="field-group">
          <label>Owner</label>
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="vanessa@wynta.com">vanessa@wynta.com</option>
            <option value="demo@wynta.com">demo@wynta.com</option>
            <option value="priya@wynta.com">priya@wynta.com</option>
            <option value="ops@wynta.com">ops@wynta.com</option>
          </select>
        </div>
        <div className="field-group">
          <Toggle on={active} onChange={setActive} label={active ? 'Active' : 'Paused'} />
          <div className="helper">Paused heads stop releasing bonuses across all their configures.</div>
        </div>
      </div>
      <DrawerFooter submitting={submitting} onCancel={onCancel} label={mode === 'new' ? 'Create Head' : 'Save Changes'}/>
    </form>
  );
}
