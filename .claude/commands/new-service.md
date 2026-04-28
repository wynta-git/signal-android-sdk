---
description: Scaffold a new Python service in services/ with the standard PAM layout
---

You are scaffolding a new service in the PAM monorepo.

Ask the user (if not provided as args):
1. **Service name** (kebab-case, e.g. `enrichment-engine`)
2. **One-line responsibility** — what does it own? What does it NOT do?
3. **Inputs** — Kafka topics consumed? HTTP endpoints? Scheduled?
4. **Outputs** — Kafka topics produced? DB writes? HTTP responses?

Then create:

```
services/<service-name>/
├── README.md              # what it is, how to run, env vars
├── CLAUDE.md              # narrow context for Claude Code
├── pyproject.toml         # uv-managed deps; depends on ../../shared
├── Dockerfile
├── app/
│   ├── __init__.py
│   ├── main.py            # FastAPI app or worker entrypoint
│   ├── config.py          # pydantic-settings
│   ├── routes/            # if HTTP service
│   ├── consumers/         # if Kafka consumer
│   └── deps.py            # DB / Kafka client wiring (use shared/)
└── tests/
    ├── __init__.py
    └── test_smoke.py
```

The service `CLAUDE.md` must include:
- Single-sentence responsibility
- Inputs and outputs (Kafka topics, HTTP endpoints, DB collections/tables)
- "This service NEVER does X" hard rules (cross-boundary protection)
- Local run command
- Test command

Update root `ARCHITECTURE.md` to add the new service to the data flow diagram and ownership table.
