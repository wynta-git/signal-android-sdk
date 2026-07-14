# Signal Android SDK — Integration Guide

This guide covers everything an Android application needs to integrate the Signal SDK: initialization, user identity, event tracking, and lifecycle events.

---

## Table of Contents

1. [Installation](#1-installation)
2. [Initialization](#2-initialization)
3. [User Identity](#3-user-identity)
   - [Anonymous (pre-login)](#31-anonymous-pre-login)
   - [After login](#32-after-login)
   - [Updating traits](#33-updating-traits)
   - [Logout](#34-logout)
4. [Event Tracking](#4-event-tracking)
5. [Automatic Lifecycle Events](#5-automatic-lifecycle-events)
6. [Full Lifecycle Example](#6-full-lifecycle-example)
7. [API Reference](#7-api-reference)
8. [ProGuard Rules](#8-proguard-rules)

---

## 1. Installation

### Maven Central (recommended)

Add to your app-level `build.gradle` or `build.gradle.kts`:

```kotlin
dependencies {
    implementation("io.github.wynta-git:signal-android-sdk:1.0.0")
}
```

No extra repository config needed — Maven Central is included by default in all modern Android projects. Check [Maven Central](https://central.sonatype.com/artifact/io.github.wynta-git/signal-android-sdk) for the latest published version number.

### Local AAR (offline / private distribution)

Copy `signalsdk-release.aar` into your project's `app/libs/` folder, then:

```kotlin
dependencies {
    implementation(files("libs/signalsdk-release.aar"))
    // Required transitive dependencies
    implementation("androidx.lifecycle:lifecycle-process:2.7.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
}
```

---

## 2. Initialization

Call `SignalSDK.initSDK()` once from your `Application.onCreate()`. Never call it from an `Activity` — you'd re-initialize on every screen.

**1. Create your Application class:**

```kotlin
// MyApplication.kt
class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        SignalSDK.initSDK(
            context = this,
            config  = SignalConfig(
                clientId     = "YOUR_CLIENT_ID",
                clientSecret = "YOUR_CLIENT_SECRET",
                debug        = BuildConfig.DEBUG  // prints logs in debug builds only
            )
        )
    }
}
```

**2. Register it in `AndroidManifest.xml`:**

```xml
<application
    android:name=".MyApplication"
    ...>
```

**What `initSDK` does:**
- Stores credentials in memory
- Creates a stable session ID for this cold launch
- Starts the `ProcessLifecycleOwner` observer for automatic foreground/background events

After `initSDK`, always call `setIdentity` to attach a user ID before tracking events.

---

## 3. User Identity

Identity tells the SDK **who is using the app**. The SDK maintains one active identity at a time. It can be anonymous (a UUID you generate) or a real player ID after login.

### 3.1 Anonymous (pre-login)

Call `setIdentity` right after `initSDK` with an anonymous UUID:

```kotlin
SignalSDK.setIdentity(
    IdentityPayload(userId = "anon-${UUID.randomUUID()}")
) { response ->
    // runs on main thread
    if (response.success) {
        // sdk_init + session_started + app_opened auto-tracked
    }
}
```

### 3.2 After login

Pass the real player ID and as many traits as available:

```kotlin
SignalSDK.setIdentity(
    IdentityPayload(
        userId = "ply_776192",
        traits = PlayerTraits(
            email            = "player@example.com",
            firstName        = "Alex",
            lastName         = "Smith",
            dateOfBirth      = "1990-04-15",
            country          = "MT",
            currency         = "EUR",
            language         = "en",
            kycStatus        = "pending",
            vipLevel         = "bronze",
            accountStatus    = "active",
            registrationDate = "2026-05-18T14:38:00.000Z",
            brandId          = "brand_01"
        )
    )
)
```

### 3.3 Updating traits

Call `setIdentity` any time to update specific traits — only include changed fields:

```kotlin
// KYC approved
SignalSDK.setIdentity(IdentityPayload(traits = PlayerTraits(kycStatus = "approved")))

// VIP upgrade
SignalSDK.setIdentity(IdentityPayload(traits = PlayerTraits(vipLevel = "gold")))

// Remove a trait
SignalSDK.setIdentity(IdentityPayload(unsetTraits = listOf("referral_code")))
```

### 3.4 Logout

```kotlin
SignalSDK.sendEvent("logout") { _ ->
    SignalSDK.clearIdentity()
    // Re-identify with a new anonymous UUID so events can still be tracked
    SignalSDK.setIdentity(IdentityPayload(userId = "anon-${UUID.randomUUID()}"))
}
```

---

## 4. Event Tracking

```kotlin
SignalSDK.sendEvent(
    eventName  = "deposit_success",
    properties = mapOf(
        "amount"         to 100,
        "currency"       to "EUR",
        "transaction_id" to "txn_abc123"
    )
) { response ->
    Log.d("Signal", "tracked: ${response.success}")
}
```

The `callback` is optional — fire and forget is fine for most events:

```kotlin
SignalSDK.sendEvent("screen_view", mapOf("screen" to "Home"))
```

### Common events

```kotlin
// Screen view
SignalSDK.sendEvent("screen_view", mapOf("screen_name" to "Home"))

// Button tap
SignalSDK.sendEvent("button_tap", mapOf("button_id" to "deposit_cta", "screen" to "Wallet"))

// Game started
SignalSDK.sendEvent("game_started", mapOf(
    "game_id"   to "slots_001",
    "game_name" to "Lucky Spin",
    "category"  to "slots"
))

// Deposit
SignalSDK.sendEvent("deposit_success", mapOf(
    "amount"         to 100,
    "currency"       to "EUR",
    "transaction_id" to "txn_abc123"
))

// Bonus claimed
SignalSDK.sendEvent("bonus_claimed", mapOf(
    "bonus_id"   to "welcome_bonus",
    "bonus_type" to "deposit_match"
))
```

---

## 5. Automatic Lifecycle Events

The SDK automatically tracks the following events — no code needed in your app:

| Event | When fired |
|---|---|
| `sdk_init` | First `setIdentity` call after `initSDK` |
| `session_started` | First `setIdentity` call after `initSDK` |
| `app_opened` | First `setIdentity` call after `initSDK` |
| `app_foreground` | App returns from background (after first `setIdentity`) |
| `app_background` | App goes to background |
| `session_ended` | App goes to background |

> `app_terminated` is **not** tracked. Android does not guarantee `onDestroy` fires before a process kill.

---

## 6. Full Lifecycle Example

```kotlin
// MyApplication.kt
class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        SignalSDK.initSDK(this, SignalConfig(
            clientId     = "YOUR_CLIENT_ID",
            clientSecret = "YOUR_CLIENT_SECRET",
            debug        = BuildConfig.DEBUG
        ))
    }
}

// MainActivity.kt (or ViewModel)
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Set anonymous identity immediately
        SignalSDK.setIdentity(IdentityPayload(userId = "anon-${UUID.randomUUID()}")) { response ->
            if (response.success) {
                SignalSDK.sendEvent("screen_view", mapOf("screen_name" to "Home"))
            }
        }
    }
}

// After login
fun onLoginSuccess(player: Player) {
    SignalSDK.setIdentity(IdentityPayload(
        userId = player.id,
        traits = PlayerTraits(
            email         = player.email,
            firstName     = player.firstName,
            country       = player.country,
            currency      = player.currency,
            accountStatus = "active"
        )
    ))
    SignalSDK.sendEvent("login_success", mapOf("method" to "email"))
}

// After logout
fun onLogout() {
    SignalSDK.sendEvent("logout")
    SignalSDK.clearIdentity()
    SignalSDK.setIdentity(IdentityPayload(userId = "anon-${UUID.randomUUID()}"))
}
```

---

## 7. API Reference

### `SignalSDK.initSDK(context, config)`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `context` | `Context` | Yes | Application context |
| `config.clientId` | `String` | Yes | Your Signal client ID |
| `config.clientSecret` | `String` | Yes | Your Signal client secret |
| `config.debug` | `Boolean` | No | Enable console logging (default: `false`) |

---

### `SignalSDK.setIdentity(payload, callback?)`

| Parameter | Type | Description |
|---|---|---|
| `payload.userId` | `String?` | Player ID or anonymous UUID |
| `payload.anonymousId` | `String?` | Pre-login anonymous ID for event stitching |
| `payload.fcmToken` | `String?` | FCM push token |
| `payload.traits` | `PlayerTraits?` | Player profile attributes |
| `payload.unsetTraits` | `List<String>?` | Trait keys to remove |
| `payload.timestamp` | `String?` | ISO-8601 — defaults to now |
| `callback` | `((SDKResponse) -> Unit)?` | Invoked on main thread |

**PlayerTraits fields:**

| Field | Type | Description |
|---|---|---|
| `email` | `String?` | Player email |
| `phone` | `String?` | Phone in E.164 format |
| `firstName` | `String?` | First name |
| `lastName` | `String?` | Last name |
| `dateOfBirth` | `String?` | `YYYY-MM-DD` |
| `country` | `String?` | ISO 3166-1 alpha-2 (e.g. `MT`) |
| `currency` | `String?` | ISO currency code (e.g. `EUR`) |
| `language` | `String?` | Language code (e.g. `en`) |
| `kycStatus` | `String?` | `pending`, `approved`, `rejected` |
| `vipLevel` | `String?` | `bronze`, `silver`, `gold`, `platinum` |
| `accountStatus` | `String?` | `active`, `suspended`, `closed` |
| `registrationDate` | `String?` | ISO-8601 datetime |
| `brandId` | `String?` | Brand/operator identifier |
| `custom` | `Map<String, Any?>` | Any additional key-value pairs |

---

### `SignalSDK.clearIdentity()`

Clears the active `userId`. Call on logout.

---

### `SignalSDK.sendEvent(eventName, properties?, callback?)`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `eventName` | `String` | Yes | Non-empty event name |
| `properties` | `Map<String, Any?>` | No | Key-value event data |
| `callback` | `((SDKResponse) -> Unit)?` | No | Invoked on main thread |

---

### `SDKResponse`

```kotlin
data class SDKResponse(
    val success: Boolean,
    val accepted: Int? = null,   // events accepted (track calls)
    val rejected: Int? = null,   // events rejected (track calls)
    val error: String? = null    // error message if success = false
)
```

---

## 8. ProGuard Rules

If you use R8/ProGuard, add these rules to your `proguard-rules.pro`:

```proguard
# Signal Android SDK
-keep class com.signalsdk.** { *; }
-keepnames class com.signalsdk.**
```

The SDK ships a `consumer-rules.pro` that applies these automatically when integrated via Gradle — manual rules are only needed for AAR integration.

---

## Notes

- **`initSDK` must be called from `Application.onCreate()`**, not from an Activity.
- **`setIdentity` must be called after `initSDK`** before any events can be tracked.
- **Events do not require login** — anonymous identity is sufficient.
- **`setIdentity` is additive** — only passed fields are updated; the rest stay unchanged.
- **The callback is always invoked on the main thread** — safe to update UI directly.
