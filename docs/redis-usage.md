# Redis Usage

Redis is used for ephemeral state and segment membership. Most keys are caches that can be flushed safely; segment membership Sets are the primary store and will be rebuilt on the next evaluation run if lost.

## Use cases

| Purpose | Owner | Persistence ok if lost? |
|---|---|---|
| Rate limiting | api-service | yes |
| Token validation cache | api-service | yes |
| Idempotency keys (recent `event_id`s) | api-service | yes |
| Per-user campaign send dedupe | notifications-engine | yes |
| Segment membership (primary store) | segmentation-engine | rebuilt on next eval |
| Pub/Sub for real-time triggers (optional) | various | yes |

## Key naming convention

`pam:<purpose>:<scope>:<id>`

- `pam:rate:proj:{project_id}:min:{epoch_min}` — per-project per-minute counter
- `pam:rate:user:{project_id}:{user_id}:min:{epoch_min}`
- `pam:token:{token_hash}` — cached `{project_id, scope, status}`, TTL 5 min
- `pam:event_route_map` — Hash: field=`event_name`, value=JSON `["topic1","topic2"]`. Runtime index of event→fanout topics. Source of truth is `event_routes` in MongoDB. TTL 5 min; rebuilt on miss.
- `pam:dedupe:event:{event_id}` — value=`1`, TTL 24h
- `pam:campaign:sent:{campaign_id}:{user_id}` — TTL = campaign rate-limit window
- `pam:seg:{project_id}:{segment_id}:members` — **Set** of user_ids; written by segmentation-engine on every evaluation; no TTL (managed explicitly via delete + re-insert on each run)
- `pam:seg:{project_id}:{segment_id}:joined` — **Hash** of `{user_id: ISO-timestamp}`; records when each user first joined the segment; cleared together with `:members` on segment delete or full re-evaluation

## TTLs (always set them)

Every key MUST have a TTL. Forgotten TTLs fill memory and become silent bugs. If a key needs to live forever, it doesn't belong in Redis — it belongs in MongoDB.

Common TTLs:
- Rate limit windows: 60–3600 seconds
- Token cache: 300 seconds
- Idempotency: 86400 seconds (24h)
- Segment membership cache: 6 hours

## Data structures

- **Strings**: counters (`INCR`), simple cache values, idempotency markers.
- **Sets**: segment memberships (`SADD`, `SISMEMBER`).
- **Sorted sets**: time-windowed leaderboards if needed.
- **Hashes**: small structured cache (e.g. token metadata).

Avoid: very large keys (> 1MB), Lua scripts unless atomicity is critical.

## Patterns

### Rate limiting (sliding window)
```python
key = f"pam:rate:proj:{project_id}:min:{epoch_min}"
count = await redis.incr(key)
if count == 1:
    await redis.expire(key, 60)
if count > limit:
    raise RateLimitExceeded
```

### Idempotency
```python
key = f"pam:dedupe:event:{event_id}"
ok = await redis.set(key, "1", ex=86400, nx=True)
if not ok:
    return  # duplicate, drop silently
```

## Operational

- Single Redis instance fine for dev.
- Production: Redis cluster or managed (ElastiCache, MemoryStore, Upstash).
- Watch: memory usage, evicted_keys, connected_clients, slowlog.
- Eviction policy: `allkeys-lru` (everything is cache; oldest evicted first).
