import { InitSDKConfig, SDKResponse, IdentityPayload } from './types';
import { store } from './store';
import { sdkActions } from './store/sdkSlice';
import { sendEventThunk, setIdentityThunk } from './store/thunks';
import { getSessionId } from './services/SessionService';
import { lifecycleService } from './services/LifecycleService';
import { storage, STORAGE_KEYS } from './utils/storage';
import { logger } from './utils/logger';
import { setApiLogCallback } from './utils/apiLogger';
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { WyntaSDKModule } = NativeModules;
const wyntaEventEmitter = WyntaSDKModule ? new NativeEventEmitter(WyntaSDKModule) : null;

class WyntaSDKClass {
  private listenersRegistered = false;

  private processPushInteraction(payload: any): void {
    if (!payload || !payload.campaign_id) return;

    const eventName = payload.action_id ? 'notification_clicked' : 'notification_opened';
    const properties: Record<string, any> = {
      campaign_id: payload.campaign_id,
      campaign_name: payload.campaign_name || null,
      notification_type: payload.notification_type || 'promotional',
      channel: payload.channel || 'push',
      template_id: payload.template_id || null,
    };

    if (payload.action_id) {
      properties.action_id = payload.action_id;
    }
    if (payload.deep_link) {
      properties.deep_link = payload.deep_link;
    }

    this.sendEvent(eventName, properties)
      .then((res) => {
        logger.log(`[WyntaSDK] Auto-tracked push event '${eventName}' | Success: ${res.success}`);
      })
      .catch((err) => {
        logger.log(`[WyntaSDK] Failed to auto-track push event '${eventName}': ${err}`);
      });
  }

  async initSDK(config: InitSDKConfig): Promise<void> {
    if (!config.clientId || !config.clientSecret) {
      throw new Error('initSDK requires clientId and clientSecret');
    }

    // Restore persisted FCM token from storage (survives app restarts if AsyncStorage is installed)
    const savedFcmToken = await storage.get(STORAGE_KEYS.FCM_TOKEN);

    store.dispatch(sdkActions.initConfig({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    }));

    if (savedFcmToken) {
      store.dispatch(sdkActions.setIdentityData({ fcmToken: savedFcmToken }));
      logger.log(`FCM token restored from storage`);
    }

    setApiLogCallback(config.onApiLog);
    getSessionId();
    lifecycleService.start();
    logger.log(`SDK initialized | session=${getSessionId()} | call setIdentity() next`);

    // Register native notification interaction listeners
    if (wyntaEventEmitter && !this.listenersRegistered) {
      this.listenersRegistered = true;

      // Warm start (app in background/foreground)
      wyntaEventEmitter.addListener('wynta_push_interaction', (payload) => {
        logger.log('[WyntaSDK] Native interaction event received (warm start):', payload);
        this.processPushInteraction(payload);
      });

      // Cold start (app launched by clicking push)
      WyntaSDKModule.getColdStartNotification()
        .then((payload: any) => {
          if (payload) {
            logger.log('[WyntaSDK] Native interaction event received (cold start):', payload);
            this.processPushInteraction(payload);
          }
        })
        .catch((err: any) => {
          logger.log(`[WyntaSDK] Error checking cold start notification: ${err}`);
        });
    }

    // Automatically register FCM listeners if Firebase Messaging is present in the host app
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const messaging = require('@react-native-firebase/messaging').default;

      // Token refresh listener
      messaging().onTokenRefresh(async (newToken: string) => {
        logger.log('[WyntaSDK] FCM token auto-refreshed:', newToken);
        await this.setIdentity({ fcm_token: newToken });
      });

      // Foreground message listener (Android only - iOS handled natively)
      // Firebase does NOT auto-display notifications when app is in foreground;
      // we must post them manually via the native module.
      messaging().onMessage(async (remoteMessage: any) => {
        logger.log('[WyntaSDK] Foreground push message received:', remoteMessage);

        if (Platform.OS !== 'android') return;

        const data = remoteMessage.data || {};
        // Prefer notification block fields; fall back to data payload fields
        const title = remoteMessage.notification?.title ?? data.title ?? '';
        const body  = remoteMessage.notification?.body  ?? data.body  ?? '';

        if (!title && !body) return; // nothing to display

        if (WyntaSDKModule && WyntaSDKModule.showNotification) {
          WyntaSDKModule.showNotification(title, body, {
            ...data,
            campaign_id:       data.campaign_id       || null,
            campaign_name:     data.campaign_name     || null,
            notification_type: data.notification_type || 'promotional',
            template_id:       data.template_id       || null,
          });
        }
      });
    } catch {
      // Firebase messaging not installed or resolved in client app — ignore silently
    }
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

  /**
   * Call this from messaging().setBackgroundMessageHandler() in your index.js.
   * Handles data-only FCM messages when the app is killed or in the background.
   * Posts a real notification via the native layer — no JS app lifecycle required.
   *
   * Example (index.js):
   *   messaging().setBackgroundMessageHandler(WyntaSDK.handleBackgroundMessage);
   */
  handleBackgroundMessage = async (remoteMessage: any): Promise<void> => {
    if (Platform.OS !== 'android') return; // iOS handled natively via swizzling

    // When a notification block is present, Firebase auto-renders the notification
    // in background/killed state. Posting again would cause a duplicate and Android
    // suppresses the heads-up banner as "recently noisy". Only handle data-only messages.
    if (remoteMessage?.notification) {
      logger.log('[WyntaSDK] handleBackgroundMessage: notification block present — Firebase handles rendering');
      return;
    }

    const data = remoteMessage?.data ?? {};
    const title = data.title ?? '';
    const body  = data.body  ?? '';

    if (!title && !body) {
      logger.log('[WyntaSDK] handleBackgroundMessage: no title/body in data, skipping');
      return;
    }

    if (WyntaSDKModule?.showNotification) {
      WyntaSDKModule.showNotification(title, body, {
        campaign_id:       data.campaign_id       ?? data.wynta_campaign_id ?? null,
        campaign_name:     data.campaign_name     ?? null,
        notification_type: data.notification_type ?? 'promotional',
        channel:           data.channel           ?? 'push',
        template_id:       data.template_id       ?? null,
        action_id:         data.action_id         ?? null,
        deep_link:         data.deep_link         ?? null,
      });
      logger.log('[WyntaSDK] handleBackgroundMessage: notification posted natively');
    } else {
      logger.log('[WyntaSDK] handleBackgroundMessage: WyntaSDKModule not available');
    }
  };

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
