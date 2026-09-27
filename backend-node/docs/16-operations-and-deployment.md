# 16 — Operations & deployment

> Plain-language goal: from fresh clone to a running, migrated API — locally,
> in Docker, and in production — including the env vars, Stripe wiring, and
> the jobs to run.

## 1. Prerequisites

- Node 22 (matches the Docker image), pnpm (`corepack enable`).
- PostgreSQL running on `localhost:5433` (dev) — or use the Docker stack below,
  which brings its own Postgres on the same host port.

## 2. Local development

```bash
pnpm install
cp .env.example .env          # fill in real values
pnpm prisma:migrate           # create/apply dev migrations
pnpm dev                      # tsx watch → http://localhost:8000
# Swagger docs: http://localhost:8000/api-docs
```

One-time for existing environments (wallets that predate the ledger):

```bash
pnpm db:backfill:ledger       # src/scripts — seeds ledger accounts + balancing entries
```

## 3. Environment variables (`.env.example` is the contract)

| Var | Purpose | Required in prod |
| --- | --- | --- |
| `DATABASE_URL` | Postgres connection | yes |
| `PORT` | listen port (8000) | yes |
| `NODE_ENV` | development / production / test | yes |
| `JWT_SECRET` | ≥32 chars — `openssl rand -base64 48` | yes |
| `JWT_ACCESS_EXPIRY`, `JWT_REFRESH_EXPIRY` | token lifetimes | yes |
| `STRIPE_PUBLIC_KEY`, `STRIPE_SECRET_KEY` | Stripe API | yes |
| `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET` | whsec_… from `stripe listen` / dashboard | yes |
| `STRIPE_CONNECT_CLIENT_ID` | Connect OAuth (ca_…) | yes |
| `CLIENT_URL`, `FRONTEND_URL` | CORS + email links | yes |
| `MAX_FILE_SIZE`, `UPLOAD_DIR` | upload limits + private storage path | yes |
| `RESEND_API_KEY`, `FROM_EMAIL` | transactional email | optional |
| `ENCRYPTION_KEY` | AES-256 key for PII at rest | yes |
| `SESSION_SECRET` | cookie signing | yes |
| `LOG_LEVEL` | pino level | no |
| `SENTRY_DSN` | error tracking — Sentry free tier / GlitchTip / self-hosted all accepted | no (blank = disabled) |
| `METRICS_ENABLED` | `true` exposes Prometheus metrics at `GET /metrics` | no (compose sets it) |

**AML/sanctions need no extra vars** — the current providers are internal
(stub) implementations.

## 4. Docker (single-host stack)

```bash
docker compose up --build
# → Postgres on host:5433, API on host:8000, migrations auto-run at boot
```

- `Dockerfile` — multi-stage: pnpm install → `prisma generate` + `tsc` build →
  slim runtime (non-root `app` user, writable `/app/uploads` volume).
- `docker-entrypoint.sh` — waits for Postgres (TCP probe, no extra CLI
  tools), runs `prisma migrate deploy`, then `exec`s the server.
- `.dockerignore` — excludes node_modules, dist, .env, tests, docs from the
  build context.
- `docker compose` also runs the **free observability stack**: Prometheus
  (:9090, scrapes `GET /metrics` — set `METRICS_ENABLED=true` in compose) and
  Grafana (:3000, auto-provisioned Prometheus datasource, admin/admin), plus a
  real app healthcheck against `/healthz`. See
  [19-observability-and-runbooks.md](./19-observability-and-runbooks.md).
- `docker compose config` validated + `docker build` verified locally.

## 5. Production deployment (what "properly" looks like)

| Concern | Recommended setup | Notes |
| --- | --- | --- |
| Postgres | **Managed DB** (RDS / Neon / Cloud SQL). Don't run the DB in the same container as the API. | Enable point-in-time recovery + automated backups |
| Migrations | Run `prisma migrate deploy` as its **own deploy step/job**, before the new API version serves traffic | Prevents N instances racing `CREATE INDEX` (Postgres handles it, but a single job is cleaner) |
| API | N replicas of the Docker image behind a load balancer (see 17) | Stateless processes; DB holds the state |
| Files (KYC) | Object storage (R2/S3) + signed URLs, not local disk | Local disk doesn't exist on other replicas |
| Stripe | Register the two HTTPS webhook endpoints, enable exactly the needed event types | Keep secrets in a secret manager |
| Secrets | Secret manager (Vault / cloud KMS) → env, never in repo | `.env` is gitignored |
| Health checks | `/healthz` (liveness) + `/readyz` (DB ping) wired to the orchestrator | Runbook: see 18 |
| Logs | Ship pino JSON to a log aggregator (CloudWatch / Loki / Datadog) | Request ids already correlate |

## 6. Data lifecycle & backfills

| Script | When |
| --- | --- |
| `prisma migrate reset --force` | ONLY on local / test. Destroys data. Never in prod. |
| `prisma migrate deploy` | Every prod deploy (idempotent). |
| `pnpm db:backfill:ledger` | Environments where wallets existed before the ledger shipped. Safe to re-run. |

## 7. Common operational gotchas (learned the hard way)

1. **Never mount `express.static` over `UPLOAD_DIR`** — it leaks KYC PII.
   Downloading is only via the authenticated `/kyc/documents/:fileName`.
2. **Webhook routes must stay above `express.json()`** — Stripe signatures are
   computed over raw bytes.
3. **Ledger raw SQL must quote camelCase columns** (`"accountId"`,
   `"balanceAfter"`); only `updated_at` is snake_case.
4. **Cents vs dollars** — Stripe amounts are integer cents; the API reports
   dollars. Compare `event.amount === Number(tx.amount) * 100`.
5. **`prisma migrate reset` in globalSetup targets `mintbank_test` only** —
   `tests/setup.ts` forces `DATABASE_URL` before imports so dev data is safe.

Next: growing under load → [17-scaling-and-load.md](./17-scaling-and-load.md)