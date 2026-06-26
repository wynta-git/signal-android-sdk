import { RootState } from './index';

export const selectClientId = (state: RootState) => state.sdk.clientId;
export const selectClientSecret = (state: RootState) => state.sdk.clientSecret;
export const selectUserId = (state: RootState) => state.sdk.userId;
export const selectFcmToken = (state: RootState) => state.sdk.fcmToken;
export const selectInitialized = (state: RootState) => state.sdk.initialized;
