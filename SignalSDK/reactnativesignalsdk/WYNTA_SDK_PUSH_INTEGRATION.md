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

First install the Wynta SDK along with the standard React Native Firebase packages:

```bash
npm install @wynta/react-native-sdk @react-native-firebase/app @react-native-firebase/messaging
```

For iOS, run `pod install` after installation to link the Firebase pods and the Wynta SDK Native Module:

```bash
cd ios && pod install && cd ..
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

### 5c. Foreground Notifications (Automated)

> **No developer action is required.**
> 
> By default, iOS and Android do not show system notification banners when the app is active in the foreground. The Wynta SDK automatically hooks into incoming notification events and forces native heads-up banners to slide down from the top of the screen:
> 
> *   **Android**: The Wynta JS layer intercepts the foreground message and instructs the native Android module to display a native high-priority heads-up banner.
> *   **iOS**: The iOS native delegate automatically allows the OS to display incoming remote notifications as a banner in the foreground.
> 
> Clicking the foreground banner will launch the app click-tracking handlers automatically.


### 5d. Handle FCM Token Refresh (Automated)

> **No developer action is required for this step.**
> FCM tokens can rotate periodically (e.g., when the app is reinstalled or when Google Play Services rotates credentials).
>
> The Wynta SDK automatically registers a token refresh listener internally. Whenever FCM generates a new token, the SDK intercepts it and registers it with the Wynta backend. You do not need to implement any refresh listeners in your code.

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

## Automatic Push Notification Event Tracking

The SDK contains native iOS and Android modules that hook into the application's push callbacks. Tap and click interactions are tracked **automatically** under the hood without requiring custom listeners in your JavaScript/TypeScript code.

### Expected Push Data Payloads
To enable automatic tracking, the custom data payload of your push notifications sent from FCM/APNs must include specific parameters.

#### 1. General Tap Interaction (`notification_opened`)
When a user clicks on the notification body/banner to launch the app:
```json
{
  "campaign_id": "camp_100",
  "campaign_name": "Weekend Deposit Boost",
  "notification_type": "promotional",
  "template_id": "tmpl_push_01"
}
```

#### 2. Specific CTA Button Click (`notification_clicked`)
When a user clicks on a custom action button within the notification tray:
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

Both scenarios are resolved, mapped, and tracked automatically.

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
const sdkPath = path.resolve(__dirname, '../reactnativesignalsdk');
const mainNodeModules = path.resolve(__dirname, 'node_modules');

const config = {
  watchFolders: [sdkPath],
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      if (
        moduleName === 'react' || moduleName === 'react-native' ||
        moduleName.startsWith('react/') || moduleName.startsWith('react-native/') ||
        moduleName === '@reduxjs/toolkit' ||
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
