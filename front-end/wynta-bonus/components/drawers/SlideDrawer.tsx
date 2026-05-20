'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { closeDrawer } from '../../store/slices/uiSlice';
import { createHead, updateHead } from '../../store/slices/headsSlice';
import Icon from 'wynta-react-common/components/Icon';
import DrawerForm from './DrawerForm';
import type { DrawerType } from '../../types';

interface DrawerMeta {
  title: string;
  icon: string;
}

const DRAWER_TITLES: Record<DrawerType, DrawerMeta> = {
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
  const selectedBrand = useAppSelector(s => s.ui.selectedBrand);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const open = !!drawerState;
  const cfg = drawerState && DRAWER_TITLES[drawerState.type];

  useEffect(() => { setSubmitting(false); setSubmitError(null); }, [drawerState]);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const onClose = () => dispatch(closeDrawer());

  const doSubmit = async (data: Record<string, unknown>) => {
    setSubmitting(true);
    setSubmitError(null);
    // API identifier fields reject '@' — strip email domain for owner/actor values
    const actor = typeof data.owner === 'string' ? data.owner.split('@')[0] : 'system';
    const ownerIdent = actor;
    try {
      if (drawerState?.type === 'NEW_HEAD') {
        await dispatch(createHead(
          { ...data, site_id: selectedBrand, owner: ownerIdent, created_by: actor } as unknown as Parameters<typeof createHead>[0]
        )).unwrap();
      } else if (drawerState?.type === 'EDIT_HEAD' && drawerState.id != null) {
        await dispatch(updateHead({
          id: drawerState.id,
          patch: { ...data, owner: ownerIdent, updated_by: actor } as unknown as Partial<import('../../types').BonusHead>,
        })).unwrap();
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
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
        {drawerState && cfg && (
          <>
            <div className="drawer-header">
              <span className="icon"><Icon name={cfg.icon} size={16}/></span>
              <span className="title">{cfg.title}</span>
              <button className="close" onClick={onClose} aria-label="Close drawer">
                <Icon name="x" size={18}/>
              </button>
            </div>
            {submitError && <div className="drawer-error">{submitError}</div>}
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
