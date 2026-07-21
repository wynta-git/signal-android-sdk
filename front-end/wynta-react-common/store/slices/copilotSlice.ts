import { createSlice, createAsyncThunk, nanoid } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { sendCopilotMessage } from '../../services/copilotApi';
import type { CopilotContext, CopilotMessage, CopilotTab } from '../../types';
import type { UsersState } from './usersSlice';

// Module-level singletons (like tokenRegistry's _token) so the active
// brand/module survive across the multiple Redux store instances this app
// can end up with — e.g. CrmApp mounts its own store even when embedded
// inside wynta-web's shell, so a given app's own `ui.selectedBrand` isn't
// visible to this shared slice. DjHeaderSlot/CrmApp/BonusAdminApp/
// CopilotBridgeAuth keep these in sync with the bridge payload, brand
// switcher events, and their own module identity.
let _brandId: number | null = null;
let _copilotModule: string | null = null;

export const getBrandId = (): number | null => _brandId;

export const setBrandId = (brandId: number | null): void => {
  _brandId = brandId;
};

export const getCopilotModule = (): string | null => _copilotModule;

export const setCopilotModule = (module: string | null): void => {
  _copilotModule = module;
};

interface CopilotState {
  isOpen: boolean;
  activeTab: CopilotTab;
  messages: CopilotMessage[];
  status: 'idle' | 'thinking';
}

const initialState: CopilotState = {
  isOpen: false,
  activeTab: 'copilot',
  messages: [],
  status: 'idle',
};

export const sendMessage = createAsyncThunk<
  string,
  string,
  { state: { copilot: CopilotState; users: UsersState } }
>(
  'copilot/sendMessage',
  (text, thunkAPI) => {
    const state = thunkAPI.getState();
    const context = selectCopilotContext();
    const token = state.users.authToken;
    return sendCopilotMessage(text, context, token);
  },
);

const copilotSlice = createSlice({
  name: 'copilot',
  initialState,
  reducers: {
    openCopilot(state) { state.isOpen = true; },
    closeCopilot(state) { state.isOpen = false; },
    toggleCopilot(state) { state.isOpen = !state.isOpen; },
    setCopilotTab(state, action: PayloadAction<CopilotTab>) { state.activeTab = action.payload; },
  },
  extraReducers(builder) {
    builder
      .addCase(sendMessage.pending, (state, action) => {
        state.status = 'thinking';
        state.messages.push({
          id: nanoid(),
          role: 'user',
          text: action.meta.arg,
          ts: Date.now(),
        });
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.status = 'idle';
        state.messages.push({
          id: nanoid(),
          role: 'assistant',
          text: action.payload,
          ts: Date.now(),
        });
      })
      .addCase(sendMessage.rejected, (state) => {
        state.status = 'idle';
        state.messages.push({
          id: nanoid(),
          role: 'assistant',
          text: 'Sorry — something went wrong answering that. Please try again.',
          ts: Date.now(),
        });
      });
  },
});

export const { openCopilot, closeCopilot, toggleCopilot, setCopilotTab } = copilotSlice.actions;

export const selectCopilotOpen = (state: { copilot: CopilotState }) => state.copilot.isOpen;
export const selectCopilotTab = (state: { copilot: CopilotState }) => state.copilot.activeTab;
export const selectCopilotMessages = (state: { copilot: CopilotState }) => state.copilot.messages;
export const selectCopilotStatus = (state: { copilot: CopilotState }) => state.copilot.status;

export const selectCopilotContext = (): CopilotContext | null => {
  const module = getCopilotModule();
  if (!module) return null;
  const context: CopilotContext = { module, site_id: getBrandId() };
  return context;
};

export default copilotSlice.reducer;
