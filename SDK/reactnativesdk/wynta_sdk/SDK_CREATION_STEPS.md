# Wynta React Native SDK — Creation Steps

This document outlines every step followed to design, build, and prepare the Wynta React Native SDK for use and publishing.

---

## Overview

The SDK is a **standalone TypeScript package** located inside the monorepo at `wynta_sdk/`. It is built to be consumed by React Native apps and can be published to npm independently.

---

## Step 1 — Planned the Folder Structure

Designed the package layout before writing any code:

```
wynta_sdk/
├── src/
│   ├── WyntaSDK.ts          ← main SDK class
│   ├── index.ts             ← public entry point / all exports
│   ├── types/
│   │   └── index.ts         ← TypeScript interfaces
│   ├── utils/
│   │   └── logger.ts        ← internal logging utility
│   └── services/
│       └── index.ts         ← placeholder for future services
├── dist/                    ← compiled output (auto-generated, not edited manually)
├── package.json             ← npm package configuration
├── tsconfig.json            ← TypeScript compiler configuration
└── README.md                ← developer documentation
```

**Why:** Separating `src/` from `dist/` is standard practice for npm packages. Only `dist/` is shipped to consumers; source stays in the repo.

---

## Step 2 — Defined TypeScript Interfaces (`src/types/index.ts`)

Created two interfaces that define the SDK's public contract:

```typescript
export interface SDKConfig {
  apiKey?: string;   // Wynta API key
  baseUrl?: string;  // custom base URL override
  debug?: boolean;   // enables verbose logging
}

export interface SDKTestResult {
  success: boolean;
  message: string;
}
```

**Why:** Defining types first locks in the API shape before any implementation, and gives consumers full TypeScript autocomplete.

---

## Step 3 — Built the Logger Utility (`src/utils/logger.ts`)

Created an internal logger that prefixes all output with `[WyntaSDK]`:

```typescript
const PREFIX = '[WyntaSDK]';

export const logger = {
  log: (message: string, ...args: unknown[]): void => {
    console.log(`${PREFIX} ${message}`, ...args);
  },
  warn: (message: string, ...args: unknown[]): void => {
    console.warn(`${PREFIX} ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]): void => {
    console.error(`${PREFIX} ${message}`, ...args);
  },
};
```

**Why:** Prefixed logs make it easy to identify SDK output in the app's debug console, especially during integration testing.

---

## Step 4 — Built the Core SDK Class (`src/WyntaSDK.ts`)

Created a `WyntaSDKClass` with the following public methods:

| Method | Description |
|---|---|
| `init(config?)` | Initialize SDK at app startup; stores config |
| `test()` | Verifies SDK is working; returns `{ success: true, message }` |
| `getVersion()` | Returns the current version string (`"0.1.0"`) |
| `getName()` | Returns `"Wynta React Native SDK"` |
| `isInitialized()` | Returns `true` if `init()` has been called |
| `getConfig()` | Returns a read-only copy of the active config |

A **singleton instance** is created and exported as the default:

```typescript
const WyntaSDK = new WyntaSDKClass();
export default WyntaSDK;
```

**Why:** A singleton means app developers don't need to manage instances — they just import and call. The class is also exported separately for advanced use cases.

---

## Step 5 — Created the Public Entry Point (`src/index.ts`)

This is the file that consumers import from (`wynta-react-native-sdk`). It exposes:

- **Default export** — the singleton `WyntaSDK` instance
- **Named class export** — `WyntaSDKClass` for custom instances
- **Type exports** — `SDKConfig`, `SDKTestResult`
- **Shorthand function exports** — `test`, `init`, `getVersion` for convenience

```typescript
// Usage after this entry point:
import WyntaSDK from 'wynta-react-native-sdk';
// or
import { test, init, getVersion } from 'wynta-react-native-sdk';
```

**Why:** A clean entry point separates internal module organization from the public API. Consumers only need to know one import path.

---

## Step 6 — Configured TypeScript (`tsconfig.json`)

Key compiler settings chosen:

| Setting | Value | Reason |
|---|---|---|
| `target` | `ES6` | Compatible with React Native's JavaScript engine |
| `module` | `CommonJS` | Standard format for npm packages |
| `declaration` | `true` | Generates `.d.ts` type files for TypeScript consumers |
| `declarationMap` | `true` | Maps type definitions back to source for better IDE navigation |
| `sourceMap` | `true` | Maps compiled JS back to TypeScript for debugging |
| `strict` | `true` | Enforces strong type safety |
| `outDir` | `./dist` | All compiled output goes to the `dist/` folder |
| `rootDir` | `./src` | Source root is the `src/` folder |

---

## Step 7 — Configured `package.json`

Key fields set up for npm publishing:

| Field | Value | Purpose |
|---|---|---|
| `name` | `wynta-react-native-sdk` | Package name on npm |
| `version` | `0.1.0` | Initial release version |
| `main` | `dist/index.js` | Entry point for Node/React Native |
| `types` | `dist/index.d.ts` | Entry point for TypeScript type resolution |
| `files` | `["dist"]` | Only the compiled output is published to npm |
| `peerDependencies` | React ≥17, RN ≥0.68 | App provides these; SDK doesn't bundle them |

Build scripts configured:

```json
"scripts": {
  "build": "tsc --project tsconfig.json",
  "clean": "rm -rf dist",
  "prebuild": "npm run clean",
  "build:watch": "tsc --project tsconfig.json --watch",
  "type-check": "tsc --noEmit"
}
```

**Why `prebuild`:** Ensures `dist/` is always clean before a new build, preventing stale files from being shipped.

---

## Step 8 — Added Services Placeholder (`src/services/index.ts`)

Created an empty services file with a comment for planned future modules:

```typescript
// Services will be added here in future SDK versions.
// Example: AuthService, AffiliateService, ReportingService
```

**Why:** Establishing the folder now means future developers know where to add services without restructuring the project.

---

## Step 9 — Built the SDK

Ran the build command from inside `wynta_sdk/`:

```bash
npm install        # installs devDependencies (TypeScript)
npm run build      # compiles src/ → dist/
```

The build process:
1. `prebuild` hook deletes the existing `dist/` folder
2. TypeScript compiler reads `tsconfig.json`
3. Compiles all `.ts` files from `src/` into `dist/`
4. Generates `.js`, `.d.ts`, `.d.ts.map`, and `.js.map` files

Output in `dist/`:
```
dist/
├── index.js / index.d.ts / index.d.ts.map / index.js.map
├── WyntaSDK.js / WyntaSDK.d.ts / ...
├── types/index.js / index.d.ts / ...
├── utils/logger.js / logger.d.ts / ...
└── services/index.js / index.d.ts / ...
```

---

## Step 10 — Wrote Developer Documentation (`README.md`)

Documented the full public API including:
- Installation instructions
- Quick start code snippet
- Named import examples
- Type import examples
- Full API method reference table
- How to build locally
- How to use locally in the app (`npm install ../wynta_sdk`)
- How to publish to npm

---

## How to Use Locally (Before Publishing)

From the root of the React Native app:

```bash
npm install ../wynta_sdk
```

Then in any screen or component:

```typescript
import WyntaSDK from 'wynta-react-native-sdk';

WyntaSDK.init({ debug: true });
const result = WyntaSDK.test();
console.log(result); // { success: true, message: 'Wynta SDK initialized successfully' }
```

---

## How to Publish to npm (When Ready)

```bash
cd wynta_sdk
npm login
npm publish
```

---

## Summary

| What | Detail |
|---|---|
| Language | TypeScript |
| Output format | CommonJS (for React Native compatibility) |
| Type definitions | Auto-generated `.d.ts` files |
| Package size | Ships only `dist/` — no source, no node_modules |
| Peer deps | React ≥17, React Native ≥0.68 |
| Current version | 0.1.0 |
| Status | Built, tested locally, ready for feature expansion |
