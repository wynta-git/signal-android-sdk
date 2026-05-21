# auth-service — Claude Code context

## One-line responsibility
Issues RS256 JWTs to trusted internal services after credential verification.

## Inputs
- HTTP (internal only) — `POST /v1/system/token` with `{username, password}`

## Outputs
- Returns a signed RS256 JWT containing `sub` (service name), `scope`, `iss`, `iat`, `exp`

## Hard rules

- NEVER expose this service to the public internet — internal network only.
- NEVER log passwords, raw credentials, or the issued JWT.
- NEVER reveal whether a username exists vs password is wrong — both are 401.
- NEVER store private key on disk — inject via `JWT_PRIVATE_KEY` env var.
- NEVER issue tokens for `status != "active"` accounts.

## Key files

- `app/routes/token.py` — POST /v1/system/token
- `app/config.py` — JWT_PRIVATE_KEY, MONGO_URL, MONGO_DB
- `../../shared/auth/system_token.py` — validate_system_jwt (used by consumer services)

## Dependencies on `shared/`

- `shared.clients.mongo` — MongoDB client setup
- `shared.auth.system_token` — SYSTEM_JWT_ISSUER, SYSTEM_JWT_ALGORITHM constants

## MongoDB collections

- `service_accounts` — `{username, password_hash (bcrypt), scope, status}`

## Key management

| Key | Where | Who uses it |
|---|---|---|
| Private key (PEM) | `JWT_PRIVATE_KEY` env var on auth-service only | auth-service (signs tokens) |
| Public key (PEM) | `SYSTEM_JWT_PUBLIC_KEY` env var on every consumer service | shared `validate_system_jwt()` |

Generate a key pair:
```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

## Local run

```bash
uv run uvicorn app.main:app --reload --port 8006
```
