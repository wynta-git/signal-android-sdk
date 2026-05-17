'use client';
import { useState } from 'react';
import { useAppDispatch } from '@/store/hooks';
import { createSubhead, updateSubhead } from '@/store/slices/subheadsSlice';
import { MOCK_HEADS } from '@/services/mocks/heads';
import { MOCK_SUBHEADS } from '@/services/mocks/subheads';
import Icon from '@/components/primitives/Icon';
import Toggle from '@/components/primitives/Toggle';
import DrawerFooter from '@/components/drawers/DrawerFooter';

export default function SubheadForm({ mode, state, submitting, onCancel, onSubmit }) {
  const dispatch = useAppDispatch();
  const sub = mode === 'edit' ? MOCK_SUBHEADS[state.id] : null;
  const parentHead = MOCK_HEADS[state.parentId || sub?.parent_head_id];
  const [name, setName] = useState(sub?.name || '');
  const [description, setDescription] = useState(sub?.description || '');
  const [owner, setOwner] = useState(sub?.owner || 'vanessa@wynta.com');
  const [active, setActive] = useState(sub ? sub.active : true);

  const handle = (e) => {
    e.preventDefault();
    const payload = { name, description, owner, active };
    if (mode === 'new') {
      dispatch(createSubhead({ parentId: state.parentId, payload }));
    } else {
      dispatch(updateSubhead({ id: state.id, patch: payload }));
    }
    onSubmit({ type: state.type, ...payload });
  };

  return (
    <form onSubmit={handle} style={{ display: 'contents' }}>
      <div className="drawer-body">
        {parentHead && (
          <div className="field-group">
            <label>Parent Head</label>
            <span className="parent-chip">
              <Icon name="folder" size={11}/> {parentHead.name}
            </span>
          </div>
        )}
        <div className="field-group">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. First Deposit Match" required/>
        </div>
        <div className="field-group">
          <label>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short summary"/>
        </div>
        <div className="field-group">
          <label>Owner</label>
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option>vanessa@wynta.com</option>
            <option>demo@wynta.com</option>
            <option>priya@wynta.com</option>
            <option>ops@wynta.com</option>
          </select>
        </div>
        <div className="field-group">
          <Toggle on={active} onChange={setActive} label={active ? 'Active' : 'Paused'}/>
        </div>
      </div>
      <DrawerFooter submitting={submitting} onCancel={onCancel} label={mode === 'new' ? 'Create Subhead' : 'Save Changes'}/>
    </form>
  );
}
