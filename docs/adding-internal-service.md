# Adding a new internal service

Steps to onboard a new service that calls PAM internal APIs (segmentation-engine, campaign-engine, etc.) using system JWT auth.

## 1. Add the service account

In `scripts/seed_service_accounts.py`, add an entry to `ACCOUNTS`:

```python
{
    "username": "your-service-name",
    "password": "change-me-your-service-name",
    "scope": ["segments:read", "campaigns:read"],  # grant only what's needed
},
```

Re-run the seed on the server:

```bash
MONGO_URL="mongodb://admin:<password>@172.31.6.243:27017/?authSource=admin" \
  /home/ubuntu/pam/.venv/bin/python /home/ubuntu/pam/scripts/seed_service_accounts.py
```

Then change the default password immediately:

```bash
MONGO_URL="mongodb://admin:<password>@172.31.6.243:27017/?authSource=admin" \
  /home/ubuntu/pam/.venv/bin/python /home/ubuntu/pam/scripts/change_service_password.py \
  --username your-service-name
```

## 2. Set the public key in the new service's .env

The public key is already on the server. Add it to the new service's `.env`:

```bash
PUB=$(awk '{printf "%s\\n", $0}' /home/ubuntu/pam-jwt-public.pem)
echo "SYSTEM_JWT_PUBLIC_KEY=\"$PUB\"" >> /home/ubuntu/pam/services/your-service/.env
```

## 3. Get a system token at runtime

The service calls auth-service once to get a JWT, then caches it for the token's lifetime (1 hour):

```bash
POST http://172.31.44.32:8006/v1/system/token
Content-Type: application/json

{ "username": "your-service-name", "password": "<password>" }
```

Response:
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

## 4. Use the token on outbound calls

Attach the JWT as a Bearer token on every internal API call:

```
Authorization: Bearer eyJ...
```

Refresh before `expires_in` seconds elapse.

## 5. Protect endpoints in the new service (if it also exposes internal APIs)

Add `SystemAuthDep` to any route that should only be called by trusted internal services:

```python
from app.dependencies import SystemAuthDep

@router.get("/internal/something")
async def my_route(ctx: SystemAuthDep) -> ...:
    # ctx.service  — name of the calling service
    # ctx.has_scope("segments:read")  — scope check
```

`SystemAuthDep` and `get_system_token_context` are already wired in `dependencies.py` for all services — just import and use.
