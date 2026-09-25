# 17 — Growth, load & scalability

> Plain-language goal: how the system behaves as users grow, what scales first,
> what can't scale with naive tricks, and the concrete path from one instance
> to a horizontally scaled fleet — without breaking money correctness.

## 1. What actually constrains a fintech (read this first)

**The database is the concurrency authority — and that's by design.** Every
money movement holds a `SELECT … FOR UPDATE` row lock on the wallet(s)
involved. This is what makes concurrency *correct*, and it means:

- You **can** run many API replicas — they're stateless, and the locks live
  in Postgres, which arbitrates correctly across all instances.
- What you **can't** do is make a single wallet process unboundedly many
  transfers per second — the wallet row serializes on its lock.
- So scaling = scaling *total throughput* across many wallets, not scaling a
  single wallet's rate. For a consumer wallet app this is fine: individual
  wallets are low-frequency; the system's volume comes from many users.

## 2. The current single-instance reality (and its limits)

| Component | Today | Safe ceiling | Fix when reached |
| --- | --- | --- | --- |
| API process | 1 instance | thousands of req/s on small-to-medium load | run N replicas |
| Rate limits | **in-memory** per instance | per-instance only (a 3-replica fleet triples the effective cap) | shared store (Valkey/Redis) via `express-rate-limit` store |
| Webhooks | synchronous in-process | fine until Stripe floods or a handler stalls | queue (BullMQ + Valkey) with DLQ + retries |
| File uploads | local disk | single instance only | object storage + signed URLs |
| Postgres | 1 writer | singlewriter is correct; scale readers | replicas + pooling (below) |

## 3. The scaling staircase (in order)

### Step 1 — Run the API as N stateless replicas
One process !== one app. The service is stateless (JWT auth, no in-memory
session state), so:

```
Client ──► Load balancer (ALB / nginx / Caddy) ──► app:8000 × N replicas
                                                       │
                                                       └──► PostgreSQL (1 writer)
```

- Add a container orchestrator (ECS / Render / K8s) with **liveness**
  (`/healthz`) and **readiness** (`/readyz` includes a real `SELECT 1` or
  `prisma.$queryRaw`) probes.
- Enable **autoscaling** on CPU + P95 latency; scale down to zero is fine for
  non-request consumers (see queue, below).
- Deployment becomes: build once → migrate (`prisma migrate deploy` as a
  separate job) → rolling update.

### Step 2 — Global rate limits via a shared cache
Swap `express-rate-limit`'s default in-memory store for a Valkey/Redis store
(`rate-limit-redis` or the built-in `store: redisStore`). One line each in
`src/shared/middleware/rateLimiter.ts`; limits then apply fleet-wide.

### Step 3 — Offload webhooks & AML to a queue
Stripe webhooks + `sandboxAml` currently run inside the request handler
(synchronous acknowledgement). Under load, a slow handler blocks a worker:

- Producer: webhook controller enqueues `{ eventId, type, payload }`
  (returns `2xx` fast).
- Consumer: BullMQ worker(s) process deliveries; **exactly-once is already in
  the data model** (`webhook_events.eventId` unique + `FOR UPDATE` guards), so
  retries/dead-letters stay safe.
- AML evaluation becomes a background job too — it's already fire-and-forget.

### Step 4 — Postgres: connection pooling + read replicas
- **Pooling:** Prisma keeps a connection per instance. At 20+ replicas you'll
  exhaust Postgres connections → front with **PgBouncer** (or use Neon /
  Supabase-style serverless pooling).
- **Read replicas:** route list/query work (`GET /transactions`,
  `GET /admin/users`) to a replica via Prisma's `replicas` option; keep all
  *writes* on the primary (money stays on one writer — never split-brain a wallet).
- **Partitioning** (`ledger_entries` by month, `transactions` by user hash) is
  the far-future step; don't do it until you have data proving it's needed.

### Step 5 — Storage, caching, CDNs
- Files → **object storage** (R2/S3), keep the permission model (auth'd
  endpoint signs a short-lived URL).
- **Cache hot reads** (wallet balances are *not* cacheable — they change on
  every movement; cache *reference data*: tier limits, public user lookups).
- Assets/UI are static → CDN. The API itself: don't cache money responses.

### Step 6 — Observability to know you've "handled load"
- **Metrics:** Prometheus counters/histograms — p50/p95/p99 latency,
  error rate by code, webhook processing time, queue depth, lock-wait time.
  > The latency histogram + request counter and the `/metrics` scrape
  > endpoint (with normalized route labels) are already **live** — see
  > [19-observability-and-runbooks.md](./19-observability-and-runbooks.md)
  > for the dashboards/alerts to build on top, and the nightly
  > money-reconciliation job.
- **Tracing:** OpenTelemetry across request → queue → DB (the distributed
  trace is the only way to find a 300ms DB hop under load).
- **Logs:** already structured (pino + request ids) — ship them.

## 4. What load does to the money invariants (and why it holds)

| Attack / pattern | Effect | Guard |
| --- | --- | --- |
| Double-tap deposit/withdraw | duplicate external charges | idempotency keys (client + Stripe side) |
| Concurrent transfers on one wallet | overdraw | `FOR UPDATE` row lock inside `$transaction` |
| Stripe webhook redelivery | double credit | `webhook_events` dedup + `FOR UPDATE` + status guard |
| Replayed idempotency on commit | double-counted AML aggregates | `committed` flag skips re-evaluation |
| Many replicas battering the DB | connection exhaustion | PgBouncer + connection pooling |

**Nothing above requires weakening an invariant to scale.** Scale by adding
stateless replicas; never by moving money logic out of the DB transaction.

## 5. Cost / performance notes

- Row locks are cheap *when short*: keep Stripe HTTP calls **outside** the DB
  transaction (they are). A 500ms Stripe call inside a transaction would pin a
  wallet row for 500ms — the current design holds locks only for local SQL.
- Watch for: N+1 queries in admin list endpoints (add `include`/`findMany`
  with joins), and `count(*)` scans on `ledger_entries` (use the running
  `balanceAfter` instead of summing).

Next: the full senior-engineer checklist → [18-senior-engineer-checklist.md](./18-senior-engineer-checklist.md)