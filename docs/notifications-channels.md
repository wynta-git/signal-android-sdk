# Notification Channels

Owned by `notifications-engine`. Each channel has a different provider, payload shape, and failure model — but the engine exposes a uniform interface to `campaign-engine`.

## Supported channels

| Channel | Providers | Provider rate limits | Notes |
|---|---|---|---|
| `push` | FCM (Android/web), APNs (iOS) | ~10k/sec per project | Token registration via SDK; one user can have multiple device tokens. |
| `email` | SES, SendGrid (configurable) | per-account quota | Bounce/complaint webhooks must feed back into suppression list. |
| `sms` | Twilio, MessageBird | strict per-number TPS | Expensive — be careful with rate limits and retries. |
| `webhook` | customer-defined HTTPS endpoint | customer-defined | Used by customers to integrate with their own systems. |

## Provider abstraction

Every channel has a provider client implementing:

```python
class ChannelProvider(Protocol):
    async def send(self, recipient: Recipient, payload: RenderedTemplate) -> ProviderResult: ...
    async def handle_callback(self, raw: bytes) -> CallbackEvent | None: ...
```

`ProviderResult` includes:
- `provider_msg_id` — for callback correlation
- `status` — `accepted` | `rejected`
- `error` — code + message if rejected

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

## Recipient resolution

Per channel:
- `push`: look up registered device tokens for `user_id` → fan out one delivery per device.
- `email`: look up `email_hash` in `users`; resolve to plaintext only via project-encrypted lookup (separate PII vault, not in main DB).
- `sms`: same as email but for `phone_hash`.
- `webhook`: look up customer-configured endpoint for the project + campaign.

## Suppression

Per project, maintain `suppressed_recipients` collection:
- Hard bounces (email)
- Unsubscribes
- Carrier-blocked SMS
- User-disabled push

Every send checks suppression list first. Suppressed sends are recorded with `status: "suppressed"`.

## Retry policy

- Transient (5xx, network, 429): exponential backoff with jitter, max 5 attempts, total cap 30 min.
- Permanent (4xx other than 429): no retry.
- Provider down (circuit breaker): pause sends for the channel, alert on-call.

## Compliance

- Email: must include unsubscribe link rendered from project settings. CAN-SPAM / GDPR.
- SMS: opt-in records, STOP keyword handling.
- Push: respect OS-level notification permissions; no recourse if user denies.

## Webhook security

For `webhook` channel:
- Sign payload with HMAC-SHA256 using project-configured secret.
- Include `X-PAM-Signature`, `X-PAM-Timestamp` headers.
- Customer endpoint must respond 2xx within 10s; otherwise treated as failure.
