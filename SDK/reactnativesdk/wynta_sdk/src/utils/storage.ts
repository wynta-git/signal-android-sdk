export const STORAGE_KEYS = {
  FCM_TOKEN: '@wynta/fcm_token',
};

// Optional peer dep — gracefully falls back to in-memory if not installed
let asyncStorage: {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
} | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  asyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  // @react-native-async-storage/async-storage not installed — values survive the session only
}

const mem = new Map<string, string>();

export const storage = {
  async get(key: string): Promise<string | null> {
    return asyncStorage ? asyncStorage.getItem(key) : (mem.get(key) ?? null);
  },
  async set(key: string, value: string): Promise<void> {
    if (asyncStorage) return asyncStorage.setItem(key, value);
    mem.set(key, value);
  },
  async remove(key: string): Promise<void> {
    if (asyncStorage) return asyncStorage.removeItem(key);
    mem.delete(key);
  },
};
