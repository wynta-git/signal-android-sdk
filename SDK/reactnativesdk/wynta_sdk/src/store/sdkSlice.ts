import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// TODO: replace PROD_BASE_URL with the real production URL when available
const PROD_BASE_URL = 'https://qa-app.fozilpartners.com/api/v1';
const QA_BASE_URL   = 'https://qa-app.fozilpartners.com/api/v1';

const QA_PREFIX = 'QA_';

export interface SDKState {
  clientId: string | null;
  clientSecret: string | null;
  baseUrl: string;
  environment: 'qa' | 'production';
  userId: string | null;
  fcmToken: string | null;
  initialized: boolean;
  appOpenTracked: boolean;
}

const initialState: SDKState = {
  clientId: null,
  clientSecret: null,
  baseUrl: PROD_BASE_URL,
  environment: 'production',
  userId: null,
  fcmToken: null,
  initialized: false,
  appOpenTracked: false,
};

const sdkSlice = createSlice({
  name: 'wynta',
  initialState,
  reducers: {
    initConfig(
      state,
      action: PayloadAction<{ clientId: string; clientSecret: string }>,
    ) {
      const rawClientId = action.payload.clientId;
      const isQA = rawClientId.startsWith(QA_PREFIX);

      // Strip the QA_ prefix before storing — never sent in API headers
      state.clientId = isQA ? rawClientId.slice(QA_PREFIX.length) : rawClientId;
      state.clientSecret = action.payload.clientSecret;
      state.baseUrl = isQA ? QA_BASE_URL : PROD_BASE_URL;
      state.environment = isQA ? 'qa' : 'production';
      state.userId = null;
      state.initialized = true;
      state.appOpenTracked = false;
    },
    setAppOpenTracked(state) {
      state.appOpenTracked = true;
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
