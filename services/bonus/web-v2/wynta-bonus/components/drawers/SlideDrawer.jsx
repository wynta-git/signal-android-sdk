'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import { closeDrawer } from '@/store/slices/uiSlice';
import Icon from '@/components/primitives/Icon';
import DrawerForm from './DrawerForm';

const DRAWER_TITLES = {
  NEW_HEAD:       { title: 'Add Bonus Head',               icon: 'folder-plus' },
  EDIT_HEAD:      { title: 'Edit Bonus Head',               icon: 'pencil' },
  NEW_SUBHEAD:    { title: 'Add Subhead',                   icon: 'plus-circle' },
  EDIT_SUBHEAD:   { title: 'Edit Subhead',                  icon: 'pencil' },
  NEW_CONFIGURE:  { title: 'Add Configure',                 icon: 'settings-2' },
  EDIT_CONFIGURE: { title: 'Edit Configure',                icon: 'pencil' },
  NEW_PROMOCODE:  { title: 'Add Promo Code',                icon: 'ticket' },
  NEW_ELIGIBILITY:{ title: 'Add Eligibility Criterion',     icon: 'filter' },
  NEW_TRIGGER:    { title: 'Add Release Trigger',           icon: 'zap' },
  EDIT_BUDGET:    { title: 'Manage Budget',                 icon: 'wallet' },
  NEW_MANUAL_BONUS:  { title: 'New Manual Campaign',        icon: 'send' },
  ISSUE_CODE_BONUS:  { title: 'Issue Manual Bonus',         icon: 'send' },
};

export default function SlideDrawer() {
  const dispatch = useAppDispatch();
  const drawerState = useAppSelector(s => s.ui.drawerState);
  const [submitting, setSubmitting] = useState(false);

  const open = !!drawerState;
  const cfg = drawerState && DRAWER_TITLES[drawerState.type];

  useEffect(() => { setSubmitting(false); }, [drawerState]);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const onClose = () => dispatch(closeDrawer());

  const doSubmit = (data) => {
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
    }, 600);
  };

  const content = (
    <>
      <div
        className={'drawer-overlay' + (open ? ' open' : '')}
        onClick={onClose}
        aria-hidden={!open}
      />
      <div
        className={'drawer' + (open ? ' open' : '')}
        role="dialog"
        aria-modal="true"
        aria-label={cfg ? cfg.title : ''}
      >
        {drawerState && (
          <>
            <div className="drawer-header">
              <span className="icon"><Icon name={cfg.icon} size={16}/></span>
              <span className="title">{cfg.title}</span>
              <button className="close" onClick={onClose} aria-label="Close drawer">
                <Icon name="x" size={18}/>
              </button>
            </div>
            <DrawerForm
              state={drawerState}
              submitting={submitting}
              onCancel={onClose}
              onSubmit={doSubmit}
            />
          </>
        )}
      </div>
    </>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(content, document.body);
}
