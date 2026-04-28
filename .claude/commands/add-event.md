---
description: Scaffold a new event type across schema, models, and validators
---

You are adding a new event type to PAM. An event type touches multiple places — keep them all in sync.

Ask the user (if not provided as args):
1. **Event name** (snake_case, e.g. `purchase_completed`)
2. **Description** — when does the SDK send this?
3. **Properties** — list of `(name, type, required, description)` tuples beyond the standard envelope (`user_id`, `timestamp`, `project_id`, `event_id`).

Then make the following changes in one batch:

1. **Update `docs/event-schema.md`**
   - Add the event under "Defined events"
   - Document properties with types and required/optional
   - Note any PII fields (must be hashed before storage)

2. **Update `shared/models/events.py`**
   - Add a Pydantic v2 model class `<EventName>Properties(BaseModel)`
   - Register it in the `EVENT_REGISTRY` mapping

3. **ClickHouse migration** (if properties need dedicated columns vs JSON blob)
   - Add a migration file under `services/event-processor/migrations/`
   - Default: properties go into a `Map(String, String)` column. Only promote to dedicated columns if filtered/aggregated heavily.

4. **Tests**
   - Add a happy-path validation test in `services/event-processor/tests/test_events.py`
   - Add a missing-required-field rejection test

5. **Schema version bump**
   - If the event reuses existing properties: no bump.
   - If it adds a new required field to a shared envelope: bump major in `shared/models/events.py`.

After writing the changes, summarize:
- Files changed
- Whether this is a breaking change
- A sample valid event payload (JSON)
