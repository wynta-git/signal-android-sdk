import { InitSDKConfig, SDKResponse, IdentityPayload } from './types';
import { store } from './store';
import { sdkActions } from './store/sdkSlice';
import { sendEventThunk, setIdentityThunk } from './store/thunks';
import { getSessionId } from './services/SessionService';
import { storage, STORAGE_KEYS } from './utils/storage';
import { logger } from './utils/logger';

class WyntaSDKClass {
  async initSDK(config: InitSDKConfig): Promise<void> {
    if (!config.clientId || !config.clientSecret || !config.identity) {
      throw new Error('initSDK requires clientId, clientSecret, and identity');
    }

    // Restore persisted FCM token from storage (survives app restarts if AsyncStorage is installed)
    const savedFcmToken = await storage.get(STORAGE_KEYS.FCM_TOKEN);

    store.dispatch(sdkActions.initConfig({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      userId: config.identity,
    }));

    if (savedFcmToken) {
      store.dispatch(sdkActions.setIdentityData({ fcmToken: savedFcmToken }));
      logger.log(`FCM token restored from storage`);
    }

    getSessionId();
    logger.log(`SDK initialized | userId=${config.identity} | session=${getSessionId()}`);
  }

  async setIdentity(payload: IdentityPayload): Promise<SDKResponse> {
    const { initialized } = store.getState().sdk;

    if (!initialized) {
      return { success: false, error: 'SDK not initialized. Call initSDK() first.' };
    }

    const result = await store.dispatch(setIdentityThunk(payload));

    if (setIdentityThunk.fulfilled.match(result)) {
      return result.payload;
    }
    return { success: false, error: (result.payload as string) ?? 'Unknown error' };
  }

  clearIdentity(): void {
    store.dispatch(sdkActions.clearIdentity());
    logger.log('Identity cleared');
  }

  async sendEvent(
    eventName: string,
    properties: Record<string, unknown> = {},
  ): Promise<SDKResponse> {
    const { initialized, userId } = store.getState().sdk;

    if (!initialized) {
      return { success: false, error: 'SDK not initialized. Call initSDK() first.' };
    }
    if (!userId) {
      return { success: false, error: 'No identity set. Call setIdentity() first.' };
    }
    if (!eventName || typeof eventName !== 'string') {
      return { success: false, error: 'eventName must be a non-empty string.' };
    }

    const result = await store.dispatch(sendEventThunk({ eventName, properties }));

    if (sendEventThunk.fulfilled.match(result)) {
      return result.payload;
    }
    return { success: false, error: (result.payload as string) ?? 'Unknown error' };
  }
}

const WyntaSDK = new WyntaSDKClass();

export { WyntaSDKClass };
export default WyntaSDK;
