import { createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../services/api';
import type { OwnerEntry } from '../../types';

interface UpdateOwnersArg {
  scope: 'head' | 'subhead';
  id: number;
  owners: OwnerEntry[];
  updatedBy?: string;
}

interface UpdateOwnersResult {
  key: string;
  owners: OwnerEntry[];
}

// The owners themselves live on the head/subhead entities — heads/subheads
// slices update their entities via extraReducers on this thunk; no own state.
export const updateOwners = createAsyncThunk<UpdateOwnersResult, UpdateOwnersArg>(
  'owners/update',
  ({ scope, id, owners, updatedBy }) =>
    api.updateOwners(scope, id, owners, updatedBy).then((o) => ({ key: `${scope}:${id}`, owners: o }))
);
