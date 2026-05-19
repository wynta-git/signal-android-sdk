import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api } from '@/services/api';
import type { AsyncStatus, SystemUser } from '@/types';

interface UsersState {
  items: SystemUser[];
  status: AsyncStatus;
  error: string | null;
}

const initialState: UsersState = { items: [], status: 'idle', error: null };

export const fetchUsers = createAsyncThunk<SystemUser[]>(
  'users/fetchAll',
  () => api.fetchUsers(),
);

const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {},
  extraReducers(builder) {
    builder
      .addCase(fetchUsers.pending, (state) => { state.status = 'loading'; })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? null;
      });
  },
});

export const selectAllUsers = (state: { users: UsersState }) => state.users.items;
export const selectUsersStatus = (state: { users: UsersState }) => state.users.status;
export default usersSlice.reducer;
