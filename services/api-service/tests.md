# api-service — Test Reference

Complete guide to the test suite: what is tested, how to run it, and how to extend it.

---

## Running tests

```bash
cd services/api-service

# Install dependencies (first time)
uv sync --extra dev

# Run all tests
uv run pytest

# Run with output
uv run pytest -v

# Run a specific file
uv run pytest tests/test_token.py -v

# Run a specific test class
uv run pytest tests/test_track.py::TestTrackRoute -v

# Run a specific test
uv run pytest tests/test_token.py::TestValidateToken::test_cache_hit_skips_mongo -v
```

---

## Test configuration

Set in `pyproject.toml`:

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"   # all async test functions run automatically, no @pytest.mark.asyncio needed
```

---

## Test structure

```
tests/
├── conftest.py          ← shared fixtures (tokens, mock Redis, mock MongoDB)
├── test_token.py        ← token validation logic
├── test_ratelimit.py    ← rate limiting counters and key format
├── test_track.py        ← POST /v1/track + EventEnvelope model
├── test_identify.py     ← POST /v1/identify
├── test_alias.py        ← POST /v1/alias
└── test_ready.py        ← GET /v1/ready
```

Total: **48 tests** across 6 files.

---

## Shared fixtures (`conftest.py`)

| Fixture | Type | What it provides |
|---|---|---|
| `live_token` | `str` | `pam_live_abc123...` — a live environment token string |
| `test_token` | `str` | `pam_test_abc123...` — a test environment token string |
| `token_hash` | `str` | SHA-256 of `live_token` |
| `cached_payload` | `str` | JSON string as stored in Redis cache |
| `mock_redis` | `AsyncMock` | Redis with `exists=0`, `get=None` (cache miss by default) |
| `mock_db` | `MagicMock` | MongoDB with `find_one` returning a valid token doc |

---

## test_token.py — Token authentication

**13 tests** covering `app/auth/token.py` and `TokenContext`.

### TestTokenContext (4 tests)

| Test | What it checks |
|---|---|
| `test_exact_scope_match` | `has_scope` returns True when scope is present |
| `test_missing_scope` | `has_scope` returns False for absent scope |
| `test_admin_satisfies_any_scope` | `admin` scope passes any `has_scope` check |
| `test_frozen` | `TokenContext` is immutable — raises on field assignment |

### TestValidateToken (9 tests)

| Test | What it checks |
|---|---|
| `test_cache_hit_skips_mongo` | Redis cache hit → returns TokenContext without querying MongoDB |
| `test_cache_miss_queries_mongo` | Redis miss → queries MongoDB, returns correct TokenContext |
| `test_cache_miss_populates_cache` | After MongoDB lookup, result is written to Redis with TTL=300s |
| `test_emergency_revoke_raises_before_cache` | Revoke key present → raises InvalidTokenError even if cache is populated |
| `test_unknown_token_raises` | MongoDB returns None → raises InvalidTokenError |
| `test_test_env_detected` | Token starting with `pam_test_` → `ctx.env == "test"` |
| `test_live_env_detected` | Token starting with `pam_live_` → `ctx.env == "live"` |
| `test_last_used_fired_on_cache_miss` | `asyncio.create_task` called once on DB path |
| `test_last_used_not_fired_on_cache_hit` | `asyncio.create_task` not called on cache hit |

---

## test_ratelimit.py — Rate limiting

**10 tests** covering `app/middleware/ratelimit.py`.

### TestIncrAndCheck (4 tests)

| Test | What it checks |
|---|---|
| `test_under_limit_passes` | Count at limit → no exception raised |
| `test_over_limit_raises_429` | Count exceeds limit → HTTPException 429 with `rate_limited` code |
| `test_expire_always_called` | `EXPIRE` is always called with 60s TTL regardless of count |
| `test_incr_and_expire_use_same_key` | Both `INCR` and `EXPIRE` operate on the same Redis key |

### TestProjectRateLimit (3 tests)

| Test | What it checks |
|---|---|
| `test_passes_under_limit` | Returns TokenContext when under limit |
| `test_key_contains_project_id` | Redis key includes `project_id` and starts with `pam:rate:proj:` |
| `test_blocks_over_limit` | Raises 429 when project counter exceeds limit |

### TestUserRateLimit (3 tests)

| Test | What it checks |
|---|---|
| `test_passes_under_limit` | No exception when under limit |
| `test_key_contains_project_and_user` | Redis key includes both `project_id` and `user_id` |
| `test_blocks_over_limit` | Raises 429 when user counter exceeds limit |

---

## test_track.py — POST /v1/track

**15 tests** split across `EventEnvelope` model validation and the route handler.

### TestEventEnvelope (7 tests)

| Test | What it checks |
|---|---|
| `test_valid_screen_viewed` | Valid `screen_viewed` event parses correctly |
| `test_unknown_event_name_raises` | Unregistered `event_name` raises `ValidationError` with "unknown_event" |
| `test_missing_required_property_raises` | Missing `screen_name` on `screen_viewed` raises `ValidationError` |
| `test_unknown_properties_are_accepted` | Extra properties pass through (forward compatibility) |
| `test_project_id_defaults_to_none` | `project_id` is not set by client — defaults to None |
| `test_purchase_completed_valid` | Full `purchase_completed` event parses correctly |
| `test_purchase_completed_missing_amount_raises` | Missing `amount` on `purchase_completed` raises `ValidationError` |

### TestTrackRoute (8 tests)

| Test | What it checks |
|---|---|
| `test_valid_batch_accepted` | Valid event → accepted=1, rejected=0, errors=[] |
| `test_invalid_event_partially_rejected` | Mixed batch → valid accepted, invalid rejected with correct index |
| `test_missing_required_field_rejected` | Missing property → rejected with `missing_required` code |
| `test_project_id_injected_from_token` | Forwarded payload carries `project_id` from token, not from request body |
| `test_received_at_set_server_side` | `received_at` in forwarded payload is within before/after bounds |
| `test_over_100_events_raises_400` | 101 events → 400 with `payload_too_large` |
| `test_producer_not_called_when_all_rejected` | `publish_events` not called if no events pass validation |
| `test_producer_failure_raises_503` | Producer exception → 503 with `internal_error` |

---

## test_identify.py — POST /v1/identify

**9 tests** covering `app/routes/identify.py`.

| Test | What it checks |
|---|---|
| `test_valid_request_returns_user_id` | 202 response contains correct `user_id` |
| `test_project_id_injected_from_token` | Forwarded payload has `project_id` from token |
| `test_received_at_set_server_side` | `received_at` present and non-null in forwarded payload |
| `test_event_id_generated` | `event_id` is server-generated UUID (36 chars) |
| `test_anonymous_id_forwarded` | `anonymous_id` from request body is forwarded as-is |
| `test_anonymous_id_optional` | Request without `anonymous_id` succeeds; forwarded as `null` |
| `test_traits_forwarded` | `traits` dict published unchanged (PII hashed downstream by event-processor) |
| `test_producer_failure_raises_503` | Producer exception → 503 with `internal_error` |
| `test_rate_limited_user_raises_429` | User counter over limit → 429 |

---

## test_alias.py — POST /v1/alias

**6 tests** covering `app/routes/alias.py`.

| Test | What it checks |
|---|---|
| `test_valid_request_returns_both_ids` | 202 response contains both `previous_user_id` and `user_id` |
| `test_project_id_injected_from_token` | Forwarded payload has `project_id` from token |
| `test_both_user_ids_published` | Both IDs present in Kafka payload |
| `test_event_id_generated` | Server-generated UUID present in published payload |
| `test_received_at_set_server_side` | `received_at` present in published payload |
| `test_producer_failure_raises_503` | Producer exception → 503 with `internal_error` |

---

## test_ready.py — GET /v1/ready

**5 tests** covering `app/routes/ready.py`.

| Test | What it checks |
|---|---|
| `test_all_healthy_returns_200` | Both Redis and Kafka ok → 200, status="ok" |
| `test_redis_down_returns_503` | Redis ping fails → 503, status="degraded", redis="unreachable" |
| `test_kafka_down_returns_503` | Kafka ping fails → 503, status="degraded", kafka="unreachable" |
| `test_both_down_returns_503` | Both fail → 503, both checks="unreachable" |
| `test_version_included` | `version` field present in all responses |

---

## Mocking strategy

All tests mock at the **dependency boundary** — Redis, MongoDB, and the Kafka producer are replaced with `AsyncMock` / `MagicMock`. No real infrastructure is needed to run the suite.

### Mock Redis pipeline

```python
redis = AsyncMock()
pipe = AsyncMock()
pipe.__aenter__ = AsyncMock(return_value=pipe)
pipe.__aexit__ = AsyncMock(return_value=False)
pipe.incr = AsyncMock()
pipe.expire = AsyncMock()
pipe.execute = AsyncMock(return_value=[1, True])  # count=1 = under limit
redis.pipeline.return_value = pipe
```

To simulate rate limit breach, set count above the limit:
```python
pipe.execute = AsyncMock(return_value=[1001, True])  # over PROJECT_LIMIT_PER_MIN
```

### Mock MongoDB

```python
collection = MagicMock()
collection.find_one = AsyncMock(return_value={"project_id": "proj_abc", "scope": ["events:write"]})
collection.update_one = AsyncMock()
db = MagicMock()
db.__getitem__.return_value = collection
```

To simulate a missing/revoked token:
```python
collection.find_one = AsyncMock(return_value=None)
```

### Mock Kafka producer

```python
producer = AsyncMock()
producer.publish_events = AsyncMock()    # success by default

# To simulate producer failure:
producer.publish_events = AsyncMock(side_effect=Exception("kafka down"))
```

---

## What is NOT tested (and why)

| Area | Reason |
|---|---|
| Full HTTP stack (headers, middleware chain) | Route functions are tested directly — HTTP-level tests would require a running app with mocked infra, adding complexity without meaningful extra coverage |
| Real Redis / MongoDB | Unit tests should not require infrastructure. Integration tests against real infra belong in a separate `tests/integration/` suite (not yet built) |
| `last_used_at` DB write result | Fire-and-forget — only that `create_task` is called is verified, not the actual MongoDB write |
| Token generation | Not part of api-service — tokens are created by a future admin/project management workflow |
| PII hashing | Hashing is event-processor's responsibility — api-service publishes traits raw |

---

## Adding a new test

1. Add the test function to the relevant file (`test_<route>.py`).
2. Use `async def` — `asyncio_mode = "auto"` handles the event loop.
3. Reuse fixtures from `conftest.py` where possible.
4. Mock at the dependency boundary — never call real Redis/Mongo/HTTP.
5. Follow the existing class grouping: `TestModelName` for model tests, `TestRouteName` for route handler tests.
