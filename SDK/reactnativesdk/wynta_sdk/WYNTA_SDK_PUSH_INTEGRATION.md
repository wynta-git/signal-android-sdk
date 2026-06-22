# Wynta SDK — Push Notification Integration Guide

This guide covers everything a client app needs to do to enable push notifications via the Wynta SDK using Firebase Cloud Messaging (FCM).

---

## Overview

The Wynta SDK uses FCM tokens to deliver targeted push notifications. The client app is responsible for:
- Setting up Firebase in the project
- Requesting notification permission from the user
- Fetching the FCM token
- Passing the token to the SDK via `setIdentity()`

The SDK handles storing the token and registering it with the Wynta backend.

---

## Prerequisites

- React Native `>= 0.73`
- A Firebase project ([console.firebase.google.com](https://console.firebase.google.com))
- Wynta SDK installed in the project

---

## Step 1 — Install Required Packages

```bash
npm install @react-native-firebase/app @react-native-firebase/messaging
```

For iOS, run pod install after:

```bash
cd ios && pod install
```

---

## Step 2 — Firebase Project Setup

### Android

1. Go to [Firebase Console](https://console.firebase.google.com) → your project → **Project Settings**
2. Under **Your apps**, add an Android app with your app's package name (e.g. `com.yourapp`)
3. Download `google-services.json`
4. Place it at `android/app/google-services.json`

### iOS

1. In the same Firebase project, add an iOS app with your app's bundle ID (e.g. `com.yourapp`)
2. Download `GoogleService-Info.plist`
3. Place it at `ios/<YourApp>/GoogleService-Info.plist`
4. Open Xcode → right-click your app target → **Add Files** → select the plist (do not copy to a different location)

---

## Step 3 — Android Native Configuration

### 3a. `android/build.gradle` — Add Google Services plugin

```groovy
buildscript {
    dependencies {
        // ...existing dependencies
        classpath("com.google.gms:google-services:4.4.2")
    }
}
```

### 3b. `android/app/build.gradle` — Apply the plugin

Add at the bottom of the file:

```groovy
apply plugin: "com.google.gms.google-services"
```

### 3c. `android/app/src/main/AndroidManifest.xml` — Add permissions and default channel

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <!-- Required for push notifications on Android 13+ -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

    <application ...>

        <!-- Tell Firebase which notification channel to use -->
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_channel_id"
            android:value="default_push_channel"
            tools:replace="android:value" />

        ...
    </application>
</manifest>
```

### 3d. Create a High-Importance Notification Channel

Firebase's auto-created fallback channel uses low importance (silent notifications). Create your own channel with high importance so notifications appear as banners.

In `android/app/src/main/java/<your_package>/MainApplication.kt`:

```kotlin
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class MainApplication : Application(), ReactApplication {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()   // <-- add this line
        // ... rest of your onCreate
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                "default_push_channel",           // must match the value in AndroidManifest
                "App Notifications",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Push notifications"
                enableLights(true)
                enableVibration(true)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }
}
```

> **Note:** The channel ID `"default_push_channel"` must match the value set in `AndroidManifest.xml`.

---

## Step 4 — iOS Native Configuration

### 4a. Enable Push Notifications capability in Xcode

1. Open `ios/<YourApp>.xcworkspace` in Xcode
2. Select your app target → **Signing & Capabilities**
3. Click **+ Capability** → add **Push Notifications**
4. Also add **Background Modes** → check **Remote notifications**

### 4b. `ios/Podfile` — Add modular headers for Firebase

Some Firebase pods require modular headers. Add these lines inside your target block:

```ruby
target 'YourApp' do
  # ...
  pod 'GoogleUtilities', :modular_headers => true
  pod 'FirebaseCoreInternal', :modular_headers => true
  # ...
end
```

Then run `pod install` again.

---

## Step 5 — JavaScript Integration

### 5a. `index.js` — Register background message handler

This **must** be in the root `index.js` at the top level, outside any component. It handles pushes when the app is backgrounded or killed.

```js
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import messaging from '@react-native-firebase/messaging';

// Required — handles pushes when app is in background or killed
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('[FCM] Background message received:', remoteMessage);
});

AppRegistry.registerComponent(appName, () => App);
```

### 5b. Request permission and get FCM token

In your main component (or wherever you initialise the SDK), request notification permission and fetch the FCM token:

```ts
import messaging from '@react-native-firebase/messaging';
import WyntaSDK from 'wynta-react-native-sdk';

useEffect(() => {
  (async () => {
    // 1. Request permission (required on iOS, recommended on Android 13+)
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (!enabled) {
      console.warn('Notification permission denied');
      return;
    }

    // 2. Get FCM token
    const fcmToken = await messaging().getToken();
    console.log('FCM Token:', fcmToken);

    // 3. Pass token to Wynta SDK via setIdentity
    await WyntaSDK.setIdentity({
      user_id: '<your_user_id>',
      fcm_token: fcmToken,
      traits: {
        email: 'user@example.com',
        // ...other user properties
      },
    });
  })();
}, []);
```

### 5c. Handle foreground notifications (optional)

Android does not auto-display notifications when the app is open. Add a foreground listener and display it however suits your app's UI:

```ts
useEffect(() => {
  const unsubscribe = messaging().onMessage(async remoteMessage => {
    const { title, body } = remoteMessage.notification ?? {};
    // Show an in-app alert, toast, or custom notification UI
    Alert.alert(title ?? 'New Notification', body ?? '');
  });
  return unsubscribe;
}, []);
```

### 5d. Handle FCM Token Refresh — Important

> **This step is required.** FCM tokens can change at any time — when the app is reinstalled, when the user clears app data, or when Google Play Services rotates the token. If the SDK holds a stale token, push notifications will stop being delivered.

Register a token refresh listener to automatically send the updated token to the SDK whenever it changes:

```ts
useEffect(() => {
  const unsubscribe = messaging().onTokenRefresh(async newToken => {
    console.log('[FCM] Token refreshed:', newToken);
    // Send the new token to Wynta SDK immediately — no need to pass user_id or traits again
    await WyntaSDK.setIdentity({ fcm_token: newToken });
  });
  return unsubscribe;
}, []);
```

**When does the token change?**
- App is uninstalled and reinstalled
- User clears app data from device settings
- Google Play Services rotates the token (can happen periodically)
- App is restored to a new device from backup

**What happens if you don't handle this?**  
The Wynta backend will keep sending pushes to the old (invalid) token and the user will stop receiving notifications — with no visible error.

---

## Step 6 — Wynta SDK Identity Flow

The full recommended flow after the user logs in:

```ts
// 1. Initialise the SDK (once, at app start)
await WyntaSDK.initSDK({
  clientId: 'YOUR_CLIENT_ID',
  clientSecret: 'YOUR_CLIENT_SECRET',
  identity: userId,
});

// 2. Set identity with FCM token after user logs in
const fcmToken = await messaging().getToken();
await WyntaSDK.setIdentity({
  user_id: userId,
  fcm_token: fcmToken,
  traits: {
    email: userEmail,
    first_name: firstName,
    // ...
  },
});

// 3. On logout
WyntaSDK.clearIdentity();
```

---

## Troubleshooting

### Notifications not appearing on Android

**Check notification permission:**
```bash
adb shell dumpsys notification | grep -A2 "AppSettings: <your.package>"
```
If `importance=NONE`, the OS has blocked notifications. Fix:
```bash
adb shell pm grant <your.package> android.permission.POST_NOTIFICATIONS
adb shell appops set <your.package> POST_NOTIFICATION allow
```
On a real device, simply uninstall, reinstall, and tap **Allow** when the permission dialog appears.

**Check FCM token was passed to SDK:**  
Ensure `setIdentity({ fcm_token })` was called after `initSDK()`. Without this the Wynta backend has no token to send pushes to.

### Notifications arrive but show silently (no banner/sound)

The notification channel importance is too low. Make sure:
1. `MainApplication.kt` creates the channel with `IMPORTANCE_HIGH`
2. `AndroidManifest.xml` has the correct `default_notification_channel_id` meta-data pointing to the same channel ID

### iOS — No notifications on simulator

FCM does not deliver real push notifications to iOS simulators. Test on a physical iOS device. Make sure `GoogleService-Info.plist` is added to the Xcode project (not just the filesystem).

### `NativeMicrotasksCxx could not be found` error

This happens when the SDK and the host app each load their own copy of `react-native`. Fix by adding a `resolveRequest` interceptor to `metro.config.js` to force all React Native imports to resolve from the host app's `node_modules`:

```js
const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const sdkPath = path.resolve(__dirname, '../wynta_sdk');
const mainNodeModules = path.resolve(__dirname, 'node_modules');

const config = {
  watchFolders: [sdkPath],
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      if (
        moduleName === 'react' || moduleName === 'react-native' ||
        moduleName.startsWith('react/') || moduleName.startsWith('react-native/') ||
        moduleName === '@reduxjs/toolkit' ||
        moduleName === '@react-native-async-storage/async-storage' ||
        moduleName === '@react-native-firebase/app' ||
        moduleName === '@react-native-firebase/messaging'
      ) {
        return {
          filePath: require.resolve(moduleName, { paths: [mainNodeModules] }),
          type: 'sourceFile',
        };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
```

---

## Required Peer Dependencies

| Package | Version | Required for |
|---------|---------|--------------|
| `@react-native-firebase/app` | `^22.x` | Firebase core |
| `@react-native-firebase/messaging` | `^22.x` | FCM token + message handling |
| `@react-native-async-storage/async-storage` | `^2.x` | FCM token persistence in SDK |
