# In-App Notifications — Implementation Summary

Companion to `../../Documents/PROJECTS/WyntaSDK/In-App Notifications.docx`, which is the
full spec. This document covers what was actually implemented in this SDK — a deliberately
narrow slice of that spec, not the whole thing.

## Scope

On app open (cold start) or foreground-resume, check for a pending in-app notification.
If one exists, show a native popup — a single image with the CTA baked into the image
itself (the whole image is tappable), plus a close button top-right. Track viewed/read,
clicked, and dismissed.

**Not implemented** (explicitly out of scope for this version):
- The other 9 content layouts from the spec (carousel, survey, lead_gen, gamification,
  rating, html_nudge, etc.) — only the flat image+CTA shape is handled.
- Periodic polling while the app is open, and the silent-push "nudge" trigger — only the
  on-open/foreground trigger (#1 in the spec doc) is implemented.
- Pagination (`cursor`/`next_cursor`), `unread_count` badge — only the first notification
  in the response is used; the rest of the array and any pagination is ignored.
- Any host-app-visible API surface — see "Zero host-app footprint" below.

## How it works end-to-end

1. **Trigger** — fires from two places:
   - Right after the first `setIdentity()` call following `initSDK()` (cold open).
   - On every `app_foreground` transition (resume from background). `app_foreground`
     alone doesn't cover a fresh launch (no prior `background` state to transition from),
     which is why the cold-open hook exists separately.
2. **Fetch** — calls `GET /notifications/inbox` (same `X-Client-Id`/`X-Client-Secret`
   auth headers and `baseUrl` pattern as every other call in this SDK). Takes the first
   notification in the response; ignores the rest.
3. **Render — entirely native, no JS UI, no host-app changes**:
   - **Android**: a transparent, no-animation `Activity`, declared only in this SDK's own
     `AndroidManifest.xml` (merges into the host app automatically via Gradle's manifest
     merger — the same mechanism every RN native module already relies on for its own
     manifest entries). Downloads the image via plain `HttpURLConnection` +
     `BitmapFactory` — no image-loading library added.
   - **iOS**: a separate overlay `UIWindow` at `UIWindowLevelAlert + 1`, above everything
     else in the app. Downloads the image via plain `URLSession` + `UIImage` — same,
     no library added.
   - Both render the image full-bleed (the whole image is the tap target) with a
     top-right "✕" close button, and bridge interactions back to JS via a new
     `wynta_inapp_interaction` event — mirroring the existing `wynta_push_interaction`
     event already used for push-notification taps.
4. **Tap the image** → native opens the CTA's `deep_link`/`external_url` directly
   (`Intent.ACTION_VIEW` on Android, `UIApplication openURL:` on iOS), then notifies JS
   with `clicked`.
5. **Tap close** → native notifies JS with `dismissed`. No navigation.
6. **Tracking** (JS side — reuses the SDK's existing `trackEvent`/`buildEvent` pipeline,
   just triggered by the native callback instead of a UI component):
   - On `shown`: fires `in_app_notification_viewed` via the existing track endpoint,
     **and** calls `POST /notifications/read` — both together, per the spec
     ("viewed = read, fire both the moment it renders").
   - On `clicked`: fires `in_app_notification_clicked` with the CTA label.
   - On `dismissed`: fires `in_app_notification_dismissed`.

## Zero host-app footprint

This was a deliberate design requirement (matching how MoEngage/CleverTap/Braze-style
SDKs work): a consuming app gets this feature by calling `initSDK()` and `setIdentity()`
exactly as before — nothing new to import, mount, or configure. No component to render,
no new dependency in the host app's `package.json`/`build.gradle`/`Podfile`, not even
transitively (no image-loading library was added to avoid that possibility entirely).

An earlier version of this feature was built as a React Native component
(`<InAppNotificationModal />`) that the host app would have needed to mount once at its
root. That approach was abandoned in favor of the native one described above, once it was
clear "no host app changes at all" was the actual requirement.

## Files

| File | Purpose |
|---|---|
| `src/types/index.ts` | `NotificationCTA`, `InboxNotification`, `InboxResponse` |
| `src/services/NotificationInboxService.ts` | `fetchInbox()`, `markNotificationsRead()` |
| `src/store/thunks.ts` | `checkInboxThunk` — fetches the inbox, calls native `showInAppPopup` |
| `src/WyntaSDK.ts` | Listens for `wynta_inapp_interaction`, fires the 3 tracking calls |
| `src/services/LifecycleService.ts` | Triggers `checkInboxThunk` on `app_foreground` |
| `android/src/main/java/com/wyntasdk/WyntaSDKModule.kt` | `showInAppPopup` bridge method + static callback for the Activity |
| `android/src/main/java/com/wyntasdk/InAppPopupActivity.kt` | The native popup (Android) |
| `android/src/main/AndroidManifest.xml` | Declares the new Activity |
| `ios/WyntaSDK.m` | `showInAppPopup` bridge method, new event registered |
| `ios/WyntaInAppPopupWindow.h` / `.m` | The native popup (iOS) |

## Verified

- `tsc --noEmit` and `npm run build` both pass clean.
- No new dependencies anywhere, host app or transitive — confirmed by reverting
  `package.json`/`package-lock.json`/`tsconfig.json` back to their original state after
  the abandoned JS-component approach (which needed `@types/react` + a JSX compiler
  option) was replaced with the native one.

## Not yet done

- Nothing committed to git yet.
- The backend endpoints this SDK calls (`GET /notifications/inbox`,
  `POST /notifications/read`) are marked "proposed, not yet implemented" in the spec doc
  — unverified whether they exist yet to actually test against.
- No real device/simulator run yet — only compiled/type-checked, not exercised
  end-to-end.
