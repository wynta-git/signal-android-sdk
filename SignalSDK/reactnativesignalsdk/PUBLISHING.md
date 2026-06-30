# Signal React Native SDK — Publish Guide

## Prerequisites

- Node.js >= 16
- An npm account at [npmjs.com](https://www.npmjs.com) with access to publish `signal-react-native-sdk`
- TypeScript installed (already in devDependencies)

---

## Publishing from Scratch

### 1. Install dependencies (first time only)

```bash
cd /Users/manojmalvi.gridlogic/Desktop/ReactProjects/PAM/SignalSDK/reactnativesignalsdk
npm install
```

### 2. Run the publish script

```bash
./publish.sh
```

The script will automatically:
- Log you in to the official npm registry if not already logged in
- Show the current local version vs what's published on npm
- Ask which version bump to apply
- Build the SDK (`tsc`)
- Publish to npm

### 3. Choose version bump

| Choice | When to use |
|--------|-------------|
| `1` patch | Bug fixes only (1.0.0 → 1.0.1) |
| `2` minor | New features, backwards compatible (1.0.0 → 1.1.0) |
| `3` major | Breaking changes (1.0.0 → 2.0.0) |
| `4` custom | Enter any specific version manually |
| `5` none | Publish the current version as-is (first publish, or re-publish) |

> First publish: choose **5 (none)** to publish at the current version without bumping.

---

## Verify the Publish

```bash
# Full package info
npm view signal-react-native-sdk --registry=https://registry.npmjs.org/

# Just the version
npm view signal-react-native-sdk version --registry=https://registry.npmjs.org/
```

---

## Installing in a React Native App

```bash
npm install signal-react-native-sdk
```

### iOS

```bash
cd ios && pod install
```

### Usage

```ts
import SignalSDK from 'signal-react-native-sdk';

// Initialize
await SignalSDK.initSDK({ clientId: 'your-client-id', clientSecret: 'your-secret' });

// Identify user
await SignalSDK.setIdentity({ user_id: 'user_123' });

// Track event
await SignalSDK.sendEvent('purchase', { amount: 100 });
```

### Background push (index.js)

```js
import messaging from '@react-native-firebase/messaging';
import SignalSDK from 'signal-react-native-sdk';

messaging().setBackgroundMessageHandler(SignalSDK.handleBackgroundMessage);
```

---

## Notes

- The `dist/` folder is generated on every publish — never edit it manually
- Internal SDK code (`WyntaSDKClass`, `com.wyntasdk`, etc.) is kept as-is; only the npm package metadata is Signal-branded
- To deprecate an old package name on npm:
  ```bash
  npm deprecate <old-package-name> "Renamed to signal-react-native-sdk" --registry=https://registry.npmjs.org/
  ```
