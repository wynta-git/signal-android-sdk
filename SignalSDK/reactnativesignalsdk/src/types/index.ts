export interface ApiLogEntry {
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: string;
  responseStatus: number;
  responseBody: string;
}

export interface InitSDKConfig {
  clientId: string;
  clientSecret: string;
  onApiLog?: (entry: ApiLogEntry) => void;
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

export interface NotificationCTA {
  role: 'primary' | 'secondary';
  label: string;
  action: 'deep_link' | 'external_url' | 'dismiss';
  value: string | null;
}

export interface InboxNotification {
  notification_id: string;
  campaign_id: string;
  variant_id?: string;
  template_type: string;
  render_engine: string;
  title?: string;
  body?: string;
  media?: {
    image_url?: string;
    background_color?: string;
    background_opacity?: string;
  };
  cta: NotificationCTA[];
  close_button_visibility?: string;
  layout?: unknown;
  created_at: string;
  expires_at?: string;
  read: boolean;
}

export interface InboxResponse {
  notifications: InboxNotification[];
  next_cursor: string | null;
  unread_count: number;
}
