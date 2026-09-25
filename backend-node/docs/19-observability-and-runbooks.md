# 19 — Observability & runbooks (production)

> Plain-language goal: the complete "how do we know production is broken and who
> fixes it at 2am" story — with a **$0 licensing cost** plan, what is already
> wired into the code, the dashboards/alerts to build, and runbooks for the
> incidents that actually happen to fintech backends.

## 1. The four pillars + the one job that matters most

| Pillar | What it answers | Tooling (all free / OSS) | Status in this repo |
| --- | --- | --- | --- |
| **Logs** | What happened, in order, with what inputs | pino structured JSON + request ids → ship to Loki/aggregator | ✅ already structured & correlated by `requestId` |
| **Errors** | What threw, where, how often | Sentry free tier / GlitchTip / self-hosted Sentry | ✅ wired (provider-agnostic DSN) |
| **Metrics** | How fast, how many, how full | Prometheus + Grafana (self-hosted OSS) | ✅ wired (`GET /metrics`) |
| **Traces** | Where the milliseconds went across request → DB → Stripe | OpenTelemetry (optional, later) | ⏳ documented, not yet instrumented |
| **Reconciliation** ⭐ | Is every wallet balance == its ledger balance? | `pnpm db:reconcile` on a nightly cron | ✅ **wired** — `.github/workflows/reconcile-nightly.yml` (03:17 UTC) + `ALERT_WEBHOOK_URL` POST on drift, exit ≠ 0 fails the run |

The reconciliation job is the most important monitor in a fintech: every other
pillar tells you the app is *sick*; reconciliation tells you *money is
wrong*. The two rarely overlap in timing.

## 2. The cost-free stack (decision table)

| Component | Free option | When to pay |
| --- | --- | --- |
| Error tracking | **Sentry Developer plan** — 5k errors + 10k transactions/month, free forever. Or **GlitchTip** (OSS, Sentry-API-compatible — self-host free, or ~$4/mo hosted). Or **self-hosted Sentry** (OSS, Docker) | When you exceed ~5k errors/mo in production — by then you have a serious problem to pay to solve |
| Metrics | **Prometheus + Grafana** — both Apache-2.0 OSS, self-host anywhere (a $6 VPS, Render, or the compose stack in this repo) | Grafana Cloud free tier (dashboards + alerts, 10k series) if you'd rather not operate |
| Logs | **Loki** (OSS) or **OpenObserve** (OSS, single binary) for full-text log search | Grafana Cloud / Better Stack free tiers |
| Uptime probes | **UptimeRobot** free tier (50 monitors) hitting `/healthz` | Paid tiers for advanced regions |
| Dashboards | **Grafana** (bundled in `docker-compose.yml`) | — |

**The `SENTRY_DSN` in `.env` accepts any of them without code changes** —
Sentry SaaS, GlitchTip, or self-hosted Sentry all speak the same protocol.
Point the DSN, restart, done.

## 3. What is already implemented (verified live)

- **`GET /healthz`** — liveness (process up, no DB dependency — so a DB outage
  doesn't cascade into orchestrators killing replicas).
- **`GET /readyz`** — readiness: pings the DB (`SELECT 1`), returns 503 when
  down. This is the endpoint load balancers should route on.
- **`GET /metrics`** (`METRICS_ENABLED=true`) — Prometheus exposition:
  - `fintech_http_request_duration_seconds` (histogram)
  - `fintech_http_requests_total` (counter)
  - labeled by `method`, `route` (**normalized**: uuids → `:uuid`, numeric ids →
    `:id`, so cardinality stays bounded), `status_code`, plus a `service`
    default label.
  - `fintech_*` runtime/process metrics (CPU, memory, event loop, GC).
- **Sentry integration** — `src/config/sentry.ts`: init (with `release`
  from `GIT_SHA` + sampling), `setupExpressErrorHandler`, and process-level
  `unhandledRejection` / `uncaughtException` capture. All no-op when the DSN is
  blank, so dev/tests stay quiet.
- **`pnpm db:reconcile`** — `scripts/reconcile-ledger.ts`: verifies the
  double-entry invariants across the whole DB. Exit 0 = clean; 1 = drift;
  2 = unreachable DB. `-- --json` for alert tooling.
- **Compose stack** — `docker compose up` now also runs **Prometheus :9090**
  (scraping the API) and **Grafana :3000** (auto-provisioned datasource,
  admin/admin), plus a real app healthcheck.

Boot verification showed: `/healthz` 200, `/readyz` 200 (db up), `/metrics`
200 with `fintech_` metrics and the `service="backend-node"` label.

## 4. Grafana dashboards to build (panels + example PromQL)

### Dashboard A — API health
| Panel | PromQL |
| --- | --- |
| Request rate | `sum(rate(fintech_http_requests_total[5m]))` |
| Error rate (5xx) | `sum(rate(fintech_http_requests_total{status_code=~"5.."}[5m])) / sum(rate(fintech_http_requests_total[5m]))` |
| P95 latency | `histogram_quantile(0.95, sum(rate(fintech_http_request_duration_seconds_bucket[5m])) by (le))` |
| Per-route latency | `histogram_quantile(0.95, sum(rate(fintech_http_request_duration_seconds_bucket{route="/api/v1/transfer"}[5m])) by (le))` |
| Busiest routes | `topk(10, sum(rate(fintech_http_requests_total[5m])) by (route))` |

### Dashboard B — Money
| Panel | PromQL / source |
| --- | --- |
| Total customer wallet balance | `sum(ledger_account_balance{type="CUSTOMER_WALLET"})` — add a gauge later, or query the DB via a periodic job |
| Reconciliation status | A `fintech_reconciliation_*` gauge exported by the cron job (drift count, last run). Until then: the runbook below |
| Freeze events / AML flags | counter from `AmlFlag` status changes (business metrics — wire `@prometheus-io/client` counters into aml.service) |

## 5. Alert rules (Prometheus / Alertmanager) — the "page someone" set

| Alert | Condition (PromQL) | Severity | Runbook |
| --- | --- | --- | --- |
| `APIHighErrorRate` | error-rate > 0.05 for 10m | P1 | §7.1 |
| `APISlow` | p95 > 1s for 10m | P2 | §7.2 |
| `DBDown` | up{job="postgres"} == 0 (or readiness probes failing) | P1 | §7.3 |
| `ReconciliationDrift` | reconcile job exits ≠ 0 (Alertmanager webhook) | **P0** | §7.4 |
| `WebhookLag` | queue depth/processing time (once webhooks move to BullMQ) | P2 | §7.5 |
| `SentryCritical` | new captured error with level error+ for 5m | P2 | §7.2 |

Keep alert volume low (P1s should be rare). Objective: every alert has a
runbook section; if it doesn't, it's not an alert yet, it's noise.

## 6. Runbooks (write these once, print them)

### 6.1 High error rate (5xx spike)
1. Grafana → error rate by route (find the outlier route).
2. Sentry → newest issues on that route; look for a deploy tag mismatch
   (`release` = GIT_SHA).
3. Check pino logs for the same `requestId` around the first failure.
4. If a money endpoint is affected: **run `pnpm db:reconcile` immediately** (a
   5xx on deposit/withdraw can surface a compensation bug).
5. Known-repeatable → roll back the last deploy (`GIT_SHA` makes this a 1-liner).

### 6.2 Slow API / single route
1. P95 per route → find the hot route.
2. Look for N+1 queries (admin list endpoints), missing index, or a Stripe
   call left *inside* a DB transaction (should never happen — locks held
   during HTTP).
3. Check DB lock wait (`pg_stat_activity` — `SELECT count(*) FROM
   pg_stat_activity WHERE state='active' AND wait_event_type='Lock'`).
4. Scale: more replicas for CPU-bound; more indexes/read replicas for DB-bound.

### 6.3 Database unreachable
1. Is Postgres up? `pg_isready`; check backups are running.
2. API is still "alive" (healthz 200) but readyz 503 → load balancer should
   stop routing; verify the LB uses `/readyz`.
3. If PITR enabled: chose a recovery point (RPO decision made in advance —
   see §7).
4. After restore: **run reconcile** — the ledger must net out even if a few
   webhooks were lost (webhooks re-deliver; idempotency makes replays safe).

### 6.4 ⭐ Money drift (reconcile exit ≠ 0) — P0, the important one
1. **Do not process new external money flows yet** — freeze deposits/withdraws
   via the admin (`/users/:id/freeze` per affected user) if a single wallet is
   wrong; a full-platform drift means stop, don't compound it.
2. `pnpm db:reconcile -- --json` → exact wallets/goals drifting with expected
   vs actual.
3. Classify:
   - `missing ledger account` → someone bypassed the ledger or backfill never
     ran → run `pnpm db:backfill:ledger`, re-reconcile (safe, idempotent).
   - `wallet.balance != ledger` → find the last `ledger_entries` for that
     wallet (`docs/05` has the SQL); post a **reversing entry** — never edit
     history.
   - `platform != -customer total` → check the last deposit/withdraw webhook
     settlement for a missing counterparty entry.
4. Write an audit log entry + postmortem. This class of incident is what the
   whole ledger exists to make *survivable*.

### 6.5 Webhook lag / Stripe replay storm
1. Confirm webhook endpoints return 2xx quickly; a 5xx makes Stripe retry
   with backoff (by design).
2. `webhook_events` dedup means redeliveries are safe.
3. If a handler crashes repeatedly on one event type → fix/dead-letter, then
   check `Transaction` PENDING rows older than X and reconcile manually.

## 7. Backups, DR, and the discipline that makes it real

| Item | Minimal production standard |
| --- | --- |
| Automated backups | Managed DB with **point-in-time recovery** (RDS/Neon/Cloud SQL) or nightly `pg_dump` + WAL archiving |
| Restore drill | **Quarterly**: restore to a scratch DB, run `pnpm db:reconcile`, verify clean. An untested backup is a wish, not a plan |
| RPO / RTO | Decide and publish: e.g. RPO 5 min (PITR), RTO 1–4 h (restore + redeploy) |
| Secrets | Secret manager → env; `GIT_SHA` injected for Sentry `release` |
| Offsite | Backups in a second region/bucket |

## 8. Next steps (ordered by value)

1. ✅ Nightly reconciliation — `.github/workflows/reconcile-nightly.yml`
   (03:17 UTC) + webhook alert on drift. Remaining: set the `PROD_DATABASE_URL`
   + `OPS_ALERT_WEBHOOK` secrets and fire a test drift to confirm delivery.
2. Set `SENTRY_DSN` (free tier — 5 minutes of work) and check a first
   captured error end to end.
3. Grafana dashboards A + B from §4 (the compose stack is already running).
4. Deploy a CI/CD pipeline (`.github/workflows/ci.yml` is written and ready).
5. Move webhook processing onto a queue so webhook volume can't stall the
   request path (BullMQ + Valkey) — then add the webhook-lag alert.
6. Add business counters (`deposits_total`, `withdrawals_total`,
   `aml_flags_total`) via the @prometheus-io/client — they're trivial once the
   scrape endpoint exists.

Next: back to the master list → [18-senior-engineer-checklist.md](./18-senior-engineer-checklist.md)