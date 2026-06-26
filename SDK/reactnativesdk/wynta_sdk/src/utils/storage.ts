import { NativeModules } from 'react-native';

export const STORAGE_KEYS = {
  FCM_TOKEN: '@wynta/fcm_token',
};

const { WyntaSDKModule } = NativeModules;
const mem = new Map<string, string>();

export const storage = {
  async get(key: string): Promise<string | null> {
    if (WyntaSDKModule) {
      try {
        const val = await WyntaSDKModule.getStoredString(key);
        return val || null;
      } catch {
        return mem.get(key) ?? null;
      }
    }
    return mem.get(key) ?? null;
  },

  async set(key: string, value: string): Promise<void> {
    if (WyntaSDKModule) {
      try {
        await WyntaSDKModule.setStoredString(key, value);
        return;
      } catch {
        // Fallback to memory in case of error
      }
    }
    mem.set(key, value);
  },

  async remove(key: string): Promise<void> {
    if (WyntaSDKModule) {
      try {
        await WyntaSDKModule.removeStoredString(key);
        return;
      } catch {
        // Fallback to memory in case of error
      }
    }
    mem.delete(key);
  },
};
