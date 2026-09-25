# Fintech Backend Remediation Plan — `backend-node/`

Date: 2026-09-24
Scope: `/Users/Olaniyi/Documents/Dev/Codes/Personal/open-source/fintech-banking-app/backend-node/`
Product: Express + TypeScript + Prisma (PostgreSQL) + Stripe wallet backend.

## Verdict summary

Solid scaffolding with strong auth/security instincts, but **not production-grade for fintech**. Three critical money-correctness gaps (no tests, no real DB locking → overspend, deposit/withdraw idempotency holes) plus a public-KYC-file leak. Work through phases below in order.

Reference files that anchor every phase:

- `prisma/schema.prisma` — data model (dedupe with `prisma/schema copy.prisma`, then delete the copy).
- `src/modules/transfer/transfer.service.ts` — has the pattern to fix and copy elsewhere.
- `src/modules/deposit/deposit.service.ts` — needs the webhook-authoritative rewrite.
- `src/modules/withdraw/withdraw.service.ts` — needs atomicity + idempotency + reversal.
- `src/modules/webhook/webhook.controller.ts` — becomes the single credit/debit authority.
- `src/app.ts` — KYC static file exposure + middleware order.

---

### ✅ Done (2026-09-25 — compliance: sanctions BLOCKING, AML auto-freeze, reconcile alerting; git)

**Sanctions / PEP screening is real and BLOCKING (`src/services/sanctions.service.ts`)**
- `SANCTIONS_PROVIDER`: `sandbox` (dev/test permissive — but **fails closed in production**: approval is denied until a real provider is configured) · `opensanctions` (file-based screening of free OpenSanctions CSV exports in `SANCTIONS_DATA_DIR`, default `./data/sanctions`).
- Accent-folding name normalization + token-overlap matching + DOB-year/country filters; RFC-4180 CSV parsing (`"DOE, JOHN"`). Missing dataset ⇒ **fails closed** (deny — never fail-open). Dataset download in `data/sanctions/README.md`.
- KYC approval is **gated**: the screen runs FIRST; a hit ⇒ KYC `REJECTED`, CRITICAL `SANCTIONS_SCREEN` AML flag, account frozen, applicant notified, decision audit-logged (`KYC_REJECTED_SANCTIONS`); a clear screen promotes to VERIFIED as before.

**AML: CRITICAL ⇒ automatic freeze (`aml.service.ts` + the KYC gate)**
- Any CRITICAL rule hit (incl. sanctions screening failures) freezes the account so no further money moves until ops reviews — both on transaction evaluation and on the blocking KYC path. Policy updated in the module header.

**Reconcile alerting wired (`scripts/reconcile-ledger.ts`)**
- `ALERT_WEBHOOK_URL` env or `--alert-url <url>`: on drift the job POSTs the JSON report to the webhook before exiting 1 (a failed alert never masks the exit code).
- `.github/workflows/reconcile-nightly.yml` (repo root): nightly 03:17 UTC run against `PROD_DATABASE_URL`; drift ⇒ webhook + failed run. Secrets: `PROD_DATABASE_URL`, `OPS_ALERT_WEBHOOK`.

**Repository**
- `git init` at the monorepo root + root `.gitignore` + initial commit — the CI workflow is now real, not aspirational.

**Verified:** `pnpm run build` clean · `pnpm test` **40/40 green** (13 new sanctions tests, incl. the deny-flow integration) · `pnpm db:reconcile` still clean on the dev DB (29 wallets / 11 goals, platform in balance).

---

## Phase 1 — CRITICAL: concurrency & ledger integrity

### 1.1 Real row-level locking on balance updates

Replace the fake "lock" pattern (`tx.wallet.findUnique()` inside `$transaction` does NOT lock) with explicit `SELECT ... FOR UPDATE`, and move the balance sufficiency check **inside** the transaction, re-reading the locked row.

- `src/modules/transfer/transfer.service.ts`
  - Replace the pre-transaction `Number(sender.wallet.balance) < amount` check with a check against the *locked* sender wallet row.
  - Inside the `$transaction`, lock both wallet rows via raw SQL:
    ```ts
    const [senderLocked] = await tx.$queryRaw<WalletRow[]>`
      SELECT * FROM wallets WHERE id = ${senderWalletId} FOR UPDATE`;
    const [receiverLocked] = await tx.$queryRaw<WalletRow[]>`
      SELECT * FROM wallets WHERE id = ${receiverWalletId} FOR UPDATE`;
    ```
  - Verify `Number(senderLocked.balance) >= amount` before decrementing.
  - Idempotency check must also be inside the transaction (see 1.3).
- `src/modules/savings/savings.service.ts` (`depositToGoal`)
  - Same fix: lock wallet + goal inside the transaction, re-check balance there.
- `src/modules/withdraw/withdraw.service.ts`
  - Wrap balance check + wallet debit + transaction create + Stripe `transfers.create` in a single unit (see 1.4 — needs the payout-in-one-step decision first).

### 1.2 Double-entry ledger (new tables in `prisma/schema.prisma`)

Add an immutable append-only ledger alongside the user-facing `Transaction` table.

```prisma
model LedgerAccount {
  id        Int      @id @default(autoincrement())
  accountId String   @unique       // e.g. wallet:<walletId>, platform, fees
  type      String                 // CUSTOMER | PLATFORM | ESCROW | FEES
  createdAt DateTime @default(now())
  @@map("ledger_accounts")
}

model LedgerEntry {
  id         Int     @id @default(autoincrement())
  accountId  String
  direction  String                // CREDIT | DEBIT
  amount     Decimal @db.Decimal(12, 2)
  currency   String  @default("usd")
  balanceAfter Decimal @db.Decimal(12, 2)   // running balance snapshot
  txRef      String                // links to Transaction.reference
  createdAt  DateTime @default(now())
  @@index([accountId, createdAt])
  @@map("ledger_entries")
}
```

- Every money movement (deposit credit, transfer debit+credit, withdraw debit, refund) writes **two** ledger rows inside the same `$transaction` as the wallet update.
- `LedgerEntry` must never be updated or deleted after creation (enforce in service code; consider a DB-level rule / trigger).
- Keep `Transaction` as the user-facing record (receipts, statements) — mirror `balanceAfter` onto it optionally for simpler queries.

### 1.3 Idempotency for ALL money movement (today only transfer has it)

- `src/modules/deposit/dto/deposit.dto.ts` + `DepositService` — accept optional `idempotencyKey`, persist intent as `Transaction` with status `PENDING` and unique `externalReference = paymentIntent.id` **before** any credit. Use `IdempotencyKey` model (already exists) for the whole request.
- `src/modules/withdraw/dto/withdraw.dto.ts` + `WithdrawService` — same: idempotency key required, unique on `(userId, key)`.
- Add a unique constraint to avoid phantom duplicate PaymentIntents/Payouts: `@@unique([userId, externalReference])` on `Transaction` (nullable-safe: use a partial approach or `externalReference` non-null where money moves).

### 1.4 Withdraw atomicity (current ordering is dangerous)

Current bug: Stripe payout is created **before** the internal record; a failed DB insert means money leaves with no trace.

Decision needed: two-step (create transfer only, payout triggered by `transfer.created` webhook) vs one-step with compensation.

Recommended minimal fix in `withdraw.service.ts`:
1. Lock wallet (Phase 1.1).
2. Debit wallet + create `Transaction` (status `PENDING`, senderId=receiverId=userId) **atomically** in one `$transaction`.
3. Outside the DB transaction (best-effort), call `stripe.transfers.create` + `stripe.payouts.create`.
4. If Stripe call throws after the debit committed: create a compensating `Transaction` (FAILED) + refund credit, and alert. Variant: debit only on `payout.paid` webhook (safer, needs 1.5).

---

## Phase 2 — CRITICAL: webhook-authoritative money flow

### 2.1 `src/modules/webhook/webhook.controller.ts`

- `payment_intent.succeeded`:
  - Look up `Transaction` by `externalReference = paymentIntent.id`; only credit if `status === PENDING` (never "fallback" credit for a SUCCESSFUL row — remove the double-credit path).
  - **Verify `event.amount === tx.amount * 100` and currency** before crediting; mismatch → alert + leave PENDING (reconciliation queue).
  - Credit wallet + two ledger rows + mark transaction SUCCESSFUL in one `$transaction`.
- `payout.paid` / `payout.failed`:
  - Mark transaction SUCCESSFUL / FAILED + refund (already implemented) — wrap refund in a `$transaction` and **always** re-check status to avoid double refund.
- Add event deduplication guard: process each `event.id` once (store processed webhook event IDs).
- Return error status (5xx) + `retry` semantics when processing fails so Stripe retries; keep `2xx` only on success or verified-duplicate.

### 2.2 `src/modules/deposit/deposit.service.ts`

- Deposit flow becomes: create `PaymentIntent` (no confirm needed if 3DS/redirects are a future requirement; for cards, `confirm` stays), record `Transaction` PENDING, return client `client_secret` / payment-method confirmation result. **Never credit the wallet in the request path.**

---

## Phase 3 — HIGH: KYC document security

### 3.1 Stop serving uploads via public static route

- `src/app.ts` lines 109–112: remove the `express.static` serving of `UPLOAD_DIR`.
- Move uploads to private object storage (S3 / R2 / Cloudflare) with **signed, expiring URLs** (get from provider SDK; e.g. `getSignedUrl`).
- `src/services/fileUpload.service.ts` + `src/modules/core/fileUpload.controller.ts`: store object key, not public path; only `ADMIN`/`SUPPORT` + owner may retrieve; KYC `idImage` column stores the private key (or encrypted).

### 3.2 Access control on KYC data

- `GET /api/v1/wallet/:walletId` (`src/modules/wallet/wallet.controller.ts`) — stop exposing `kycProfile`/verification details of arbitrary wallets; return a minimal non-sensitive projection (username, verified boolean only) and rate-limit lookups.
- Add an authorization check that wallet lookups never leak email/full name/DOB.

---

## Phase 4 — HIGH: fraud controls & PIN protection

### 4.1 Transaction limits & velocity rules

Add a `TransactionLimit` config (per user tier / day / transaction, fail fast with a clear error code `TX_LIMIT_EXCEEDED`):

- Enforce inside the money-movement services (transfer, deposit, withdraw) — sum of today's successful+initiated amounts per user, plus per-transaction max.
- Tie looser limits to KYC tier (VERIFIED vs basic) as a first-class rule.

### 4.2 Transaction PIN brute-force lockout

- Track consecutive wrong-PIN attempts (`LoginAttempt`-style or new `PinAttempt` table / fields on `User`).
- Lock the PIN after 5 consecutive failures (15-min window, matches auth lockout).
- Apply in `transfer.service.ts` before `bcrypt.compare`.
- Consider requiring 2FA / device re-auth for large transfers.

---

## Phase 5 — HIGH: automated tests

`tests/` exists but is empty; no test framework is installed. Add:

- `vitest` + `supertest` (or `jest`) as devDependencies; add `test` script to `package.json`.
- **Integration tests (highest priority — money paths):**
  - Transfer: happy path, insufficient funds, concurrent transfers cannot overspend (the Phase 1 race), self-transfer, frozen accounts, wrong PIN lockout, idempotency replay returns cached response.
  - Deposit/withdraw: pending→success via webhook, double-credit prevention, refund-on-failed-payout, amount mismatch rejection.
  - Balance invariant: after any sequence, `(wallet balance) === ΣCURRENT ledger entries` for the account.
- Unit tests: DTOs, `sanitizeResponse`, `encryption`, rate-limit keying, lockout logic.
- Use a disposable test Postgres (testcontainers or a `TEST_DATABASE_URL`) + `prisma migrate reset` per suite.
- Add coverage gate (e.g. ≥80% on `src/modules/transfer`, `withdraw`, `deposit`, `webhook`).

---

## Phase 6 — MEDIUM: security hardening

- Refresh token cookie: set `httpOnly`, `Secure`, `SameSite=Lax/Strict`; confirm `refresh` reads cookie or body (not URL); add CSRF mitigation for cookie-based endpoints (`csrf` or double-submit token) since no `SameSite=None` CSRF risk should remain unaddressed.
- `POST /api/v1/auth/...` rate limiter already uses email+IP — keep; ensure username enumeration doesn't apply to wallets.
- Centralize PII redaction in `logger.middleware` (never log passwords, PINs, `twoFactorSecret`, `backupCodes`, KYC images).
- Verify `backupCodes` are only returned plaintext once at generation time.
- Consistent error responses: never leak internal errors (`error.stack` is `console.error`-only — fine), keep 500 envelope.
- Serialize money as **string cents or Decimal string** consistently everywhere (stop mixing `Number()` and raw Decimal).

---

## Phase 7 — LOW: cleanup & observability

- Delete stray files: `prisma/schema copy.prisma`, `src/services/email.service copy.ts`.
- Fix dependency drift: `@types/pino` v7 vs `pino` v10 (`package.json`).
- Remove/use `src/modules/admin/index.ts` (commented-out export).
- Replace `externalReference` generation via `Date.now()+Math.random()` (`transfer.service.ts`) with a real UUID / the idempotency key.
- Currency: make it a config constant / column, not hardcoded `"usd"` and `$` strings in notifications.
- Add metrics (prom-client), request tracing (OpenTelemetry), and error tracking (Sentry) in `app.ts` middleware.
- Move webhook processing to a queue consumer (BullMQ/Workers) with idempotent handlers + dead-letter for retries.

---

## Suggested implementation order (dependencies)

1. Phase 1 (locking) → Phase 2 (deposit/webhook rewrite) → Phase 3 (KYC storage) — fixes the money & compliance criticals first. 1.4 depends on the Phase 2 decision on payout-trigger timing.
2. Phase 5 (tests) written **alongside** Phases 1–2 (tests first / red-green) to prove the concurrency + double-credit fixes.
3. Phase 4 (fraud/PIN) can land after 1–2 without schema churn beyond the pin-attempt tracking.
4. Phases 6–7 whenever time allows.

## Open decisions for implementation agent

- Withdraw payout trigger: debit at request time (optimistic, current) vs debit only on `payout.paid` webhook (pessimistic, safer for reconciliation)?
- Introduce explicit `Platform`/`Fees` ledger accounts now, or only customer wallets (minimal double-entry)?
- What storage backend for KYC uploads: S3 vs Cloudflare R2 vs local encrypted + signed middleware?
- Are 3DS/redirect card flows in scope now (affects deposit `confirm` behavior) or cards only for MVP?

---

## Implementation status (2026-09-24, evening session)

### ✅ Done (verified: `tsc` build clean, 22/22 tests green, server boots & `/health` 200)

**Phase 1 — concurrency & ledger integrity**
- Real row locks (`SELECT … FOR UPDATE`) for transfers, savings goal deposits/withdrawals, and withdrawals; balance checks re-read the locked row inside the transaction.
- Double-entry ledger: `LedgerAccount` + `LedgerEntry` (append-only, `balanceAfter` snapshots, per-tx net-zero DEBIT/CREDIT). Every movement posts a pair: transfer (sender DEBIT → receiver CREDIT), savings (wallet ↔ goal), deposit credit (platform DEBIT → wallet CREDIT), withdrawal (wallet DEBIT → platform CREDIT), refunds reverse the pair. Migration `20260924212041_fintech_hardening`.
  - Follow-up note: ledger tables keep camelCase column names (raw SQL in `ledger.service.ts` quotes `"accountId"`). A snake_case migration for the ledger tables needs interactivity to apply here and was deliberately skipped; the quoted SQL is the source of truth.
- Idempotency: deposits & withdrawals now **require** a `uuid` idempotencyKey (DTO validation). Keys are reserved inside the money transaction (unique-constraint claim + response caching makes concurrent replays race-safe); Stripe calls pass the same key as their idempotency header. Previously-failed keys return a `OPERATION_FAILED_PREVIOUSLY` error rather than re-running.
- Withdraw atomicity: wallet debit + PENDING transaction + ledger commit first; Stripe transfer→payout second; on Stripe failure a compensating reversal refunds the wallet, marks FAILED, and reverses the ledger pair.

**Phase 2 — webhook-authoritative money flow**
- `deposit.service.ts` never credits the wallet; it records PENDING (externalReference = paymentIntent.id) and returns PENDING + optional `clientSecret` for 3DS.
- `webhook.controller.ts`:
  - `payment_intent.succeeded` credits ONLY a PENDING deposit, verifies `amount` (cents) matches, dedups via `WebhookEvent` (event id), returns 5xx without ack on failure (Stripe retries).
  - `payment_intent.payment_failed` marks the deposit FAILED.
  - `payout.paid` marks the withdrawal SUCCESSFUL; `payout.failed` refunds + reverses ledger + FAILED — both re-check status under row locks (no double refund).
  - Fixed the swallowed raw body: webhook router now mounts **before** `express.json` in `app.ts` (signature verification works — verified live).
- Idempotent **and amount-verified**: mismatch → no credit, stays PENDING, alert logged.

**Phase 3 — KYC document security**
- `app.ts` no longer serves `uploads/` statically.
- Upload returns an opaque `fileId`; `GET /api/v1/kyc/documents/:fileName` serves files only to the owner or ADMIN/SUPPORT (path-traversal guarded). `.env.example` documents it.
- `GET /wallet/:walletId` no longer leaks `fullName`/verification details — returns `{ walletId, username, verified }`.
- Backfill script `scripts/backfill-ledger.ts` seeds ledger accounts for pre-existing wallets/goals (`pnpm db:backfill:ledger`).

**Phase 4 — fraud & PIN**
- `LIMITS` config (`src/config/limits.ts`): per-tx max $10k, rolling 24h aggregate $25k (dedupes transfer pairs so each event counts once), enforced in transfer/deposit/withdraw with distinct error codes.
- PIN brute-force lockout on `User` (`pinFailedAttempts`, `pinLockedUntil`): 5 failures → 15-min lock; success resets the counter; correct PIN rejected while locked.

**Phase 5 — tests**
- Vitest + supertest installed (`pnpm test`). Disposable `fintech_test` Postgres created; `tests/globalSetup.ts` runs `prisma migrate reset --force --skip-seed` against `TEST_DATABASE_URL`.
- Suites: transfer integration (locking/overspend race, KYC gate, idempotency, PIN lockout, limits), deposit integration (PENDING + webhook credit exactly-once + mismatch + route via raw body), withdraw integration (atomic debit, compensation, payout.paid/failed), DTO unit tests. 22 tests, all green.

### 🟡 Decisions taken (resolved open questions)
- Withdraw: **optimistic debit at request time** with compensating reversal (kept; the pessimistic webhook-only debit is documented as a future hardening step).
- Ledger: minimal double-entry with a single `platform` house account (customer wallets + savings goals + platform). No fees/escrow accounts yet.
- KYC storage: **local private + authenticated endpoint** for now (no cloud creds required); S3/R2 + signed URLs remain the production target.
- 3DS: `automatic_payment_methods.allow_redirects: "never"` with client_secret passthrough — cards are the MVP scope, redirects are handled but discouraged.

### ⏳ Remaining (needs a human/ops or a future session)
- **Frontend contract changes**: deposits now return `status: "PENDING"` + `depositId` (poll transaction status until SUCCESSFUL instead of assuming instant credit); withdraw requires a client-generated `idempotencyKey`; upload returns `fileId` (not URL) consumed by KYC create.
- Set real `STRIPE_WEBHOOK_SECRET` / `STRIPE_CONNECT_WEBHOOK_SECRET` and register the endpoints (currently blank).
- Run `pnpm db:backfill:ledger` in any environment that had wallet balances before this deployment.
- Phase 6 (refresh-cookie hardening, CSRF, PII redaction audit, decimal-string serialization) and Phase 7 (metrics/tracing/Sentry, webhook queue consumer) not yet started.
- `.env.example` recreated with the full validated config (was empty).

### ✅ Done (2026-09-24, late session — tiers/AML, swagger, docs, Docker)

**Fraud controls upgraded to tier-based (supersedes the Phase 4 flat limits)**
- `AccountTier` enum (BASIC/VERIFIED/PREMIUM) on `users`; `src/config/limits.ts` now holds `LIMITS_BY_TIER` (BASIC $1k/$5k, VERIFIED $10k/$25k, PREMIUM $50k/$150k per-tx/daily) + `getLimitsForTier()`; `limits.service.ts` is tier-aware (fetches the caller's tier per request). KYC approve auto-promotes to VERIFIED; ops can promote/demote via the admin endpoint.
- Admin: `PUT /api/v1/admin/users/:userId/tier` (`ChangeTierSchema` — tier + reason), audit-logged.

**AML (real working code, flag-only MVP — never blocks money movement)**
- `src/services/aml.service.ts` rules engine + `sandboxAml` (fire-and-forget, guarded by a `committed` flag so idempotency replays never double-count aggregates): `LARGE_SINGLE_TX`, `VELOCITY_24H`, `STRUCTURING_24H`, `NEW_ACCOUNT_MOVES`, `ROUND_AMOUNT`.
- Wired into transfer (post-commit), withdraw (post-debit), deposit credit (webhook). Writes `AmlFlag` rows (severity LOW→CRITICAL, status OPEN/UNDER_REVIEW/DISMISSED/ESCALATED).
- `src/services/sanctions.service.ts` — sanctions/PEP screening: real + BLOCKING since 2026-09-25 (see the compliance-pass section at the top).
- `AmlFlag` model + migration `20260924214615_aml_tiers`; admin module `aml.controller`/`aml.service` + routes `GET /admin/aml/summary`, `GET /admin/aml/flags`, `GET /admin/aml/flags/:flagId`, `POST /admin/aml/flags/:flagId/review` — every review is audit-logged.

**Swagger brought up to date (`src/config/swagger.ts` v2.0.0)**
- Tags, `components.schemas` (AccountTier, IdempotencyKey, AmlFlag, ErrorEnvelope), richer module descriptions; per-route JSDoc refreshed for deposit (PENDING + depositId + required idempotencyKey), withdraw (required key + 502), KYC documents, `POST /upload`, admin AML + tier endpoints. Wallet lookup surfaced `tier`/`isFrozen` on `GET /api/v1/wallet` (frontend can show limits + freeze state).

**Docs & Docker**
- `docs/` — 18 numbered files (README index + 01-architecture end-to-end with pros/cons/why → 18-senior-engineer-checklist). Root `backend-node/README.md` rewritten to anchor them.
- Docker: multi-stage `Dockerfile`, `docker-entrypoint.sh` (waits for DB → `prisma migrate deploy` → exec server), `docker-compose.yml` (Postgres 16 + app, healthcheck, volumes), `.dockerignore`. Image build verified; container smoke-tested end to end against a real Postgres (migrations apply, server boots, `/api-docs` + auth 401 work).
- Fixed a latent pnpm-isolation build bug: webhook routes imported transitive `body-parser` (not hoisted in a fresh install) — now uses Express 5's built-in typed `express.raw()`.
- Fixed invalid `.env.example` values that fail the boot-time zod validation: `JWT_SECRET` placeholder now ≥32 chars; `FROM_EMAIL` must be a plain email (was `"Acme <…>"` display-name form).
- Test helper `createUser` now mirrors the KYC→tier model (`kycVerified: true` ⇒ VERIFIED tier); `resetDatabase` clears `aml_flags` first (children-first before `user.deleteMany`).

**Verified:** `pnpm run build` clean · `pnpm test` 22/22 green · `docker compose config` valid · `docker build` + container smoke test pass.

### ⏳ Remaining (as of end of session)
- **Frontend contract changes** (unchanged): deposits return `PENDING` + `depositId` (poll status); withdraw requires `idempotencyKey`; upload returns `fileId`.
- Set real Stripe webhook secrets + register endpoints; run `pnpm db:backfill:ledger` on pre-ledger environments (done for the local dev DB during this session).
- Phase 6 hardening not yet started: CSRF for the cookie refresh flow, PII redaction audit, decimal-string serialization consistency.
- Phase 7 leftovers: OpenTelemetry tracing, wiring alerting to a real channel (Alertmanager/Grafana), object storage for KYC files, shared rate-limit store (Valkey) before running >1 replica, webhook queue consumer, quarterly restore drills. (Full list in `docs/18-senior-engineer-checklist.md`.)

### ✅ Done (2026-09-24, late session — production observability + free stack)

**Health & readiness (`src/modules/health/health.routes.ts`)**
- `GET /healthz` — liveness (process up, no DB dependency) + `GET /health` legacy alias.
- `GET /readyz` — readiness: DB `SELECT 1` → 200/503. Mounted outside `apiLimiter` so they stay reachable under load.

**Prometheus metrics (`src/shared/middleware/metrics.middleware.ts`, official `@prometheus-io/client@0.16.1`, not the deprecated prom-client)**
- Opt-in `METRICS_ENABLED` (default false). `GET /metrics` exposes `fintech_http_request_duration_seconds` (histogram) + `fintech_http_requests_total` (counter) labeled method / **normalized route** (uuid→`:uuid`, digits→`:id` — bounded cardinality) / status_code, plus a `service="backend-node"` default label and `fintech_*` runtime metrics.
- `docker-compose.yml` now runs the **free OSS stack**: Prometheus (:9090, scrapes `app:8000/metrics`) + Grafana (:3000, auto-provisioned datasource), app healthcheck against `/healthz`, `METRICS_ENABLED=true`.

**Error tracking (`src/config/sentry.ts`, `@sentry/node@11`)**
- Provider-agnostic `SENTRY_DSN` — accepts **Sentry free tier / GlitchTip / self-hosted Sentry** (all Sentry-protocol): `setupExpressErrorHandler`, release from `GIT_SHA`, sampling, process-level `unhandledRejection`/`uncaughtException`. All no-op when DSN blank (dev/tests quiet).

**Nightly money reconciliation (`scripts/reconcile-ledger.ts` → `pnpm db:reconcile`)**
- Proves the double-entry invariant DB-wide: wallets & goals vs their ledger accounts, and the platform house account == −(sum customer funds). Exit 0 clean / 1 drift / 2 unreachable; `-- --json` for alert tooling.
- `scripts/backfill-ledger.ts` extended to also seed the platform house account when missing (never clobbers a live ledger). **Proven end-to-end against the local dev DB: found real drift (11 goals + missing platform), backfill remediated, reconcile went clean (29 wallets / 11 goals, platform in balance).**

**CI (`/Users/…/fintech-banking-app/.github/workflows/ci.yml`, repo root):** pnpm 11.17.0 + Node 22, Postgres 16 service, `prisma generate` → `build` → 40 tests → `db:reconcile` sanity → `docker build` + runtime check. Repo is git-initialized; nightly reconcile workflow (`.github/workflows/reconcile-nightly.yml`, 03:17 UTC) alerts on drift via `OPS_ALERT_WEBHOOK`.

**Docs:** `docs/19-observability-and-runbooks.md` (free-stack decision table, dashboards with PromQL, alert rules, runbooks incl. the money-drift P0, DR/backup drills); index + docs/16 env & compose + docs/18 checklist + docs/03 lifecycle updated to match.

**Verified:** `pnpm run build` clean · `pnpm test` **27/27 green** (5 new health/metrics tests) · reconcile detected → backfilled → clean · live boot check: `/healthz` 200, `/readyz` 200 (db up), `/metrics` 200 with `fintech_` metrics.