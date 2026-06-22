import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface SDKState {
  clientId: string | null;
  clientSecret: string | null;
  userId: string | null;
  fcmToken: string | null;
  initialized: boolean;
}

const initialState: SDKState = {
  clientId: null,
  clientSecret: null,
  userId: null,
  fcmToken: null,
  initialized: false,
};

const sdkSlice = createSlice({
  name: 'wynta',
  initialState,
  reducers: {
    initConfig(
      state,
      action: PayloadAction<{ clientId: string; clientSecret: string; userId: string }>,
    ) {
      state.clientId = action.payload.clientId;
      state.clientSecret = action.payload.clientSecret;
      state.userId = action.payload.userId;
      state.initialized = true;
    },
    setIdentityData(
      state,
      action: PayloadAction<{ userId?: string | null; fcmToken?: string | null }>,
    ) {
      if (action.payload.userId !== undefined) {
        state.userId = action.payload.userId;
      }
      if (action.payload.fcmToken !== undefined) {
        state.fcmToken = action.payload.fcmToken;
      }
    },
    clearIdentity(state) {
      state.userId = null;
      // fcmToken is device-level — intentionally kept on logout
    },
  },
});

export const sdkActions = sdkSlice.actions;
export default sdkSlice.reducer;
