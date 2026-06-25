/**
 * LifecycleService — subscribes to React Native AppState and fires lifecycle
 * events automatically. Started by initSDK(); the client app does nothing.
 *
 * PLATFORM LIMITATIONS (documented per requirement):
 *
 * app_terminated:
 *   iOS/Android do not provide a reliable "app was killed" callback in the
 *   JavaScript layer. AppState transitions to 'background' just before the OS
 *   terminates the process, but there is no way to distinguish a background
 *   (user switches app) from a termination (user swipes away / OS kills it).
 *   If the host app's WyntaSDKModule emits a 'wynta_app_terminating' native
 *   event (e.g. from applicationWillTerminate / onDestroy), this service will
 *   track app_terminated automatically. Otherwise this event is not fired.
 *
 * session_ended:
 *   Fired when the app moves to background as the closest reliable proxy for
 *   a session ending. The same session_id continues to be used for subsequent
 *   app_foreground events within the same process lifetime.
 */

import { AppState, AppStateStatus, NativeModules, NativeEventEmitter } from 'react-native';
import { store } from '../store';
import { buildEvent, trackEvent } from './EventService';
import { logger } from '../utils/logger';

const { WyntaSDKModule } = NativeModules;
const wyntaEventEmitter = WyntaSDKModule ? new NativeEventEmitter(WyntaSDKModule) : null;

class LifecycleService {
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private terminationSubscription: { remove: () => void } | null = null;

  // Track the last *meaningful* state (we skip 'inactive' — it is a brief iOS
  // transitional state that sits between active and background, not a session
  // boundary we want to act on).
  private previousState: AppStateStatus = AppState.currentState;

  start(): void {
    if (this.appStateSubscription) return;

    this.previousState = AppState.currentState;

    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange,
    );

    // Optional: native termination event (WyntaSDKModule must emit this)
    if (wyntaEventEmitter) {
      try {
        this.terminationSubscription = wyntaEventEmitter.addListener(
          'wynta_app_terminating',
          () => {
            logger.log('[WyntaSDK] Native app_terminating event received');
            this.emit('app_terminated');
          },
        );
      } catch {
        // Native module does not support this event — limitation documented above
        logger.log('[WyntaSDK] app_terminated: wynta_app_terminating not supported by native module');
      }
    }
  }

  stop(): void {
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
    this.terminationSubscription?.remove();
    this.terminationSubscription = null;
  }

  private handleAppStateChange = (nextState: AppStateStatus): void => {
    // Ignore 'inactive' — it is an iOS-only transitional state (phone call
    // overlay, control center). We preserve previousState so that the next
    // meaningful transition (inactive → background or inactive → active) is
    // evaluated against the last real state.
    if (nextState === 'inactive') return;

    const from = this.previousState;
    const to = nextState;

    if (to === 'background' && from !== 'background') {
      this.emit('app_background');
      // Best-effort session end — see limitation note above
      this.emit('session_ended');
    } else if (to === 'active' && from === 'background') {
      this.emit('app_foreground');
    }

    this.previousState = nextState;
  };

  private emit(eventName: string): void {
    const { clientId, clientSecret, userId, initialized } = store.getState().sdk;
    if (!initialized || !userId || !clientId || !clientSecret) {
      logger.log(`[WyntaSDK] Lifecycle event '${eventName}' skipped — no active identity`);
      return;
    }

    const event = buildEvent(eventName, {}, userId);
    logger.log(`[WyntaSDK] Lifecycle → ${eventName}`, event.event_id);
    trackEvent(event, clientId, clientSecret).catch((err) => {
      logger.log(`[WyntaSDK] Lifecycle event '${eventName}' failed: ${err}`);
    });
  }
}

export const lifecycleService = new LifecycleService();
