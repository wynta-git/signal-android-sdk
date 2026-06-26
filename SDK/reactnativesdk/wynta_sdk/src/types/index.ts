export interface InitSDKConfig {
  clientId: string;
  clientSecret: string;
}

export interface DeviceInfo {
  platform: string;
  os: string;
  os_version?: string;
  app_version?: string;
  device_model?: string;
  manufacturer?: string;
  timezone?: string;
  locale?: string;
  ua?: string;
}

export interface SDKInfo {
  name: string;
  version: string;
}

export interface TrackEvent {
  event_id: string;
  event_name: string;
  schema_version: number;
  user_id: string;
  session_id: string;
  timestamp: string;
  sdk: SDKInfo;
  device: DeviceInfo;
  properties: Record<string, unknown>;
}

export interface EventsRequest {
  events: TrackEvent[];
}

export interface APIResponse {
  accepted: number;
  rejected: number;
  errors: string[];
}

export interface SDKResponse {
  success: boolean;
  accepted?: number;
  rejected?: number;
  error?: string;
}

export interface PlayerTraits {
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  country?: string;
  currency?: string;
  language?: string;
  kyc_status?: string;
  vip_level?: string;
  account_status?: string;
  registration_date?: string;
  brand_id?: string;
  fcm_token?: string;
  [key: string]: unknown;
}

export interface IdentifyRequest {
  user_id: string;
  anonymous_id?: string;
  traits?: PlayerTraits;
  unset_traits?: string[];
  timestamp: string;
}

export interface IdentifyResponse {
  success: boolean;
  error?: string;
}

export interface IdentityPayload {
  user_id?: string;
  anonymous_id?: string;
  fcm_token?: string;
  traits?: PlayerTraits;
  unset_traits?: string[];
  timestamp?: string;
}
