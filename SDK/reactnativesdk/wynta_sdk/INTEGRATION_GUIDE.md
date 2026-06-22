# Wynta React Native SDK — Integration Guide

This guide covers everything a client application needs to integrate the Wynta SDK: initialization, user identity, push notification token management, and event tracking.

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
5. [Event Tracking](#5-event-tracking)
6. [Full Lifecycle Example](#6-full-lifecycle-example)
7. [API Reference](#7-api-reference)
8. [TypeScript Types](#8-typescript-types)

---

## 1. Installation

```bash
npm install wynta-react-native-sdk
```

**Optional — for FCM token persistence across app restarts:**

```bash
npm install @react-native-async-storage/async-storage
```

> Without this, the FCM token is held in memory only and will not survive app restarts. All other SDK features work without it.

---

## 2. Initialization

Call `initSDK` once at app startup, before anything else. It is `async` — always `await` it.

```typescript
import WyntaSDK from 'wynta-react-native-sdk';

await WyntaSDK.initSDK({
  clientId: 'YOUR_CLIENT_ID',
  clientSecret: 'YOUR_CLIENT_SECRET',
  identity: 'anon-' + generateUUID(), // start with anonymous ID
});
```

**Config fields:**

| Field          | Type   | Required | Description                                                    |
|----------------|--------|----------|----------------------------------------------------------------|
| `clientId`     | string | Yes      | Your Wynta client ID                                          |
| `clientSecret` | string | Yes      | Your Wynta client secret (used as Bearer token for identify)  |
| `identity`     | string | Yes      | Initial user ID — use an anonymous UUID before login          |

**What `initSDK` does:**
- Stores credentials in the internal Redux store
- Creates a stable session ID for this app session
- Restores any previously saved FCM token from device storage (if `@react-native-async-storage/async-storage` is installed)

**Recommended location — `App.tsx`:**

```typescript
import React, { useEffect } from 'react';
import WyntaSDK from 'wynta-react-native-sdk';
import { generateUUID } from './utils'; // your UUID helper

export default function App() {
  useEffect(() => {
    const bootstrap = async () => {
      await WyntaSDK.initSDK({
        clientId: 'YOUR_CLIENT_ID',
        clientSecret: 'YOUR_CLIENT_SECRET',
        identity: 'anon-' + generateUUID(),
      });
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

The `identity` you pass to `initSDK` immediately becomes the active user ID. Events sent before login are attributed to this anonymous ID. No extra call is needed.

```typescript
// initSDK already sets identity: 'anon-xxxxxxxx'
// Events will be tracked under that anonymous ID immediately

await WyntaSDK.sendEvent('app_open', { screen: 'Splash' });
await WyntaSDK.sendEvent('onboarding_started', {});
```

You can optionally call `setIdentity` to explicitly mark the user as anonymous:

```typescript
await WyntaSDK.setIdentity({
  user_id: 'anon-xxxxxxxx',
  anonymous_id: 'anon-xxxxxxxx',
});
```

### 3.2 After login

Call `setIdentity` immediately after a successful login. Pass the real `user_id` and as many player traits as you have available. The SDK will send these to the Wynta backend (`POST /v1/events/identify`) and all subsequent events will be attributed to the real player.

```typescript
await WyntaSDK.setIdentity({
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
await WyntaSDK.setIdentity({
  traits: { kyc_status: 'approved' },
});

// VIP tier upgrade
await WyntaSDK.setIdentity({
  traits: { vip_level: 'gold' },
});

// Removing a field
await WyntaSDK.setIdentity({
  unset_traits: ['referral_code'],
});
```

> The SDK merges the new traits with whatever `user_id` is already stored — you do not need to re-pass `user_id` on every traits update.

### 3.4 Logout

Call `clearIdentity` when the user logs out. This clears the `user_id` from the SDK. The FCM token is intentionally preserved because it is device-level, not user-level.

```typescript
WyntaSDK.clearIdentity();

// After logout, re-set an anonymous ID so events can still be tracked
await WyntaSDK.setIdentity({
  user_id: 'anon-' + generateUUID(),
});
```

---

## 4. FCM Token — Push Notifications

The SDK manages the FCM token lifecycle. You only need to call `setIdentity` with the token — the SDK handles storage, persistence, and forwarding it to the backend.

### Registering the token for the first time

```typescript
import messaging from '@react-native-firebase/messaging';

const fcmToken = await messaging().getToken();

await WyntaSDK.setIdentity({ fcm_token: fcmToken });
```

### Listening for token refresh

FCM tokens can rotate. Set up a listener and call `setIdentity` when the token changes — the SDK will persist the new token and update the backend.

```typescript
useEffect(() => {
  const unsubscribe = messaging().onTokenRefresh(async (newToken) => {
    await WyntaSDK.setIdentity({ fcm_token: newToken });
  });
  return unsubscribe;
}, []);
```

### How the SDK handles the FCM token

| Behaviour | Detail |
|---|---|
| **Storage** | Saved to `@react-native-async-storage/async-storage` (key: `@wynta/fcm_token`). Survives app restarts. |
| **Restoration** | On `initSDK`, the last saved token is loaded automatically. No extra call needed. |
| **Deduplication** | The token is only persisted and sent again if it has changed. |
| **Sent as trait** | Forwarded to the backend as `traits.fcm_token` in the identify call. |
| **Logout behaviour** | `clearIdentity()` clears `user_id` but **keeps the FCM token** — so push notifications keep working for the logged-out session. |

### Combined login + token example

```typescript
const fcmToken = await messaging().getToken();

await WyntaSDK.setIdentity({
  user_id: 'ply_776192',
  fcm_token: fcmToken,
  traits: {
    email: 'player@example.com',
    account_status: 'active',
  },
});
```

---

## 5. Event Tracking

Use `sendEvent` to track any player action or screen view.

```typescript
await WyntaSDK.sendEvent(eventName, properties);
```

### Events do NOT depend on login state

Events can be sent as soon as `initSDK` completes — whether the user is anonymous or logged in. The SDK uses whatever identity is currently active (anonymous UUID or real player ID). You do not need to wait for login before tracking events.

```
App start  →  initSDK (anonymous ID set)  →  sendEvent ✓
             setIdentity (login)          →  sendEvent ✓  (now attributed to real player)
             clearIdentity (logout)        →  setIdentity (new anon ID)  →  sendEvent ✓
```

### Common events

```typescript
// Screen view
await WyntaSDK.sendEvent('screen_view', { screen_name: 'Home' });

// Button / CTA tap
await WyntaSDK.sendEvent('button_tap', { button_id: 'deposit_cta', screen: 'Wallet' });

// Game started
await WyntaSDK.sendEvent('game_started', {
  game_id: 'slots_001',
  game_name: 'Lucky Spin',
  category: 'slots',
});

// Deposit initiated
await WyntaSDK.sendEvent('deposit_initiated', {
  amount: 100,
  currency: 'EUR',
  payment_method: 'card',
});

// Deposit completed
await WyntaSDK.sendEvent('deposit_completed', {
  amount: 100,
  currency: 'EUR',
  transaction_id: 'txn_abc123',
});

// Bonus claimed
await WyntaSDK.sendEvent('bonus_claimed', {
  bonus_id: 'welcome_bonus',
  bonus_type: 'deposit_match',
});
```

### Properties

`properties` is a free-form `Record<string, unknown>`. Pass any key-value data relevant to the event. All values must be JSON-serialisable.

---

## 6. Full Lifecycle Example

Below is a complete integration showing the full user journey from app launch to login to logout.

```typescript
import React, { useEffect } from 'react';
import messaging from '@react-native-firebase/messaging';
import WyntaSDK from 'wynta-react-native-sdk';
import { generateUUID } from './utils';

export default function App() {

  useEffect(() => {
    initializeSDK();
  }, []);

  const initializeSDK = async () => {
    // 1. Initialize with anonymous identity
    await WyntaSDK.initSDK({
      clientId: 'YOUR_CLIENT_ID',
      clientSecret: 'YOUR_CLIENT_SECRET',
      identity: 'anon-' + generateUUID(),
    });

    // 2. Track app open — works immediately, no login needed
    await WyntaSDK.sendEvent('app_open', { version: '2.1.0' });

    // 3. Register FCM token (stored and forwarded automatically)
    try {
      const fcmToken = await messaging().getToken();
      await WyntaSDK.setIdentity({ fcm_token: fcmToken });
    } catch (e) {
      // notification permission not granted — safe to ignore
    }

    // 4. Listen for FCM token refresh
    messaging().onTokenRefresh(async (newToken) => {
      await WyntaSDK.setIdentity({ fcm_token: newToken });
    });
  };

  return <YourAppNavigator />;
}


// --- In your login flow ---

const onLoginSuccess = async (player: Player) => {
  // 5. Set real identity after login — merges with any stored FCM token
  await WyntaSDK.setIdentity({
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

  // 6. Events from here are attributed to the real player ID
  await WyntaSDK.sendEvent('login_success', { method: 'email' });
};


// --- When KYC is approved ---

const onKycApproved = async () => {
  await WyntaSDK.setIdentity({
    traits: { kyc_status: 'approved' },
  });
  await WyntaSDK.sendEvent('kyc_approved', {});
};


// --- In your logout flow ---

const onLogout = async () => {
  await WyntaSDK.sendEvent('logout', {});

  // 7. Clear real identity — FCM token is kept
  WyntaSDK.clearIdentity();

  // 8. Set a fresh anonymous ID for continued tracking
  await WyntaSDK.setIdentity({
    user_id: 'anon-' + generateUUID(),
  });
};
```

---

## 7. API Reference

### `WyntaSDK.initSDK(config)`

| Parameter       | Type   | Required | Description                          |
|-----------------|--------|----------|--------------------------------------|
| `clientId`      | string | Yes      | Your Wynta client ID                |
| `clientSecret`  | string | Yes      | Your Wynta client secret            |
| `identity`      | string | Yes      | Initial user ID (use anonymous UUID) |

Returns: `Promise<void>`

---

### `WyntaSDK.setIdentity(payload)`

All fields are optional individually, but at least a `user_id` must be available either in the payload or already stored from a previous call.

| Parameter      | Type          | Description                                                               |
|----------------|---------------|---------------------------------------------------------------------------|
| `user_id`      | string        | Player ID or anonymous UUID                                               |
| `anonymous_id` | string        | Pre-login anonymous ID (used to stitch pre/post-login behaviour)          |
| `fcm_token`    | string        | Firebase Cloud Messaging token — stored and forwarded to backend          |
| `traits`       | PlayerTraits  | Player attributes to set or update (see traits table below)               |
| `unset_traits` | string[]      | List of trait field names to explicitly remove from the player profile    |
| `timestamp`    | string        | ISO 8601 datetime — defaults to `now` if omitted                         |

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
| `fcm_token`         | string | Set automatically when passed at top level       |
| *(any key)*         | any    | Custom fields are forwarded as-is                |

---

### `WyntaSDK.clearIdentity()`

Clears the active `user_id`. The FCM token is kept.

Returns: `void`

---

### `WyntaSDK.sendEvent(eventName, properties?)`

| Parameter    | Type                      | Required | Description                         |
|--------------|---------------------------|----------|-------------------------------------|
| `eventName`  | string                    | Yes      | Name of the event                   |
| `properties` | Record\<string, unknown\> | No       | Key-value data for the event        |

Returns: `Promise<SDKResponse>`

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

## 8. TypeScript Types

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
} from 'wynta-react-native-sdk';
```

---

## Notes

- **`initSDK` must always be called first** and awaited before any other SDK method.
- **Events do not require the user to be logged in.** They only require that `initSDK` has been called (which sets an initial identity automatically).
- **`setIdentity` is additive by default** — only the fields you pass are updated; everything else stays as-is.
- **The FCM token survives logout** — you do not need to re-register it after a user logs back in.
- **All `sendEvent` and `setIdentity` calls are fire-and-forget safe** — they return a `SDKResponse` you can check but do not need to block on.
