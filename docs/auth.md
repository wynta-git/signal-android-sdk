# Authentication

`api-service` is the only service exposed to the public internet and the only one that authenticates client traffic.

## Token format

`pam_<env>_<random32>`

- `env`: `live` or `test`. Test tokens hit a separate ClickHouse database (`pam_test`) so test data doesn't pollute production analytics.
- `random32`: 32-char URL-safe random.

Examples:
- `pam_live_a7Hk3...`
- `pam_test_zP0r2...`

## Storage

Tokens are **never stored in plaintext**. Storage flow:

1. On creation, generate a random token.
2. Hash with SHA-256.
3. Store `{ project_id, token_hash, scope, status }` in `tokens` collection.
4. Show plaintext to the user once; never again.

## Validation flow (per request)

1. Extract `Authorization: Bearer <token>`.
2. Compute `token_hash = sha256(token)`.
3. Check Redis cache `pam:token:<token_hash>` (TTL 5 min).
4. On cache miss: query `tokens` collection. Cache result.
5. Reject if: token not found, status != `active`, project disabled, scope insufficient.
6. Attach `project_id` to request context — downstream handlers use it, not anything from the request body.

## Scopes

| Scope | Allows |
|---|---|
| `events:write` | `/track`, `/identify`, `/alias` |
| `admin` | All event endpoints + project management |
| `read` | Future: query API |

## Rotation and revocation

- Rotate: create a new token, switch SDK config, revoke old after grace period.
- Revoke: set `status: "revoked"` in `tokens` and **delete** the cached entry from Redis. Active sessions fail on next request.
- Emergency revoke: write `pam:token:<hash>:revoked` flag in Redis with 24h TTL, checked before cache.

## Multi-tenant isolation

Every DB query in every service must filter by `project_id`. The `project_id` comes from the validated token, never from the request body. This is the single most important rule for tenant isolation — break it and one tenant can read another's data.

## Internal service-to-service auth

Services inside the cluster (campaign-engine → segmentation-engine, etc.) authenticate with mTLS or shared service-to-service JWTs. **No public tokens flow internally.** Internal calls do not pass through `api-service`'s public endpoint.

## Don'ts

- Don't log tokens, hashes, or `Authorization` headers.
- Don't accept `project_id` in request bodies — derive it from the token.
- Don't cache token validation longer than 5 minutes.
- Don't return whether a token "doesn't exist" vs "is revoked" — both are 401.
