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

Services inside the cluster (campaign-engine → segmentation-engine, bonus-api → segmentation-engine, etc.) authenticate with **RS256 JWTs issued by `auth-service`**. Public opaque tokens never flow on internal paths.

### How it works

1. A service (e.g. `bonus-api`) calls `POST /v1/system/token` on `auth-service` with its `username` and `password`.
2. `auth-service` verifies credentials against the `service_accounts` MongoDB collection (bcrypt).
3. On success, it returns a signed RS256 JWT (`exp` = 1 hour). The caller should cache this and refresh before expiry.
4. The caller attaches the JWT as `Authorization: Bearer <token>` on internal API calls.
5. The receiving service (e.g. `segmentation-engine`) validates the JWT via `shared.auth.system_token.validate_system_jwt()` using its `SYSTEM_JWT_PUBLIC_KEY` env var.

### JWT claims

| Claim | Value |
|---|---|
| `sub` | service username (e.g. `"bonus-api"`) |
| `iss` | `"pam-auth-service"` |
| `scope` | list of permissions (e.g. `["segments:read"]`) |
| `exp` | issued-at + 3600 seconds |

### Key management

| Key | Location | Purpose |
|---|---|---|
| Private key (PEM) | `JWT_PRIVATE_KEY` on `auth-service` only | Signs tokens |
| Public key (PEM) | `SYSTEM_JWT_PUBLIC_KEY` on every consumer service | Verifies tokens |

Generate a key pair (once, store in secrets manager):
```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

### Consumer service integration

Each service that accepts system tokens has `get_system_token_context` and `SystemAuthDep` in its `dependencies.py`:

```python
from app.dependencies import SystemAuthDep

@router.get("/internal/segments")
async def list_segments(ctx: SystemAuthDep) -> ...:
    # ctx.service — caller service name
    # ctx.has_scope("segments:read") — scope check
```

### Seeding service accounts

```bash
MONGO_URL=mongodb://... uv run python scripts/seed_service_accounts.py
# --dry-run to preview without writing
```

## Don'ts

- Don't log tokens, hashes, or `Authorization` headers.
- Don't accept `project_id` in request bodies — derive it from the token.
- Don't cache token validation longer than 5 minutes.
- Don't return whether a token "doesn't exist" vs "is revoked" — both are 401.
