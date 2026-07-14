import { createSlice, createAsyncThunk, nanoid } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { sendCopilotMessage } from '../../services/copilotApi';
import { getBrandId } from '../../services/tokenRegistry';
import type { CopilotMessage, CopilotTab } from '../../types';

interface CopilotState {
  isOpen: boolean;
  activeTab: CopilotTab;
  messages: CopilotMessage[];
  status: 'idle' | 'thinking';
  module: string | null;
}

const initialState: CopilotState = {
  isOpen: false,
  activeTab: 'copilot',
  messages: [],
  status: 'idle',
  module: null,
};

export const sendMessage = createAsyncThunk<string, string, { state: { copilot: CopilotState } }>(
  'copilot/sendMessage',
  (text, thunkAPI) => {
    const module = thunkAPI.getState().copilot.module;
    const context = module ? { module, site_id: getBrandId() } : null;
    return sendCopilotMessage(text, context);
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
    setCopilotModule(state, action: PayloadAction<string | null>) { state.module = action.payload; },
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

export const { openCopilot, closeCopilot, toggleCopilot, setCopilotTab, setCopilotModule } = copilotSlice.actions;

export const selectCopilotOpen = (state: { copilot: CopilotState }) => state.copilot.isOpen;
export const selectCopilotTab = (state: { copilot: CopilotState }) => state.copilot.activeTab;
export const selectCopilotMessages = (state: { copilot: CopilotState }) => state.copilot.messages;
export const selectCopilotStatus = (state: { copilot: CopilotState }) => state.copilot.status;
export const selectCopilotModule = (state: { copilot: CopilotState }) => state.copilot.module;

export default copilotSlice.reducer;
