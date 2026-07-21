# Notification Channels

Owned by `notifications-engine`. Each channel has a different provider, payload shape, and failure model — but the engine exposes a uniform interface to `campaign-engine`.

## Supported channels

| Channel | Providers | Provider rate limits | Notes |
|---|---|---|---|
| `push` | FCM (Android/web), APNs (iOS) | ~10k/sec per project | Token registration via SDK; one user can have multiple device tokens. |
| `email` | SendGrid (implemented); Mailgun (registered, not yet implemented); SES not yet built | per-account quota | Bounce/complaint webhooks feed the suppression list. Batched via a dedicated Kafka topic for segment/scheduled sends — see "email — provider registry" below. |
| `sms` | Twilio, MessageBird | strict per-number TPS | Expensive — be careful with rate limits and retries. |
| `webhook` | customer-defined HTTPS endpoint | customer-defined | Used by customers to integrate with their own systems. |
| `in_app` | none — no external provider, no device token | n/a | Renders once per user into `notification_inbox` (MongoDB) instead of calling a provider. Client fetches on demand via api-service. See `docs/in-app-notifications-explained.md` and `docs/in-app-backend-design.md`. |

## `in_app` — different delivery model, same pipeline shape

Unlike every other channel, `in_app` doesn't call an external provider or fan out per device token. `handle_send_job` branches to `_handle_in_app()` right after the suppression check and template/user load — it renders the assigned variant (see below) and writes a single document to `notification_inbox`, reusing the same `notification_deliveries` audit write and `DeliveryEvent` Kafka emit as every other channel so reporting doesn't need to special-case it. No `ChannelProvider` implementation exists for `in_app` — there's nothing to call.

**Variant assignment**: `notification_templates.variants[]` supports weighted A/B testing. `pick_variant()` in `notifications-engine/app/renderer.py` deterministically hashes `(campaign_id, user_id)` to pick a variant — same user always gets the same variant for a given campaign, so recurring sends stay stable, and Kafka at-least-once redelivery doesn't reshuffle anyone.

**Availability vs. visibility**: writing to `notification_inbox` only makes a notification *available* — the SDK fetches on session start (`GET /v1/notifications/inbox` via api-service) and decides when to actually show it based on `trigger_type`. There's no delivery receipt from a device the way push has one.

## Provider abstraction

Single-recipient channels (push) implement:

```python
class ChannelProvider(Protocol):
    async def send(self, recipient: Recipient, payload: RenderedPayload) -> ProviderResult: ...
```

Batch-capable channels (email; future sms/whatsapp/telegram) implement a batch-shaped
equivalent instead — `send_batch(recipients: list[EmailRecipient], subject_template,
html_template, text_template) -> BatchProviderResult`, called with 1 recipient for a
single event-triggered send or many for a grouped segment/scheduled send. There is no
separate `handle_callback` on the provider — inbound provider callbacks (SendGrid's
Event Webhook) are a batch HTTP route (`app/callbacks.py`), not a per-send provider
method, since one webhook call can report on many unrelated sends at once.

`ProviderResult`/`BatchProviderResult` include:
- `provider_msg_id` — for callback correlation
- `status` — `accepted` | `rejected`
- `error` — code + message if rejected

## `email` — provider registry

Email is not tied to one vendor. `app/providers/base.py` defines an `EmailProvider`
contract (`name`, `async def send_batch(...)`); `app/providers/email.py` is a small
registry that resolves which adapter a brand/project is configured to use
(`email_provider: "sendgrid" | "mailgun"` on `brand_settings`/`projects.settings`,
brand-level wins, defaults to `"sendgrid"` if unset so every brand configured before
this field existed keeps working unchanged) and instantiates it with the matching
credentials (`sendgrid_*` or `mailgun_*` fields — see `docs/mongodb-collections.md`).

Two adapters exist today:
- `app/providers/sendgrid.py` — `SendGridProvider`, fully implemented (see below).
- `app/providers/mailgun.py` — `MailgunProvider`, credential resolution and registry
  dispatch are fully wired, but `send_batch()` intentionally raises `NotImplementedError`
  — proves the registry actually routes to a different class per brand rather than
  always falling back to SendGrid, without pretending Mailgun sending works yet.

Adding a real new vendor: implement `EmailProvider` in a new adapter module, add a
credential-getter to `shared/clients/mongo.py` mirroring
`get_project_sendgrid_credential`, and add one entry to each dict in
`app/providers/email.py`. Note that each vendor's personalization mechanism differs
(SendGrid does its own token substitution server-side; Mailgun's `recipient-variables`
use different syntax) — an adapter is responsible for applying
`EmailRecipient.substitutions` however its own API expects, whether that's a native
feature or a manual string-replace before sending. The `-token-` convention embedded in
stored templates is PAM's own, not vendor-specific.

**Priority-ordered failover between multiple providers for one brand** (e.g. SendGrid
primary, Mailgun secondary) is not yet implemented — this registry resolves exactly one
provider per brand/project. That needs its own design layer on top of this (a list of
providers with priority, a fallback loop, and per-brand-scoped circuit breakers, since
today's breaker is keyed only by provider name globally).

### SendGrid adapter details

**Batching, and why it's split between two services**: an event-triggered campaign
(campaign-engine, reacting to a live event) always has exactly one recipient — there's
nothing to batch. A segment/scheduled campaign (scheduler-service) can target thousands
of users at once, and SendGrid supports up to ~1000 recipients (`personalizations`) in
one API call — collapsing many recipients into one call is the difference between a
10k-user segment taking 1.5-2 minutes to drain (one API call per user) versus seconds.

Grouping happens **upstream, in scheduler-service** (`run_campaign_grouped()`), not by
buffering individual messages inside notifications-engine. A campaign always has one
fixed `project_id`/`brand_id`/`template_id`, so a group formed from one campaign's
segment is always homogeneous and well-sized, regardless of how much unrelated
concurrent campaign traffic the platform is handling elsewhere — this was the deciding
factor over the alternative (an email-only Kafka topic shared across all campaigns, with
notifications-engine bucketing opportunistically per Kafka fetch), which batches well
for one big campaign but degrades as more unrelated campaigns share the same topic
concurrently. Grouped jobs (`GroupedSendJob`, carrying `user_ids: list[str]`) go to
their own topic, `pam.campaigns.send.grouped.email.v1`, consumed by a dedicated
notifications-engine consumer — completely independent of the topic/consumer push and
in_app use, so tuning one never affects the other. **No user profile lookups or
rendering happen in scheduler-service** — grouping only ever accumulates bare
`user_id`s; all personalization happens in notifications-engine, identically for both
the single-recipient and grouped paths.

**Why templates use two syntaxes**: SendGrid's `/v3/mail/send` API shares one `content`
block (subject/html/text) across every recipient in a single call — there's no way to
carry fully distinct, pre-rendered HTML per recipient in a batched call. So email
templates mix two things: normal Jinja2 (`{{ project.name }}`) for content that's the
same for the whole batch, rendered once server-side; and literal SendGrid substitution
tokens (`-user.name-`, `-ctx.cart_value-`, `-unsubscribe_url-`) for anything that varies
per recipient, which SendGrid fills in per-recipient from each personalization's
`substitutions` dict at send time. `render_email_shared()` does the former;
`build_email_substitutions()` builds the latter, per user. A template that mistakenly
uses `{{ user.name }}` (real Jinja) instead of `-user.name-` will fail to render, since
`user`/`ctx` are deliberately not part of the shared render context.

**Unsubscribe**: PAM generates and signs its own one-click unsubscribe link (HMAC,
`app/unsubscribe.py`) injected as the `-unsubscribe_url-` token — not SendGrid's native
Subscription Tracking — so the link is under our own control and lands on our own
`GET /v1/email/unsubscribe` route.

**Bounce/complaint webhook**: SendGrid's Event Webhook (`POST /v1/email/events`) is
signed with SendGrid's own ECDSA scheme (`X-Twilio-Email-Event-Webhook-Signature`/
`-Timestamp` headers) — distinct from the "Webhook security" HMAC scheme below, which
governs PAM's own *outbound* `webhook` channel, not this *inbound* one. Each event
echoes back the `custom_args` (`project_id`, `user_id`, `send_id`) set at send time, so
events correlate to a user without a reverse lookup by email address. Hard `bounce` and
`spamreport`/`unsubscribe`/`group_unsubscribe` events suppress the user; a soft bounce
(`type: blocked`) does not, since it may succeed on a later attempt.

## Templates

`notification_templates` collection holds:

```js
{
  template_id: "tmpl_cart_recovery",
  channel: "push",
  // Channel-specific fields:
  push: { title: "...", body: "Hey {{user.name}}, you left {{ctx.cart_value}}!", image_url: "..." },
  email: { subject: "...", html: "<...>", text: "..." },
  sms: { text: "..." },
  webhook: { url: "...", method: "POST", body_template: "..." }
}
```

Templates are rendered with Jinja2-style placeholders against:
- `user`: profile fields from `users` collection
- `ctx`: campaign context (triggering event properties, etc.)
- `project`: project metadata (name, support email)

Render errors mark the delivery `failed` with code `template_error`. Rendering happens once per send, server-side.

**Exception — `email`**: `user`/`ctx` are Jinja2 template variables for `push`/`sms`/
`webhook`/`in_app`, but for `email` they must instead be written as literal SendGrid
substitution tokens (`-user.name-`, `-ctx.cart_value-`) — see "email — SendGrid
implementation" above for why. Only `project` is a real Jinja2 variable in an email
template.

## Recipient resolution

Per channel:
- `push`: look up registered device tokens for `user_id` → fan out one delivery per device.
- `email`: look up `traits.email` directly on the `users` document — stored in
  plaintext, an approved exception to the PII-vault policy (see
  `notifications-engine/CLAUDE.md`). No separate PII vault exists.
- `sms`: same as email but for `phone_hash` (not yet implemented — will need the same
  plaintext-vs-vault decision email made).
- `webhook`: look up customer-configured endpoint for the project + campaign.

## Suppression

Suppression keys/records are **channel-scoped** — suppressing a user for `email` (e.g.
a hard bounce) does not suppress them for `push`, and vice versa. Per project, maintain
`suppressed_recipients` collection:
- Hard bounces (email)
- Unsubscribes
- Carrier-blocked SMS
- User-disabled push

Every send checks the suppression list first, scoped to `(project_id, user_id, channel)`.
Suppressed sends are recorded with `status: "suppressed"`.

## Retry policy

- Transient (5xx, network, 429): exponential backoff with jitter, max 5 attempts, total cap 30 min.
- Permanent (4xx other than 429): no retry.
- Provider down (circuit breaker): pause sends for the channel, alert on-call.

## Compliance

- Email: must include a one-click unsubscribe link. PAM generates and signs this itself
  (`app/unsubscribe.py`), injected as the `-unsubscribe_url-` substitution token — not
  rendered from project settings. CAN-SPAM / GDPR.
- SMS: opt-in records, STOP keyword handling.
- Push: respect OS-level notification permissions; no recourse if user denies.

## Webhook security

For `webhook` channel:
- Sign payload with HMAC-SHA256 using project-configured secret.
- Include `X-PAM-Signature`, `X-PAM-Timestamp` headers.
- Customer endpoint must respond 2xx within 10s; otherwise treated as failure.
