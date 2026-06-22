# Wynta React Native SDK — Installation Guide

This document covers all the ways to install and use the Wynta React Native SDK in any React Native project.

---

## Prerequisites

- Node.js >= 16.0.0
- React >= 17.0.0
- React Native >= 0.68.0

---

## Option 1 — Local Path Install (Quickest, for testing)

Use this when you want to quickly test the SDK in a project on the same machine.

From the root of your React Native project, run:

```bash
npm install /Users/manojmalvi.gridlogic/Desktop/ReactProjects/Wynta/WyntaApp/wyntaai/wynta_sdk
```

Or using a relative path if the projects are in nearby folders:

```bash
npm install ../WyntaApp/wyntaai/wynta_sdk
```

This adds an entry to your app's `package.json` like:

```json
"dependencies": {
  "wynta-react-native-sdk": "file:../WyntaApp/wyntaai/wynta_sdk"
}
```

> **Important:** Every time you change SDK source code, you must run `npm run build` inside the `wynta_sdk/` folder first, then re-run the install command in your app.

---

## Option 2 — `npm link` (Best for active development)

Use this when you are actively developing the SDK and a React Native app at the same time. It creates a live symlink so changes in the SDK are reflected immediately after a build — no reinstall needed.

**Step 1** — Register the SDK globally on your machine (run this inside `wynta_sdk/`):

```bash
cd wynta_sdk
npm run build
npm link
```

**Step 2** — Link it into your React Native project (run this inside your RN app root):

```bash
npm link wynta-react-native-sdk
```

Now whenever you update SDK code:

```bash
cd wynta_sdk
npm run build   # changes are immediately available in your linked app
```

To unlink when done:

```bash
# Inside your RN app
npm unlink wynta-react-native-sdk

# Inside wynta_sdk
npm unlink
```

---

## Option 3 — Publish to npm (For sharing with your team)

Use this when the SDK is ready to be used by other developers or other projects without needing a local copy.

**Step 1** — Build the SDK:

```bash
cd wynta_sdk
npm run build
```

**Step 2** — Login to npm and publish:

```bash
npm login
npm publish
```

**Step 3** — Install in any project from anywhere:

```bash
npm install wynta-react-native-sdk
```

> **Note:** You need an npm account and publish access to the `wynta-react-native-sdk` package to use this option.

---

## Using the SDK After Installation

### Default import (recommended)

```typescript
import WyntaSDK from 'wynta-react-native-sdk';

// Initialize once at app startup — add this to App.tsx
WyntaSDK.init({ debug: true });

// Verify the SDK is working
const result = WyntaSDK.test();
console.log(result);
// { success: true, message: 'Wynta SDK initialized successfully' }
```

### Named imports

```typescript
import { init, test, getVersion } from 'wynta-react-native-sdk';

init({ apiKey: 'your-api-key' });
test();
console.log(getVersion()); // '0.1.0'
```

### TypeScript type imports

```typescript
import type { SDKConfig, SDKTestResult } from 'wynta-react-native-sdk';

const config: SDKConfig = {
  apiKey: 'your-api-key',
  baseUrl: 'https://api.wynta.com',
  debug: false,
};
```

---

## SDK Init Config Options

| Option    | Type    | Required | Description                        |
|-----------|---------|----------|------------------------------------|
| `apiKey`  | string  | No       | Your Wynta API key                 |
| `baseUrl` | string  | No       | Custom base URL override           |
| `debug`   | boolean | No       | Enable verbose SDK logging         |

---

## Recommended Setup in App.tsx

```typescript
import React, { useEffect } from 'react';
import WyntaSDK from 'wynta-react-native-sdk';

export default function App() {
  useEffect(() => {
    WyntaSDK.init({
      apiKey: 'your-api-key',
      debug: __DEV__,  // enable debug logs only in development
    });
  }, []);

  return (
    // your app content
  );
}
```

---

## Summary

| Option         | Best For                          | Requires Build After Changes |
|----------------|-----------------------------------|------------------------------|
| Local path install | Quick one-time testing       | Yes — reinstall needed       |
| `npm link`     | Active SDK + app development       | Yes — but no reinstall needed |
| npm publish    | Team sharing / production use      | Yes — publish new version    |
