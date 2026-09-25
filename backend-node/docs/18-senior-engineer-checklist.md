# 18 — The senior-engineer checklist (what production really needs)

> Plain-language goal: the honest "would this pass a senior review today?" —
> a scored checklist of what is **already in place** vs. what a senior
> engineer / staff engineer / SRE / compliance would insist on **before** a
> serious launch.

## 1. Money correctness & data integrity — ✅ DONE

| Control | Where | Verified |
| --- | --- | --- |
| ACID transactions for every money move | `prisma.$transaction` in transfer/withdraw/savings/deposit-webhook | tests |
| Row-level locking against overspend | `SELECT … FOR UPDATE` on wallets/goals | `concurrent transfers` test |
| Double-entry ledger (append-only, debits=credits) | `ledger_entries` + `postDoubleEntry` | ledger equality test |
| Wallet = ledger account invariant | `getWalletLedgerBalance` comparison | transfer tests |
| Client idempotency keys (unique, 24h, cached responses) | `idempotency_keys` table | replay test |
| Stripe webhook dedup by event id | `webhook_events` unique `eventId` | deposit tests |
| Webhook-authoritative crediting + amount check | deposit webhook (cents match) | deposit tests |
| Withdrawal compensation on Stripe failure | refund + FAILED + ledger reversal | withdraw test |
| Money as `Decimal(12,2)`, cents to Stripe | schema + `amount * 100` | — |
| Non-negative enforce for customer accounts | `postDoubleEntry` | tests |

## 2. Security & fraud — ✅ MOSTLY DONE

| Control | Status | Gap |
| --- | --- | --- |
| bcrypt password + PIN hashing, password history | ✅ | argon2id upgrade optional |
| Short access JWT (15m) + rotating refresh token families | ✅ | CSRF token for cookie flow (Phase 6) |
| 2FA TOTP + one-time backup codes | ✅ | — |
| PIN lockout (5 strikes / 15 min) | ✅ | — |
| Rate limits (global / auth / transaction) | ✅ | fleet-wide store needed (see 17) |
| helmet, CORS allowlist, httpOnly/Secure cookies | ✅ | — |
| Encrypted PII at rest (KYC fullName) | ✅ | extend to all PII (email is fine, documents handled via storage encryption) |
| KYC tiers gate limits (BASIC/VERIFIED/PREMIUM) | ✅ | — |
| AML rules engine + ops review queue | ✅ | CRITICAL flags **auto-freeze** the account; remaining: SAR tooling, per-instrument thresholds |
| Sanctions/PEP screening | ✅ OpenSanctions (file-based), **blocking**, fail-closed in prod & on missing dataset | commercial provider adds fuzzy search + confidence scores |
| RBAC (USER/SUPPORT/ADMIN) + audit logs on admin actions | ✅ | admin MFA / session alerts |
| Private file serving for KYC docs (no public static) | ✅ | object storage + signed URLs |
| Raw-body webhook signature verification | ✅ | — |

## 3. Engineering hygiene — ✅ MOSTLY DONE

| Control | Status | Action |
| --- | --- | --- |
| TypeScript strict + clean build | ✅ `pnpm build` clean | — |
| DTO validation on the request boundary | ✅ (all new code; a few legacy controllers read raw `req.body` — backfill when touched) | — |
| 40 integration tests hitting a real DB | ✅ | add a Stripe HTTP-level mock (see 15) |
| Structured logs + request ids | ✅ pino + pino-http | ship to aggregator (Loki/OpenObserve) |
| Docker image + compose + entrypoint migration runner | ✅ | compose now also runs Prometheus + Grafana |
| **CI/CD pipeline** | ✅ `.github/workflows/ci.yml` (build → tests vs Postgres service → `docker build`); hook to a runner/deploy platform | PR preview env optional |
| Linter/formatter enforced | ⚠️ tsc only | add ESLint + Prettier with precommit hook |
| Secrets management | ⚠️ `.env` gitignored | move to secret manager in prod |
| Healthcheck endpoints | ✅ `/healthz` (liveness) + `/readyz` (DB ping) + compose healthcheck | wire `/readyz` to the platform load balancer |
| Error envelope everywhere (no stack leaks) | ✅ | — |

## 4. Observability & reliability — ✅ MOSTLY BUILT (remaining: live alerting, tracing, backup drills)

| Control | Status | Action |
| --- | --- | --- |
| Error tracking (Sentry) | ✅ `src/config/sentry.ts` — opt-in DSN (Sentry free tier / GlitchTip / self-host all accepted), error handler + process handlers wired | set the DSN, verify a first captured error, alert on 5xx spikes |
| Metrics (Prometheus) | ✅ `GET /metrics` via `@prometheus-io/client` — latency histogram + request counter (normalized route labels), runtime metrics; compose ships Prometheus + Grafana | build dashboards + alert rules (PromQL in docs/19 §4–5) |
| Tracing (OpenTelemetry) | ❌ | trace request → queue → DB (Phase 6) |
| **Alerting + incident runbook** | ⚠️ alert rules + runbooks written in docs/19 §5–6 | connect Alertmanager / Grafana Cloud alerts to a channel |
| Money reconciliation job | ✅ `scripts/reconcile-ledger.ts` + nightly GH workflow (`reconcile-nightly.yml`, 03:17 UTC) + webhook alert on drift | verify alerts land in the ops channel on a real drift |
| Backup verification | ❌ | PITR + **restore drills** quarterly (docs/19 §7) |
| Graceful shutdown | ✅ | SIGTERM/SIGINT close server + disconnect Prisma |

## 5. Compliance & business continuity — ⚠️ PARTIAL

| Control | Status | Action |
| --- | --- | --- |
| Audit log of all admin + sensitive actions | ✅ | retain; make append-only (DB trigger) |
| AML bundle (rules → flags → review → escalation → freeze) | ✅ CRITICAL auto-freezes | remaining: per-instrument rules, structuring cash-in vs cash-out |
| Retention & deletion (GDPR erasure) | ❌ | define retention for transactions/audit (legal minimums) + a deletion job for KYC docs |
| Data residency / encryption keys | ⚠️ | document region + KMS ownership |
| DR / RTO-RPO | ❌ | define RPO (e.g. 5 min PITR) and run book |

## 6. The "do this before launch" shortlist (top 7, updated for what's now in place)

1. ✅ **Nightly reconciliation** — scheduled via
   `.github/workflows/reconcile-nightly.yml` (03:17 UTC). Remaining: set
   `PROD_DATABASE_URL` + `OPS_ALERT_WEBHOOK` secrets and confirm an alert
   lands on a test drift.
2. **Set `SENTRY_DSN`** (free tier) and connect alerting — verify one captured
   error end to end.
3. **Grafana dashboards** for API health + money (docs/19 §4) — the compose
   stack is already running.
4. ✅ **Sanctions screening is real and blocking** (OpenSanctions file provider,
   fail-closed). Remaining: a weekly dataset-refresh cron and a commercial
   provider (fuzzy match/confidence scoring) before scaling.
5. **Object storage** for KYC files (single-instance local disk won't survive
   the fleet scaling from 17).
6. **Shared rate-limit store** (Valkey) the day you run more than one replica.
7. **Quarterly restore drills** from backup (define RPO/RTO first — docs/19 §7).

## 7. Signal it is "production-grade" (definition of done)

- [ ] `pnpm build && pnpm test` green in CI on every commit (40 tests).
- [ ] Two non-root replicas can run behind a load balancer against one
      Postgres with no lost/double money (proven by load test on transfers).
- [ ] A Stripe webhook replay, an idempotency replay, and a concurrent
      overdraw attack produce zero balance drift (integration tests + chaos).
- [ ] Every admin action is in `audit_logs`; every alert has a runbook link.
- [ ] A restore drill from backup succeeded within the stated RTO.
- [ ] `/healthz`, `/readyz`, `/metrics` live in the deployed environment and
      the orchestrator/load balancer uses `/readyz`.
- [ ] Nightly reconciliation is scheduled and its exit code feeds alerting.