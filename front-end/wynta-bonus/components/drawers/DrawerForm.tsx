'use client';
import HeadForm from './forms/HeadForm';
import SubheadForm from './forms/SubheadForm';
import ConfigureForm from './forms/ConfigureForm';
import PromoCodeForm from './forms/PromoCodeForm';
import TriggerForm from './forms/TriggerForm';
import ChunkForm from './forms/ChunkForm';
import BudgetForm from './forms/BudgetForm';
import OwnersForm from './forms/OwnersForm';
import OwnerForm from './forms/OwnerForm';
import ManualBonusForm from './forms/ManualBonusForm';
import IssueCodeBonusForm from './forms/IssueCodeBonusForm';
import type { DrawerState } from '../../types';

interface DrawerFormProps {
  state: DrawerState;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export default function DrawerForm({ state, submitting, onCancel, onSubmit, onDirtyChange }: DrawerFormProps) {
  switch (state.type) {
    case 'NEW_HEAD':         return <HeadForm     mode="new"  state={state} submitting={submitting} onCancel={onCancel} onSubmit={onSubmit} onDirtyChange={onDirtyChange}/>;
    case 'EDIT_HEAD':        return <HeadForm     mode="edit" state={state} submitting={submitting} onCancel={onCancel} onSubmit={onSubmit} onDirtyChange={onDirtyChange}/>;
    case 'NEW_SUBHEAD':      return <SubheadForm  mode="new"  state={state} submitting={submitting} onCancel={onCancel} onSubmit={onSubmit} onDirtyChange={onDirtyChange}/>;
    case 'EDIT_SUBHEAD':     return <SubheadForm  mode="edit" state={state} submitting={submitting} onCancel={onCancel} onSubmit={onSubmit} onDirtyChange={onDirtyChange}/>;
    case 'NEW_CONFIGURE':    return <ConfigureForm mode="new"  state={state} submitting={submitting} onCancel={onCancel} onSubmit={onSubmit}/>;
    case 'EDIT_CONFIGURE':   return <ConfigureForm mode="edit" state={state} submitting={submitting} onCancel={onCancel} onSubmit={onSubmit}/>;
    case 'NEW_PROMOCODE':    return <PromoCodeForm  state={state} submitting={submitting} onCancel={onCancel} onSubmit={onSubmit}/>;
    case 'EDIT_PROMOCODE':   return <PromoCodeForm  state={state} submitting={submitting} onCancel={onCancel} onSubmit={onSubmit}/>;
    case 'CLONE_PROMOCODE':  return <PromoCodeForm  state={state} submitting={submitting} onCancel={onCancel} onSubmit={onSubmit}/>;
    case 'NEW_TRIGGER':      return <TriggerForm    state={state} submitting={submitting} onCancel={onCancel} onSubmit={onSubmit}/>;
    case 'EDIT_TRIGGER':     return <TriggerForm    state={state} submitting={submitting} onCancel={onCancel} onSubmit={onSubmit}/>;
    case 'EDIT_CHUNKS':      return <ChunkForm      state={state} submitting={submitting} onCancel={onCancel} onSubmit={onSubmit}/>;
    case 'EDIT_BUDGET':      return <BudgetForm     state={state} submitting={submitting} onCancel={onCancel} onSubmit={onSubmit}/>;
    case 'EDIT_OWNERS':      return <OwnersForm     state={state} submitting={submitting} onCancel={onCancel} onSubmit={onSubmit}/>;
    case 'EDIT_OWNER':       return <OwnerForm      state={state} submitting={submitting} onCancel={onCancel} onSubmit={onSubmit}/>;
    case 'NEW_MANUAL_BONUS': return <ManualBonusForm state={state} submitting={submitting} onCancel={onCancel} onSubmit={onSubmit}/>;
    case 'ISSUE_CODE_BONUS': return <IssueCodeBonusForm state={state as unknown as { type: string; code: Parameters<typeof IssueCodeBonusForm>[0]['state']['code'] }} submitting={submitting} onCancel={onCancel} onSubmit={onSubmit}/>;
    default: return null;
  }
}
