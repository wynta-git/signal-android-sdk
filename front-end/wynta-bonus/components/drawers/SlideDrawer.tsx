'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { closeDrawer } from '../../store/slices/uiSlice';
import { createHead, updateHead, fetchHead } from '../../store/slices/headsSlice';
import { createSubhead, updateSubhead, fetchSubhead } from '../../store/slices/subheadsSlice';
import { createConfigure, updateConfigure } from '../../store/slices/configuresSlice';
import { updateBudget } from '../../store/slices/budgetsSlice';
import type { BudgetPeriod } from '../../types';
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
  const bridgeData = useAppSelector(s => s.users.bridgeData);
  const currentUser: string = (bridgeData?.user as { username?: string } | null)?.username ?? 'system';
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

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
      } else if (drawerState?.type === 'NEW_SUBHEAD' && drawerState.parentId != null) {
        await dispatch(createSubhead({
          parentId: drawerState.parentId,
          payload: {
            site_id: selectedBrand,
            name: data.name,
            description: data.description,
            active: data.active,
            owner: ownerIdent,
            created_by: actor,
          },
        })).unwrap();
        // Refresh parent head so its subheads list includes the new entry
        dispatch(fetchHead(drawerState.parentId));
      } else if (drawerState?.type === 'EDIT_SUBHEAD' && drawerState.id != null) {
        const updated = await dispatch(updateSubhead({
          id: drawerState.id,
          patch: {
            name: data.name,
            description: data.description,
            active: data.active,
            owner: ownerIdent,
            updated_by: actor,
          } as unknown as import('../../types').BonusSubhead,
        })).unwrap();
        // Refresh parent head so the tree shows the updated subhead name/status
        if (updated?.head_id) dispatch(fetchHead(updated.head_id));
        dispatch(closeDrawer());
      } else if (drawerState?.type === 'NEW_CONFIGURE' && drawerState.parentId != null) {
        await dispatch(createConfigure({
          parentId: drawerState.parentId,
          payload: {
            ...data,
            site_id: selectedBrand,
            created_by: currentUser,
          },
        })).unwrap();
      } else if (drawerState?.type === 'EDIT_CONFIGURE' && drawerState.id != null) {
        await dispatch(updateConfigure({
          id: drawerState.id,
          patch: { ...data, updated_by: currentUser } as unknown as import('../../types').BonusConfigure,
        })).unwrap();
        dispatch(closeDrawer());
      } else if (drawerState?.type === 'EDIT_BUDGET' && drawerState.id != null) {
        const scope = drawerState.scope ?? 'head';
        await dispatch(updateBudget({
          scope,
          id: drawerState.id,
          periods: data.periods as BudgetPeriod[],
          updatedBy: currentUser,
        })).unwrap();
        if (scope === 'head') dispatch(fetchHead(drawerState.id));
        if (scope === 'subhead') dispatch(fetchSubhead(drawerState.id));
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

  if (!mounted) return null;
  return createPortal(content, document.body);
}
