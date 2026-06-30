# Signal React Native SDK — Integration Guide

This guide covers everything a client application needs to integrate the Signal SDK: initialization, user identity, push notification token management, event tracking, and background push handling.

---

## Table of Contents

1. [Installation](#1-installation)
2. [Initialization](#2-initialization)
3. [User Identity](#3-user-identity)
   - [Anonymous (pre-login)](#31-anonymous-pre-login)
   - [After login](#32-after-login)
   - [Updating traits](#33-updating-traits)
   - [Logout](#34-logout)
4. [FCM Token — Push Notifications](#4-fcm-token--push-notifications)
5. [Background Push Handling](#5-background-push-handling)
6. [Event Tracking](#6-event-tracking)
7. [Full Lifecycle Example](#7-full-lifecycle-example)
8. [API Reference](#8-api-reference)
9. [TypeScript Types](#9-typescript-types)

---

## 1. Installation

```bash
npm install signal-react-native-sdk
```

**For iOS (Native Bridge Linking):**

Because the Signal SDK contains native wrappers for automatic push notification tracking, you must link the iOS pod dependencies:

```bash
cd ios && pod install && cd ..
```

---

## 2. Initialization

Call `initSDK` once at app startup, before anything else. It is `async` — always `await` it.

```typescript
import SignalSDK from 'signal-react-native-sdk';

await SignalSDK.initSDK({
  clientId: 'YOUR_CLIENT_ID',
  clientSecret: 'YOUR_CLIENT_SECRET',
});
```

**Config fields:**

| Field           | Type     | Required | Description                                                 |
|-----------------|----------|----------|-------------------------------------------------------------|
| `clientId`      | string   | Yes      | Your Signal client ID                                       |
| `clientSecret`  | string   | Yes      | Your Signal client secret (used as Bearer token)            |
| `onApiLog`      | function | No       | Callback fired after every HTTP call — useful for debugging |

> **QA Environment:** If your `clientId` starts with `QA_` (e.g. `QA_your-client-id`), the SDK automatically routes all traffic to the QA backend and strips the prefix internally. No other configuration needed.

**What `initSDK` does:**
- Stores credentials in the internal Redux store
- Creates a stable session ID for this app session
- Restores any previously saved FCM token from native device storage (SharedPreferences / NSUserDefaults)
- Automatically sets up an FCM token refresh listener — no extra code needed in your app

After `initSDK`, always call `setIdentity` to set a user ID before tracking events.

**Recommended location — `App.tsx`:**

```typescript
import React, { useEffect } from 'react';
import SignalSDK from 'signal-react-native-sdk';

export default function App() {
  useEffect(() => {
    const bootstrap = async () => {
      await SignalSDK.initSDK({
        clientId: 'YOUR_CLIENT_ID',
        clientSecret: 'YOUR_CLIENT_SECRET',
      });

      // Set anonymous identity immediately after init
      await SignalSDK.setIdentity({ user_id: 'anon-' + generateUUID() });
    };
    bootstrap();
  }, []);

  return <YourAppNavigator />;
}
```

---

## 3. User Identity

Identity tells the SDK **who is using the app**. The SDK maintains one active identity at a time. It can be anonymous (a UUID you generate) or a real player ID after login.

### 3.1 Anonymous (pre-login)

Call `setIdentity` right after `initSDK` with an anonymous UUID. Events sent before login are attributed to this anonymous ID.

```typescript
await SignalSDK.setIdentity({
  user_id: 'anon-' + generateUUID(),
});

// Events can now be tracked immediately
await SignalSDK.sendEvent('app_open', { screen: 'Splash' });
await SignalSDK.sendEvent('onboarding_started', {});
```

### 3.2 After login

Call `setIdentity` immediately after a successful login. Pass the real `user_id` and as many player traits as you have available. The SDK will send these to the Signal backend and all subsequent events will be attributed to the real player.

```typescript
await SignalSDK.setIdentity({
  user_id: 'ply_776192',
  traits: {
    email: 'player@example.com',
    first_name: 'Alex',
    last_name: 'Smith',
    date_of_birth: '1990-04-15',
    country: 'MT',
    currency: 'EUR',
    language: 'en',
    kyc_status: 'pending',
    vip_level: 'bronze',
    account_status: 'active',
    registration_date: '2026-05-18T14:38:00.000Z',
    brand_id: 'brand_01',
  },
});
```

After this call, `sendEvent` automatically uses `'ply_776192'` as the `user_id`.

### 3.3 Updating traits

You can call `setIdentity` at any point to update specific traits without re-sending everything — only include the fields that changed:

```typescript
// KYC approved
await SignalSDK.setIdentity({
  traits: { kyc_status: 'approved' },
});

// VIP tier upgrade
await SignalSDK.setIdentity({
  traits: { vip_level: 'gold' },
});

// Removing a field
await SignalSDK.setIdentity({
  unset_traits: ['referral_code'],
});
```

> The SDK merges the new traits with whatever `user_id` is already stored — you do not need to re-pass `user_id` on every traits update.

### 3.4 Logout

Call `clearIdentity` when the user logs out. This clears the `user_id` from the SDK. The FCM token is intentionally preserved because it is device-level, not user-level.

```typescript
SignalSDK.clearIdentity();

// After logout, re-set an anonymous ID so events can still be tracked
await SignalSDK.setIdentity({
  user_id: 'anon-' + generateUUID(),
});
```

---

## 4. FCM Token & Push Notifications

The SDK manages the FCM token lifecycle and **automatically tracks push notification interaction events (opens and clicks) under the hood** using native wrappers for iOS and Android.

### 4.1 Automatic Push Tracking

When a user interacts with a notification, the SDK intercepts the interaction at the native level and fires the appropriate event:

- **`notification_opened`**: User taps the notification banner to open the app.
- **`notification_clicked`**: User taps a specific action button (CTA) inside the notification.

> **Foreground Notification Banners:** The Signal SDK automatically forces heads-up banners to display natively when a push is received while the app is active (both iOS and Android). Clicks are tracked automatically.

#### Required Push Payload Structure

##### For standard notification opens (`notification_opened`):
```json
{
  "campaign_id": "camp_100",
  "campaign_name": "Weekend Deposit Boost",
  "notification_type": "promotional",
  "template_id": "tmpl_push_01"
}
```

##### For specific button/action clicks (`notification_clicked`):
```json
{
  "campaign_id": "camp_100",
  "campaign_name": "Weekend Deposit Boost",
  "notification_type": "promotional",
  "template_id": "tmpl_push_01",
  "action_id": "cta_deposit_now",
  "deep_link": "/casino/deposit"
}
```

#### Generated Event Formats

##### Example: `notification_opened`
```json
{
  "user_id": "ply_776192",
  "session_id": "sess_abc12398",
  "event_name": "notification_opened",
  "timestamp": "2026-05-18T15:22:00.000Z",
  "platform": "android",
  "properties": {
    "campaign_id": "camp_100",
    "campaign_name": "Weekend Deposit Boost",
    "notification_type": "promotional",
    "channel": "push",
    "template_id": "tmpl_push_01"
  }
}
```

### 4.2 Registering the FCM Token

Pass the FCM token via `setIdentity` once — the SDK stores, persists, and automatically attaches it to the active user's identity.

```typescript
import messaging from '@react-native-firebase/messaging';

const fcmToken = await messaging().getToken();
await SignalSDK.setIdentity({ fcm_token: fcmToken });
```

> **Automated Token Refresh:** You do **not** need to set up an `onTokenRefresh` listener. The Signal SDK automatically monitors FCM token rotation and registers the updated token with the backend.

### 4.3 How the SDK handles the FCM token

| Behaviour | Detail |
|-----------|--------|
| **Storage** | Saved automatically to native device storage (SharedPreferences / NSUserDefaults). Survives app restarts. |
| **Restoration** | On `initSDK`, the last saved token is loaded automatically. No extra call needed. |
| **Deduplication** | Only persisted and sent again if it has changed. |
| **Sent as trait** | Forwarded to the backend as `traits.fcm_token` in the identify call. |
| **Logout behaviour** | `clearIdentity()` clears `user_id` but **keeps the FCM token** — push notifications keep working after logout. |

### Combined login + token example

```typescript
const fcmToken = await messaging().getToken();

await SignalSDK.setIdentity({
  user_id: 'ply_776192',
  fcm_token: fcmToken,
  traits: {
    email: 'player@example.com',
    account_status: 'active',
  },
});
```

---

## 5. Background Push Handling

For push notifications received when the app is **killed or in the background** (data-only FCM messages), wire up `handleBackgroundMessage` in your `index.js`:

```javascript
// index.js
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import messaging from '@react-native-firebase/messaging';
import SignalSDK from 'signal-react-native-sdk';

// Runs in headless mode — no React lifecycle needed
messaging().setBackgroundMessageHandler(SignalSDK.handleBackgroundMessage);

AppRegistry.registerComponent(appName, () => App);
```

**How it works:**
- If the FCM payload has a `notification` block, Firebase renders the notification automatically — the SDK steps aside to avoid duplicates.
- If the payload is data-only (no `notification` block), the SDK reads `data.title` / `data.body` and posts the notification natively via the Android layer.
- iOS is handled natively via swizzling — no extra code needed.

**Data-only push payload example (triggers SDK rendering):**
```json
{
  "data": {
    "title": "You have a new bonus!",
    "body": "Tap to claim your welcome bonus.",
    "campaign_id": "camp_100",
    "campaign_name": "Welcome Bonus",
    "notification_type": "promotional"
  }
}
```

---

## 6. Event Tracking

Use `sendEvent` to track any player action or screen view.

```typescript
await SignalSDK.sendEvent(eventName, properties);
```

### Events do NOT depend on login state

Events can be sent as soon as `initSDK` + `setIdentity` completes — whether the user is anonymous or logged in.

```
App start  →  initSDK  →  setIdentity (anon)  →  sendEvent ✓
                          setIdentity (login)  →  sendEvent ✓  (attributed to real player)
                          clearIdentity (logout) →  setIdentity (new anon)  →  sendEvent ✓
```

### Reserved property keys

The following keys are **automatically stripped** from `properties` even if passed — they are already top-level fields managed by the SDK:

`user_id`, `session_id`, `event_id`, `event_name`, `timestamp`, `device_type`, `platform`, `brand_id`

### Common events

```typescript
// Screen view
await SignalSDK.sendEvent('screen_view', { screen_name: 'Home' });

// Button / CTA tap
await SignalSDK.sendEvent('button_tap', { button_id: 'deposit_cta', screen: 'Wallet' });

// Game started
await SignalSDK.sendEvent('game_started', {
  game_id: 'slots_001',
  game_name: 'Lucky Spin',
  category: 'slots',
});

// Deposit
await SignalSDK.sendEvent('deposit_success', {
  amount: 100,
  currency: 'EUR',
  transaction_id: 'txn_abc123',
});

// Bonus claimed
await SignalSDK.sendEvent('bonus_claimed', {
  bonus_id: 'welcome_bonus',
  bonus_type: 'deposit_match',
});
```

---

## 7. Full Lifecycle Example

```typescript
import React, { useEffect } from 'react';
import messaging from '@react-native-firebase/messaging';
import SignalSDK from 'signal-react-native-sdk';

export default function App() {

  useEffect(() => {
    initializeSDK();
  }, []);

  const initializeSDK = async () => {
    // 1. Initialize SDK
    await SignalSDK.initSDK({
      clientId: 'YOUR_CLIENT_ID',
      clientSecret: 'YOUR_CLIENT_SECRET',
    });

    // 2. Set anonymous identity
    await SignalSDK.setIdentity({ user_id: 'anon-' + generateUUID() });

    // 3. Track app open
    await SignalSDK.sendEvent('app_open', { version: '1.0.0' });

    // 4. Register FCM token (token refresh is handled automatically by the SDK)
    try {
      const fcmToken = await messaging().getToken();
      await SignalSDK.setIdentity({ fcm_token: fcmToken });
    } catch {
      // notification permission not granted — safe to ignore
    }
  };

  return <YourAppNavigator />;
}


// --- In your login flow ---

const onLoginSuccess = async (player: Player) => {
  await SignalSDK.setIdentity({
    user_id: player.id,
    traits: {
      email: player.email,
      first_name: player.firstName,
      last_name: player.lastName,
      country: player.country,
      currency: player.currency,
      kyc_status: player.kycStatus,
      vip_level: player.vipLevel,
      account_status: 'active',
      registration_date: player.registeredAt,
    },
  });

  await SignalSDK.sendEvent('login_success', { method: 'email' });
};


// --- When KYC is approved ---

const onKycApproved = async () => {
  await SignalSDK.setIdentity({ traits: { kyc_status: 'approved' } });
  await SignalSDK.sendEvent('kyc_approved', {});
};


// --- In your logout flow ---

const onLogout = async () => {
  await SignalSDK.sendEvent('logout', {});
  SignalSDK.clearIdentity();
  await SignalSDK.setIdentity({ user_id: 'anon-' + generateUUID() });
};
```

---

## 8. API Reference

### `SignalSDK.initSDK(config)`

| Parameter      | Type     | Required | Description                          |
|----------------|----------|----------|--------------------------------------|
| `clientId`     | string   | Yes      | Your Signal client ID                |
| `clientSecret` | string   | Yes      | Your Signal client secret            |
| `onApiLog`     | function | No       | Callback for API call logging        |

Returns: `Promise<void>`

---

### `SignalSDK.setIdentity(payload)`

All fields are optional individually, but a `user_id` must be available either in the payload or already stored from a previous call.

| Parameter      | Type         | Description                                                            |
|----------------|--------------|------------------------------------------------------------------------|
| `user_id`      | string       | Player ID or anonymous UUID                                            |
| `anonymous_id` | string       | Pre-login anonymous ID (used to stitch pre/post-login behaviour)       |
| `fcm_token`    | string       | Firebase Cloud Messaging token — stored and forwarded to backend       |
| `traits`       | PlayerTraits | Player attributes to set or update                                     |
| `unset_traits` | string[]     | List of trait field names to explicitly remove from the player profile |
| `timestamp`    | string       | ISO 8601 datetime — defaults to `now` if omitted                       |

Returns: `Promise<SDKResponse>`

**PlayerTraits fields:**

| Trait               | Type   | Description                                      |
|---------------------|--------|--------------------------------------------------|
| `email`             | string | Player's email address                           |
| `phone`             | string | Phone in E.164 format                            |
| `first_name`        | string | First name                                       |
| `last_name`         | string | Last name                                        |
| `date_of_birth`     | string | `YYYY-MM-DD`                                     |
| `country`           | string | ISO 3166-1 alpha-2 (e.g. `MT`, `GB`)            |
| `currency`          | string | ISO currency code (e.g. `EUR`, `GBP`)            |
| `language`          | string | Language code (e.g. `en`, `de`)                  |
| `kyc_status`        | string | `pending`, `approved`, `rejected`                |
| `vip_level`         | string | `bronze`, `silver`, `gold`, `platinum`           |
| `account_status`    | string | `active`, `suspended`, `self_excluded`, `closed` |
| `registration_date` | string | ISO 8601 datetime                                |
| `brand_id`          | string | Brand/operator identifier in multi-brand setups  |
| *(any key)*         | any    | Custom fields are forwarded as-is                |

---

### `SignalSDK.clearIdentity()`

Clears the active `user_id`. The FCM token is kept.

Returns: `void`

---

### `SignalSDK.sendEvent(eventName, properties?)`

| Parameter    | Type                      | Required | Description                  |
|--------------|---------------------------|----------|------------------------------|
| `eventName`  | string                    | Yes      | Name of the event            |
| `properties` | Record\<string, unknown\> | No       | Key-value data for the event |

Returns: `Promise<SDKResponse>`

---

### `SignalSDK.handleBackgroundMessage`

Arrow function to pass directly to Firebase's `setBackgroundMessageHandler`. Handles data-only FCM messages when the app is killed or in the background.

```javascript
// index.js
messaging().setBackgroundMessageHandler(SignalSDK.handleBackgroundMessage);
```

Returns: `Promise<void>`

---

### `SDKResponse`

```typescript
{
  success: boolean;
  accepted?: number;  // number of events accepted (track calls)
  rejected?: number;  // number of events rejected (track calls)
  error?: string;     // error message if success is false
}
```

---

## 9. TypeScript Types

```typescript
import type {
  InitSDKConfig,
  IdentityPayload,
  PlayerTraits,
  SDKResponse,
  TrackEvent,
  IdentifyRequest,
  IdentifyResponse,
  DeviceInfo,
  APIResponse,
} from 'signal-react-native-sdk';
```

---

## Notes

- **`initSDK` must always be called first** and awaited before any other SDK method.
- **`setIdentity` must be called after `initSDK`** to set the initial user ID before tracking events.
- **Events do not require the user to be logged in** — they only require `initSDK` + `setIdentity` (anonymous is fine).
- **`setIdentity` is additive by default** — only the fields you pass are updated; everything else stays as-is.
- **The FCM token survives logout** — you do not need to re-register it after a user logs back in.
- **FCM token refresh is automatic** — the SDK sets up the listener internally; no `onTokenRefresh` wiring needed in your app.
- **QA routing is automatic** — prefix your `clientId` with `QA_` to route to the QA backend; the SDK strips the prefix before sending requests.
