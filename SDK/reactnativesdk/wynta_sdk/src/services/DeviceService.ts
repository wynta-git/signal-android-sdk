import { Platform } from 'react-native';
import { DeviceInfo } from '../types';

export function getDeviceInfo(): DeviceInfo {
  const platform = Platform.OS;

  let os: string;
  if (platform === 'android') {
    // Platform.Version is the API level integer on Android (e.g. 35 for Android 15)
    os = `Android ${Platform.Version}`;
  } else if (platform === 'ios') {
    // Platform.Version is the version string on iOS (e.g. "18.0")
    os = `iOS ${Platform.Version}`;
  } else {
    os = platform;
  }

  const info: DeviceInfo = { platform, os };

  // userAgent is available in web / WebView environments
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ua = (global as any).navigator?.userAgent as string | undefined;
    if (ua) {
      info.ua = ua;
    }
  } catch {
    // not available in this environment — omit ua
  }

  return info;
}
