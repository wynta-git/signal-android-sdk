# infra/

Infrastructure for local dev and (eventually) production deployment.

## Contents (planned)

```
infra/
├── docker-compose.yml       # Kafka, ClickHouse, MongoDB, Redis, Kafka UI
├── docker-compose.override.example.yml
├── kafka/
│   └── topics.sh            # Idempotent topic creation for non-dev
├── clickhouse/
│   └── init.sql             # First-run database creation
├── mongo/
│   └── init.js              # Replica set init, base indexes
├── seed.py                  # Seed test project + token + sample data
└── k8s/                     # (later) Kubernetes manifests / Helm chart
```

## Local stack

```bash
docker compose -f infra/docker-compose.yml up -d
```

Services exposed:

| Service | Host port | Notes |
|---|---|---|
| Kafka | 9092 | bootstrap |
| Kafka UI | 8080 | http://localhost:8080 |
| ClickHouse HTTP | 8123 | |
| ClickHouse native | 9000 | |
| MongoDB | 27017 | replica set `rs0` |
| Redis | 6379 | |

Tear down (and wipe volumes):

```bash
docker compose -f infra/docker-compose.yml down -v
```

## Production

Not in scope yet. When we get there, expected approach:

- Kafka: managed (MSK / Confluent Cloud / Aiven)
- ClickHouse: ClickHouse Cloud or self-hosted on dedicated nodes
- MongoDB: Atlas
- Redis: ElastiCache / managed
- Services: containerized, deployed to k8s. One Deployment per service.
- CI/CD: GitHub Actions building per-service images, deploying via ArgoCD or similar.

## Rules

- `docker-compose.yml` is for dev only. Production topology lives in `k8s/`.
- No secrets in this folder. Use `.env` (gitignored) or a real secret manager.
- Topic creation in production is explicit (`topics.sh` or Terraform), never auto-created.
