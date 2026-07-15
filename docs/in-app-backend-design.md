# In-App Notifications — Backend Data Design

Companion to [`in-app-notifications-explained.md`](in-app-notifications-explained.md), which documents the client-facing API and content schema. This file covers how that content is stored.

Two collections are needed — one for the **authored template** (owned by campaign-engine, written by the CRM) and one for the **per-user delivered copy** (owned by notifications-engine, read by the inbox API). They're separate for the same reason push already works this way: content is *rendered once at send time* and frozen into a per-user record, so if a marketer edits the campaign later, notifications already sitting in someone's inbox don't silently change.

## 1. `notification_templates` — the authored content (campaign-engine)

One document per template, with variants nested for A/B testing (matches the builder's "+ Add Variation"):

```js
{
  _id: ObjectId,
  template_id: "tmpl_welcome_bonus",
  project_id: "proj_123",
  channel: "in_app",
  variants: [
    {
      variant_id: "var_a",
      weight: 50,                          // % split for A/B
      template_type: "modal",              // modal | popup_image | rating | fullscreen |
                                            // nudge | carousel | survey | lead_gen |
                                            // gamification | html_nudge
      render_engine: "native",             // native | html
      title: "Claim your welcome bonus, {{first_name}}!",   // unrendered, has merge tags
      body: "Make your first deposit today and get {{bonus_pct}}% match...",
      media: {
        image_url: "https://cdn.../promo.png",
        background_color: "#ffffff",
        background_opacity: "opaque"
      },
      cta: [
        { role: "primary", label: "Claim Now", action: "deep_link", value: "wynta://promotions/welcome" },
        { role: "secondary", label: "Maybe later", action: "dismiss", value: null }
      ],
      close_button_visibility: "always",
      layout: null,                         // populated per template_type — see below
      web_view_url: null                    // optional, ANY template_type — overrides native rendering with a full webview
    },
    { variant_id: "var_b", weight: 50 /* ... */ }
  ],
  created_at: ISODate,
  updated_at: ISODate
}
```

The campaign document (`campaigns` collection, owned by campaign-engine) carries a sibling top-level field `trigger_type: "on_session_start" | "on_screen_load" | "on_custom_event" | null` — distinct from the existing `trigger` field (which governs *when the backend fires the campaign*: event/scheduled/cron). `trigger_type` instead governs *when the SDK should display* an already-fetched notification. Only `on_session_start` is functionally supported this phase — the campaign-creation API rejects the other two values for `channel: "in_app"` today; they remain valid enum values so no future migration is needed once business defines `target_screens` (for `on_screen_load`) and an event-name selector (for `on_custom_event`).

`layout` is where the ten template types diverge — same document shape, different nested content depending on `template_type`:

```js
// carousel
layout: { slides: [{ image_url, title, body }, ...] }
// survey
layout: { questions: [{ question_text, options: [...] }, ...] }
// lead_gen
layout: { fields: [{ name, type, required }, ...], submit_action: { action, value } }
// gamification
layout: { game_type: "spin_wheel", segments: [{ label, value }, ...] }
// rating
layout: { max_stars: 5, prompt: "How was your experience?" }
// html_nudge (and rest of HTML Templates row)
layout: { html: "<div>...</div>" }  // or { hosted_url: "https://..." }
```

This extends the *existing* `notification_templates` collection (already used for push) — no new collection needed here, just a richer `body`/variant shape for `channel: "in_app"`.

## 2. `notification_inbox` — the per-user delivered copy (notifications-engine, new collection)

Written once per user when the campaign fires; this is what `GET /v1/notifications/inbox` reads from directly — no live template lookup at read time:

```js
{
  _id: ObjectId,
  notification_id: "notif_abc123",   // UUID, exposed to client, unique index
  project_id: "proj_123",
  user_id: "user_42",
  campaign_id: "camp_789",
  campaign_run_id: "run_456",
  send_id: "send_xyz",               // from SendJob — idempotency key, unique index
  template_id: "tmpl_welcome_bonus",
  variant_id: "var_a",               // which variant *this user* got
  template_type: "modal",
  render_engine: "native",
  title: "Claim your welcome bonus, Asha!",   // merge tags already resolved
  body: "Make your first deposit today and get 100% match...",
  media: { image_url: "...", background_color: "#ffffff", background_opacity: "opaque" },
  cta: [ { role: "primary", label: "Claim Now", action: "deep_link", value: "wynta://promotions/welcome" } ],
  close_button_visibility: "always",
  layout: null,                       // resolved layout content, same shape as template
  web_view_url: null,                 // literal passthrough from the variant, never rendered
  trigger_type: "on_session_start",   // copied from the campaign doc at send time, not from the template
  created_at: ISODate,
  expires_at: ISODate,
  read: false,
  read_at: null
}
```

**Indexes**

| Index | Purpose |
|---|---|
| `notification_id` (unique) | lookup for `read`/`delete` calls |
| `send_id` (unique) | idempotency — Kafka at-least-once delivery must not double-insert on retry |
| `(project_id, user_id, created_at desc)` | the inbox listing query, newest first |
| `(project_id, user_id, read, created_at desc)` | efficient `unread_only=true` filtering + `unread_count` |
| TTL on `created_at` (e.g. 90 days) | storage hygiene, mirrors the existing `notification_deliveries` TTL — *not* tied to `expires_at`, since `expires_at` governs UI visibility, not physical deletion |

The listing query filters `expires_at: { $gt: now } OR expires_at: null` so expired-but-not-yet-purged docs stop showing up in the inbox immediately, without needing a TTL exactly at expiry time.

**Why denormalize instead of joining against `notification_templates` at read time:** the inbox read path (api-service) would otherwise need to resolve which variant a user got *and* re-render merge tags on every fetch — both belong at send time (notifications-engine, which already has the user profile loaded), not at read time on a hot client-facing endpoint.
