# In-App Notifications — How They Work

## What it is

An in-app notification is a message rendered **inside our own app's UI** (a banner, modal, or notification-center/inbox list) by our client SDK's own code. The backend's job is to make the message *available*; the app's job is to *ask for it and render it*.

There is no delivery network (like FCM/APNs) that pushes an in-app notification onto a device. The backend simply stores the notification somewhere it can be fetched from. Nothing appears on the device until the app itself calls the backend and asks "do you have anything for me?"

This means: **delivery time (when the backend makes it available) and visibility time (when the user actually sees it) are two different things.** A notification "sent" at 10:00 AM might not be seen until the user opens the app at 3:00 PM.

## How the app finds out something is waiting — 3 options

### 1. On app open / app foreground
The most common and most reliable trigger. Every time the user opens the app or brings it from background to foreground, the client SDK calls an inbox endpoint on the backend (e.g. `GET /v1/notifications/inbox`). The backend returns any unread/pending notifications, and the client renders them.

### 2. Periodic poll while the app is open
The client SDK calls the inbox endpoint on a timer (e.g. every few minutes) while the app is actively open, in addition to the on-open check. This catches notifications that become available *during* a session, not just at launch. Rarely used on its own because of battery/network cost — usually a secondary mechanism layered on top of #1.

### 3. Silent/data-only push as a "nudge"
The backend sends a push through FCM/APNs, but with no visible notification content — just a data payload (e.g. `{"type": "in_app_refresh"}`). This wakes the app's background handler and tells it "go fetch now," rather than displaying anything itself. The app then calls the backend's inbox API to get the real content and decides how to render it.

This is a hybrid approach: it *uses* the push infrastructure purely as a wake-up signal, not as the actual content channel. It's best-effort — iOS in particular is unreliable about waking a fully-killed app for silent pushes — so it's a way to make the notification visible *sooner*, not a guarantee.

## How a campaign works, end to end

Example: a campaign is scheduled to send to a segment at 10:00 AM, channel = in_app.

1. **10:00 AM — the campaign scheduler fires.** It evaluates the target segment and gets the list of matching users.
2. **A send job is queued per user**, tagged with the in_app channel, same trigger mechanism used for any other channel.
3. **The notification pipeline processes the batch** — checks suppression/opt-outs, renders the template (title, body, deep link, image, etc.) — but instead of calling a push provider, it **writes the rendered notification into a server-side inbox store** per user (e.g. `{user_id, title, body, deep_link, created_at, read: false, campaign_id}`). No push provider is contacted for this channel.
4. **At this point, nothing has reached any device.** The message just exists in the backend's inbox store, waiting.
5. **What happens next depends on user behavior, not further backend action:**
   - If the user opens or foregrounds the app shortly after 10:00 AM → the client SDK calls the inbox API (option 1 above) → backend returns the stored notification → client renders it.
   - If the user doesn't open the app until later in the day → they see it whenever they next open the app, not at 10:00 AM.
   - If a silent-push nudge (option 3) is also configured → the backend additionally fires a silent push around 10:00 AM so an already-running/backgrounded app fetches sooner — but this is an enhancement on top, not required for in-app to function at all.

The important thing for anyone scheduling a campaign on this channel to understand: **"sent at 10 AM" means "available starting at 10 AM," not "seen at 10 AM."** Unlike push, there's no delivery receipt from a device — only a record of when it was made available, and later, when the client actually fetched/read it.

## Client-facing API

**Status: implemented on the backend + portal (this document's companion PR).** SDK-side consumption of this contract is a separate, not-yet-started workstream. These are the endpoints the client SDK (APK/iOS) will call once built.

### `GET /v1/notifications/inbox`

**Query params**
| Param | Type | Default | Notes |
|---|---|---|---|
| `unread_only` | bool | `false` | filter to unread only |
| `cursor` | string | — | opaque pagination token from a previous response |
| `limit` | int | 20 | max 100 |

**Response 200**
```json
{
  "notifications": [
    {
      "notification_id": "notif_abc123",
      "campaign_id": "camp_789",
      "variant_id": "var_a",
      "template_type": "modal",
      "render_engine": "native",
      "title": "Claim your welcome bonus!",
      "body": "Make your first deposit today and get 100% match up to €200. Use code WELCOME at the cashier.",
      "media": {
        "image_url": "https://cdn.../promo.png",
        "background_color": "#ffffff",
        "background_opacity": "opaque"
      },
      "cta": [
        { "role": "primary", "label": "Claim Now", "action": "deep_link", "value": "wynta://promotions/welcome" },
        { "role": "secondary", "label": "Maybe later", "action": "dismiss", "value": null }
      ],
      "close_button_visibility": "always",
      "layout": null,
      "web_view_url": null,
      "trigger_type": "on_session_start",
      "target_screens": null,
      "target_events": null,
      "created_at": "2026-07-08T10:00:00.000Z",
      "expires_at": "2026-07-15T10:00:00.000Z",
      "read": false
    }
  ],
  "next_cursor": "opaque_token_or_null",
  "unread_count": 5
}
```

**Field reference**
- `notifications` — pending/inbox notifications for this user, newest-relevant first.
- `next_cursor` — pass back as `cursor` to fetch the next page; `null` means no more pages.
- `unread_count` — total unread count across the whole inbox, so the client can update a badge without a separate call.
- `notification_id` — unique per user-notification instance; used to reference this item in `read`/`delete` calls and tracking events.
- `campaign_id` — links back to the campaign that generated it, for attribution in campaign-stats reporting.
- `variant_id` — *new.* Identifies which A/B content variation ("+ Add Variation" in the builder) was selected for this user, so campaign-stats can break down performance per variant.
- `template_type` — *new, replaces the old flat `display_type`.* Which of the ten builder layouts this is: `modal`, `popup_image`, `rating`, `fullscreen`, `nudge`, `carousel`, `survey`, `lead_gen`, `gamification`, `html_nudge`.
- `render_engine` — *new.* `"native"` (client renders with built-in SDK components — the Native Templates row) or `"html"` (client renders inside a sandboxed webview — the HTML Templates row).
- `title` / `body` — already-rendered text (merge tags `{{first_name}}`, `{{bonus_amount}}`, `{{brand_name}}` resolved server-side). 60/200-char caps are enforced by the builder at authoring time, not by this API.
- `media.image_url` — optional visual content; `null`/omitted for text-only notifications. 600×300px / 2MB limit enforced at upload time.
- `media.background_color` — *new.* Hex string for the notification's background fill, set via the builder's colour picker.
- `media.background_opacity` — *new.* `"opaque"` | `"translucent"` | `"transparent"` — how `background_color` blends with the app screen behind it. (Only `"opaque"` was visible in the dropdown at time of writing — confirm the other options with design/eng.)
- `cta` — array of action buttons.
  - `cta[].role` — *new.* `"primary"` | `"secondary"`, mirrors the builder's Primary CTA / Secondary CTA (optional) sections and drives button emphasis.
  - `cta[].label` — button text (e.g. "Claim Now", "Maybe later").
  - `cta[].action` — `"deep_link"` | `"external_url"` | `"dismiss"` — tells the client how to interpret `value`.
  - `cta[].value` — the deep link/URL target; `null` when `action` is `"dismiss"`.
- `close_button_visibility` — *new.* Controls the explicit "X" close icon on the notification chrome, independent of the CTA buttons. Only `"always"` (visible) is confirmed from the builder screenshot — the dropdown implies other states (e.g. delayed/hidden) worth confirming.
- `layout` — *new.* `null` for the four flat templates (`modal`, `popup_image`, `fullscreen`, `nudge`) that fully use `title`/`body`/`media`/`cta`. Populated for everything else: `slides[]` for `carousel`, `questions[]` for `survey`, `fields[]` + `submit_action` for `lead_gen`, `game_type`/`segments[]` for `gamification`, `max_stars`/`prompt` for `rating`, and inline or hosted `html` for `html_nudge` and the rest of the HTML Templates row.
- `web_view_url` — *new.* Generic, top-level, independent of `template_type`. If set, the client should load this full URL in a webview instead of rendering natively — an override available on any template type, not just `html_nudge`. `null` when not used. Never has merge tags resolved into it beyond what's already literal (never Jinja-rendered server-side, to avoid template injection into a URL).
- `trigger_type` — *new.* `"on_session_start"` | `"on_screen_load"` | `"on_custom_event"` — tells the client *when* to display this already-fetched notification. All three values are functionally supported.
- `target_screens` — *new.* `string[]` | `null` — populated only when `trigger_type` is `"on_screen_load"`, e.g. `["home", "wallet"]`; the client should only display the notification when the user navigates to a screen whose name appears in this list. `null` for every other `trigger_type`. Screen names are chosen in the CRM wizard from campaign-engine's `screen_catalog` collection (`GET /projects/{project_id}/screens`, Redis-cached — see `docs/mongodb-collections.md`/`docs/redis-usage.md`), not typed as free text — there's no write API yet, so the catalog is seeded/managed directly in MongoDB. **Note:** this field is delivered by the backend but nothing on the client SDK reads or acts on it yet — SDK-side consumption (matching the current screen against this list) is a separate, not-yet-started workstream.
- `target_events` — *new.* `string[]` | `null` — populated only when `trigger_type` is `"on_custom_event"`, e.g. `["deposit_success", "first_deposit"]`; the client should display the notification the next time the user's device reports *any* event whose name appears in this list. `null` for every other `trigger_type`. Event names are chosen in the CRM wizard from the project's live event catalog, so they're guaranteed to be real event names that have occurred at least once for this project — but the campaign-creation API itself does not cross-check them against that catalog, only that at least one was provided. **Note:** same caveat as `target_screens` — this field is delivered by the backend but nothing on the client SDK reads or acts on it yet.
- `created_at` — when the backend made this notification available (i.e. when the campaign fired) — "sent at," not "seen at."
- `expires_at` — after this time the client should stop showing it, even if unread.
- `read` — whether the user has already marked it read, so the client can render unread items differently without tracking state locally.

### `GET /v1/notifications/unread-count`

**Response 200**
```json
{ "unread_count": 5 }
```

### `POST /v1/notifications/read`

**Request** — either mark specific IDs:
```json
{ "notification_ids": ["notif_abc123", "notif_def456"] }
```
or mark everything:
```json
{ "mark_all": true }
```

**Response 200**
```json
{ "updated": 2 }
```

### `DELETE /v1/notifications/{notification_id}`

**Response 204** — no body

### View / click / dismiss tracking

No new endpoint — reuses the existing `POST /v1/track` event ingestion path. New event names to register in `shared/models/events.py`:

```json
{
  "event_name": "in_app_notification_viewed",
  "properties": { "notification_id": "notif_abc123", "campaign_id": "camp_789" }
}
```
```json
{
  "event_name": "in_app_notification_clicked",
  "properties": { "notification_id": "notif_abc123", "campaign_id": "camp_789", "cta_label": "Claim Now" }
}
```

`in_app_notification_dismissed` follows the same shape.

### After the notification is shown

Once a notification is actually rendered on screen, the client makes these calls:

1. **Viewed = read.** The moment it renders, fire both, together — showing it *is* reading it, there's no separate "mark read" user action:
   ```json
   POST /v1/track
   { "event_name": "in_app_notification_viewed", "properties": { "notification_id": "notif_abc123", "campaign_id": "camp_789" } }
   ```
   ```json
   POST /v1/notifications/read
   { "notification_ids": ["notif_abc123"] }
   ```
2. **If the user taps a CTA** — fire the click event, then navigate using the `cta.action`/`cta.value` already present in the inbox payload (no extra backend call needed for the navigation itself):
   ```json
   POST /v1/track
   { "event_name": "in_app_notification_clicked", "properties": { "notification_id": "notif_abc123", "campaign_id": "camp_789", "cta_label": "Claim Now" } }
   ```
3. **If the user dismisses without acting** — fire dismissed instead of clicked:
   ```json
   POST /v1/track
   { "event_name": "in_app_notification_dismissed", "properties": { "notification_id": "notif_abc123", "campaign_id": "camp_789" } }
   ```

Viewed/read always fires on render. Clicked and dismissed are mutually exclusive outcomes that happen afterward, based on what the user does next.

### Error codes

Extends the table in [`api-contracts.md`](api-contracts.md):

| Code | Meaning |
|---|---|
| `notification_not_found` | `notification_id` doesn't exist or doesn't belong to this user |
| `invalid_cursor` | pagination cursor malformed or expired |
