# Wynta React Native SDK

Official React Native SDK for Wynta.

## Installation

```bash
npm install wynta-react-native-sdk
```

## Quick Start

```typescript
import WyntaSDK from 'wynta-react-native-sdk';

// Initialize once at app startup (e.g. in App.tsx)
WyntaSDK.init({ debug: true });

// Verify integration
const result = WyntaSDK.test();
console.log(result);
// { success: true, message: 'Wynta SDK initialized successfully' }
```

## Named imports

```typescript
import { test, init, getVersion, sendEvent, sendFCMToken, setIdentity } from 'wynta-react-native-sdk';

test();         // { success: true, message: '...' }
getVersion();   // '0.1.0'
```

## Type imports

```typescript
import type {
  SDKConfig,
  SDKTestResult,
  EventPayload,
  EventResult,
  FCMTokenPayload,
  FCMTokenResult,
  IdentityData,
  IdentityResult,
  IdentityValidationError,
} from 'wynta-react-native-sdk';
```

---

## API

### `WyntaSDK.init(config?)`

Initialize the SDK. Call once at app startup before using any other method.

| Option    | Type    | Description                  |
|-----------|---------|------------------------------|
| `apiKey`  | string  | Your Wynta API key           |
| `baseUrl` | string  | Custom base URL override     |
| `debug`   | boolean | Enable verbose debug logging |

---

### `WyntaSDK.test()`

Returns `{ success: true, message: string }`. Use to verify the SDK is installed and importable.

---

### `WyntaSDK.sendEvent(payload)`

Simulate sending an analytics event to the Wynta backend.

**Payload:**

| Field         | Type                        | Required | Description                        |
|---------------|-----------------------------|----------|------------------------------------|
| `eventName`   | string                      | Yes      | Name of the event                  |
| `screenName`  | string                      | No       | Screen where the event occurred    |
| `metadata`    | Record\<string, unknown\>   | No       | Additional key-value context       |

**Example:**

```typescript
const result = WyntaSDK.sendEvent({
  eventName: 'button_clicked',
  screenName: 'Home',
  metadata: { source: 'demo' },
});
// { success: true, message: 'Event sent successfully (mock)', payload: {...} }
```

---

### `WyntaSDK.sendFCMToken(payload)`

Submit an FCM push notification token to the Wynta backend.

**Payload:**

| Field      | Type   | Required | Description                 |
|------------|--------|----------|-----------------------------|
| `userId`   | string | Yes      | ID of the current user      |
| `fcmToken` | string | Yes      | FCM token from the device   |

**Example:**

```typescript
const result = WyntaSDK.sendFCMToken({
  userId: '123',
  fcmToken: 'device_fcm_token_here',
});
// { success: true, message: 'FCM token submitted successfully (mock)', payload: {...} }
```

---

### `WyntaSDK.setIdentity(identity)`

Set or update the identity of the current user. Call this after `init()` and again any time the user's identity changes (e.g. after login or profile update).

- Validates required fields before sending.
- Returns a structured result with `success`, `message`, and `errors` (if validation fails).
- Designed for extensibility — pass any extra key-value pairs alongside the core fields and they will be forwarded to the backend without requiring an SDK version bump.

**Identity fields:**

| Field    | Type   | Required | Description                              |
|----------|--------|----------|------------------------------------------|
| `userId` | string | **Yes**  | Unique identifier for the user           |
| `name`   | string | No       | Full name of the user                    |
| `email`  | string | No       | Email address (validated for format)     |
| `phone`  | string | No       | Phone number                             |
| `...`    | any    | No       | Any additional custom fields             |

**Example — success:**

```typescript
const result = WyntaSDK.setIdentity({
  userId: '12345',
  name: 'John Doe',
  email: 'john@example.com',
  phone: '+911234567890',
});

console.log(result);
// {
//   success: true,
//   message: 'Identity set successfully (mock)',
//   payload: { userId: '12345', name: 'John Doe', email: 'john@example.com', phone: '+911234567890' }
// }
```

**Example — validation failure (missing userId):**

```typescript
const result = WyntaSDK.setIdentity({ userId: '' });

console.log(result);
// {
//   success: false,
//   message: 'Identity validation failed.',
//   errors: [{ field: 'userId', message: 'userId is required and must be a non-empty string.' }]
// }
```

**Example — with custom extensibility fields:**

```typescript
WyntaSDK.setIdentity({
  userId: '12345',
  email: 'john@example.com',
  plan: 'premium',       // custom field
  referralCode: 'ABC10', // custom field
});
```

**Recommended integration (App.tsx):**

```typescript
import WyntaSDK from 'wynta-react-native-sdk';

// After SDK init and after the user logs in:
WyntaSDK.init({ apiKey: 'your-api-key', debug: __DEV__ });

WyntaSDK.setIdentity({
  userId: currentUser.id,
  name: currentUser.displayName,
  email: currentUser.email,
  phone: currentUser.phone,
});
```

---

### `WyntaSDK.getVersion()`

Returns the SDK version string (e.g. `'0.1.0'`).

### `WyntaSDK.getName()`

Returns `'Wynta React Native SDK'`.

### `WyntaSDK.isInitialized()`

Returns `true` if `init()` has been called.

### `WyntaSDK.getConfig()`

Returns a read-only copy of the active configuration passed to `init()`.

---

## Building

```bash
npm run build
```

Output is written to `dist/`.

## Local development / testing

From the consuming app root:

```bash
npm install ../wynta_sdk
```

Then import normally:

```typescript
import WyntaSDK from 'wynta-react-native-sdk';
```

## Publishing

To automatically build, bump version, publish to the npm registry, and verify:

```bash
npm run release <patch | minor | major>
```

Example (for bug fixes / patches):
```bash
npm run release patch
```

> [!NOTE]
> The script will automatically verify your authentication against the official npm registry, check for dirty git directories, and build compiler assets before publishing.

