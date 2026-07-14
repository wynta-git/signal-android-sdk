import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { api } from '../../services/api';
import type { AsyncStatus, UserSettings } from '../../types';

interface SettingsState {
  items: UserSettings;
  status: AsyncStatus;
  error: string | null;
}

const initialState: SettingsState = { items: {}, status: 'idle', error: null };

export const fetchUserSettings = createAsyncThunk<UserSettings, void>(
  'settings/fetchMine',
  () => api.fetchMySettings(),
);

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {},
  extraReducers(builder) {
    builder
      .addCase(fetchUserSettings.pending, (state) => { state.status = 'loading'; })
      .addCase(fetchUserSettings.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.items = action.payload;
      })
      .addCase(fetchUserSettings.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? null;
      });
  },
});

export const selectUserSettings = (state: { settings: SettingsState }) => state.settings.items;
export const selectUserSetting = (key: string) =>
  (state: { settings: SettingsState }) => state.settings.items[key];
export const selectSettingsStatus = (state: { settings: SettingsState }) => state.settings.status;
export default settingsSlice.reducer;
