import { Platform, NativeModules } from 'react-native';
import { DeviceInfo } from '../types';

export function getDeviceInfo(): DeviceInfo {
  const platform = Platform.OS;
  const constants = Platform.constants as Record<string, unknown>;

  let os: string;
  let osVersion: string | undefined;
  if (platform === 'android') {
    // Platform.Version is the API level integer; constants.Release is the human-readable version
    osVersion = (constants.Release as string) ?? String(Platform.Version);
    os = `Android ${osVersion}`;
  } else if (platform === 'ios') {
    osVersion = String(Platform.Version);
    os = `iOS ${osVersion}`;
  } else {
    os = platform;
  }

  // Android exposes brand and model via Platform.constants
  const deviceModel =
    (constants.Model as string | undefined) ??
    (constants.model as string | undefined);
  const manufacturer =
    (constants.Brand as string | undefined) ??
    (constants.Manufacturer as string | undefined);

  // App version — try native module property first (requires WyntaSDKModule to expose it)
  let appVersion: string | undefined;
  try {
    const v = (NativeModules.WyntaSDKModule as Record<string, unknown>)?.appVersion;
    if (typeof v === 'string' && v) appVersion = v;
  } catch {
    // not exposed by native module
  }

  // Timezone and locale via standard Intl API (available in Hermes / JSC)
  let timezone: string | undefined;
  let locale: string | undefined;
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions();
    timezone = resolved.timeZone;
    locale = resolved.locale;
  } catch {
    // Intl not available in this environment
  }

  // User-agent (web / WebView environments only)
  let ua: string | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = (global as any).navigator?.userAgent as string | undefined;
    if (nav) ua = nav;
  } catch {
    // not available
  }

  const info: DeviceInfo = {
    platform,
    os,
    ...(osVersion && { os_version: osVersion }),
    ...(appVersion && { app_version: appVersion }),
    ...(deviceModel && { device_model: deviceModel }),
    ...(manufacturer && { manufacturer }),
    ...(timezone && { timezone }),
    ...(locale && { locale }),
    ...(ua && { ua }),
  };

  return info;
}
