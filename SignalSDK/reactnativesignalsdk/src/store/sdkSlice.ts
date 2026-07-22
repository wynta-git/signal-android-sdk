import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { InboxNotification } from '../types';

const PROD_BASE_URL = 'https://api.wynta.com/api/v1';
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
  // In-app notification IDs already shown this session — prevents re-showing the same
  // notification if a spurious app_foreground fires right after dismissing it (launching/
  // finishing the native popup Activity can itself trigger a foreground transition).
  handledInAppNotificationIds: string[];
  // Full last-fetched inbox response, cached so trackScreen() can evaluate triggers
  // locally without an extra network call per screen change.
  notificationCache: InboxNotification[];
  currentScreen: string | null;
  previousScreen: string | null;
  // True while a native in-app popup is on screen — prevents a second trackScreen()
  // call from stacking another popup before the first is dismissed.
  isInAppPopupVisible: boolean;
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
  handledInAppNotificationIds: [],
  notificationCache: [],
  currentScreen: null,
  previousScreen: null,
  isInAppPopupVisible: false,
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
    markInAppNotificationHandled(state, action: PayloadAction<string>) {
      if (!state.handledInAppNotificationIds.includes(action.payload)) {
        state.handledInAppNotificationIds.push(action.payload);
      }
    },
    setNotificationCache(state, action: PayloadAction<InboxNotification[]>) {
      state.notificationCache = action.payload;
    },
    setCurrentScreen(state, action: PayloadAction<string>) {
      state.previousScreen = state.currentScreen;
      state.currentScreen = action.payload;
    },
    setInAppPopupVisible(state, action: PayloadAction<boolean>) {
      state.isInAppPopupVisible = action.payload;
    },
  },
});

export const sdkActions = sdkSlice.actions;
export default sdkSlice.reducer;
