# Signal React Native SDK

Official React Native SDK for Signal — event tracking, user identity, and push notification management.

## Installation

```bash
npm install signal-react-native-sdk
```

**iOS — link native dependencies:**

```bash
cd ios && pod install && cd ..
```

---

## Quick Start

### 1. Initialize (App.tsx)

```typescript
import SignalSDK from 'signal-react-native-sdk';

await SignalSDK.initSDK({
  clientId: 'YOUR_CLIENT_ID',
  clientSecret: 'YOUR_CLIENT_SECRET',
});

// Set identity right after init
await SignalSDK.setIdentity({ user_id: 'anon-' + generateUUID() });
```

### 2. Identify user after login

```typescript
await SignalSDK.setIdentity({
  user_id: 'ply_776192',
  traits: {
    email: 'player@example.com',
    first_name: 'Alex',
    country: 'MT',
    currency: 'EUR',
    kyc_status: 'pending',
  },
});
```

### 3. Track events

```typescript
await SignalSDK.sendEvent('deposit_success', {
  amount: 100,
  currency: 'EUR',
  transaction_id: 'txn_abc123',
});

await SignalSDK.sendEvent('game_started', {
  game_id: 'slots_001',
  game_name: 'Lucky Spin',
});
```

### 4. Register FCM token

```typescript
import messaging from '@react-native-firebase/messaging';

const fcmToken = await messaging().getToken();
await SignalSDK.setIdentity({ fcm_token: fcmToken });
// Token refresh is handled automatically by the SDK
```

### 5. Background push (index.js)

```javascript
import messaging from '@react-native-firebase/messaging';
import SignalSDK from 'signal-react-native-sdk';

messaging().setBackgroundMessageHandler(SignalSDK.handleBackgroundMessage);
```

### 6. Logout

```typescript
SignalSDK.clearIdentity();
await SignalSDK.setIdentity({ user_id: 'anon-' + generateUUID() });
```

---

## API

| Method | Description |
|--------|-------------|
| `initSDK(config)` | Initialize the SDK. Call once at app startup. |
| `setIdentity(payload)` | Set or update user identity and traits. |
| `clearIdentity()` | Clear the current user identity on logout. |
| `sendEvent(name, properties?)` | Track a player event. |
| `handleBackgroundMessage` | Pass to Firebase `setBackgroundMessageHandler` for killed/background push. |

### `initSDK(config)`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `clientId` | string | Yes | Your Signal client ID. Prefix with `QA_` to route to QA environment automatically. |
| `clientSecret` | string | Yes | Your Signal client secret. |
| `onApiLog` | function | No | Callback fired after every HTTP call — useful for debugging. |

### `setIdentity(payload)`

| Field | Type | Description |
|-------|------|-------------|
| `user_id` | string | Player ID or anonymous UUID. |
| `fcm_token` | string | FCM push token — stored and synced automatically. |
| `traits` | object | Player attributes (email, country, kyc_status, vip_level, etc.). |
| `unset_traits` | string[] | Trait keys to remove from the player profile. |

### `sendEvent(name, properties?)`

`properties` is a free-form `Record<string, unknown>`. Reserved keys (`user_id`, `session_id`, etc.) are automatically stripped — pass them freely without side effects.

---

## Environment Routing

Prefix your `clientId` with `QA_` to automatically route all traffic to the QA backend:

```typescript
await SignalSDK.initSDK({ clientId: 'QA_your-client-id', clientSecret: '...' });
// → routes to QA, strips the prefix before sending requests
```

No other configuration needed — production is the default.

---

## Full Integration Guide

See [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) for the complete guide covering the full player lifecycle, push notification tracking, background push handling, and TypeScript types.

---

## Publishing

```bash
./publish.sh
```

See [PUBLISHING.md](./PUBLISHING.md) for the full publish workflow.
