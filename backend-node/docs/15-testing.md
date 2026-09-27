# 15 — Testing (how the money invariants are proven)

> Plain-language goal: understand what the 40 tests cover, how they get a clean
> database, and why "tests pass" actually means something for money code.

## 1. The stack

**Vitest + supertest** run against the **real app** (`src/app.ts`) and a **real
PostgreSQL** database (`mintbank_test`). No mocks for the money paths — the
tests exercise the actual SQL, row locks, ledger writes, and webhook handlers.

Run them:

```bash
pnpm test            # full suite (serial, sees-consistent DB)
pnpm exec vitest run tests/deposit.integration.test.ts   # one file
```

## 2. How a clean database is guaranteed

| File | Job |
| --- | --- |
| `tests/globalSetup.ts` | Runs `prisma migrate reset --force --skip-seed` against `mintbank_test` before every run — **applies the real migrations**, so the schema is always current, then wipes data. |
| `tests/setup.ts` | Sets `DATABASE_URL` to the test DB **before any src import** (comment explains why: `dotenv` never overrides an already-set var, so the dev database is never touched). Also seeds stub webhook secrets. |
| `tests/helpers.ts` | `resetDatabase()` wipes every table **children-first** (now including `aml_flags` — the AML table FK otherwise blocks `user.deleteMany()`). `createUser()` provisions a user, wallet, KYC (optional), stripe account, PIN, and sets `tier: VERIFIED` when `kycVerified: true` — mirroring the KYC-driven tier model. |

`vitest.config.ts` sets `fileParallelism: false` — suites run serially on one
shared DB so state is deterministic.

## 3. What the suites prove

### `transfer.integration.test.ts` (8 tests) — the money-critical file
- **Real transfer + double-entry ledger balance equality** — asserts
  `wallets.balance` equals the ledger account balance after the move (the
  reconciliation invariant).
- **No double-spend under concurrency** — two parallel `60-of-100` requests;
  exactly one succeeds.
- **KYC gate** — unverified users blocked.
- **Idempotency replay** — same key → same response, balance unchanged.
- **PIN lockout** — 5 wrong tries → locked; successful transfer resets.
- **Self-transfer rejection**, and the **rolling daily aggregate limit**.

### `deposit.integration.test.ts` (6 tests)
- PENDING record + PaymentIntent; webhook-authoritative crediting with
  signature verification (**raw body**); event deduplication; amount-mismatch
  leaves the deposit PENDING; `payment_failed` marks FAILED; idempotency key
  required by the DTO.

### `withdraw.integration.test.ts` (5 tests)
- Atomic debit + PENDING; **compensation when Stripe fails** (mock Stripe
  throws → wallet refunded, transaction FAILED); refund on `payout.failed`
  webhook; SUCCESSFUL on `payout.paid`; idempotency key + Connect onboarding
  required.

### `dto/*.test.ts` (3 tests)
- Validation unit tests: required fields, uuid format for idempotency keys,
  positive amounts, and the new admin DTOs (`ReviewAmlFlagSchema`,
  `ChangeTierSchema`).

### `health.integration.test.ts` (5 tests)
- `/healthz` (liveness, no DB) + `/health` legacy alias; `/readyz` pings the
  DB (`SELECT 1` → 200; 503 when down); `/metrics` is a 404 when
  `METRICS_ENABLED` is off; `normalizeRoute` collapses uuids → `:uuid` and
  numeric ids → `:id` so Prometheus label cardinality stays bounded.

### `sanctions.integration.test.ts` (13 tests)
- Unit level: accent-folding name normalization, CSV parsing with quoted
  commas (`"DOE, JOHN"`), token-overlap matching, DOB-year + country filters.
- Provider behavior: sandbox clears in dev/test but **fails closed in
  production**; OpenSanctions **blocks on a name match**, clears on none, and
  **fails closed when the dataset is missing** (never fail-open).
- The flagship: `approveKYC` **denies** on a screening hit — KYC → `REJECTED`,
  CRITICAL `SANCTIONS_SCREEN` flag written, account frozen, tier never
  promoted, decision audit-logged — and approves normally when it clears.

**Total: 40 tests, all green** (verified after the 2026-09-25 compliance pass).

## 4. Why this is the right level of testing

- **Integration over unit for money.** A mocked service can "pass" while the
  real SQL deadlocks or double credits. These tests hit the real DB.
- **Deterministic** via serial execution + clean schema + stub Stripe keys.
- **Fast** enough (~7s) to run in CI on every push.

## 5. Gaps to close (roadmap)

| Gap | Why it matters |
| --- | --- |
| Deposit/withdraw's Stripe calls are stubbed in tests | Fine for now, but an **HTTP-level mock** (`nock`/`msw`) of Stripe responses would cover charge-decline mapping end to end |
| No `aml.service` unit tests | The rules engine (velocity, structuring) deserves table-driven unit tests |
| No load/soak tests | Add `autocannon`/`k6` scenarios for the transfer path |
| No failure-injection tests | Chaos-lite: kill the DB mid-transaction, assert rollback + 500 envelope |

Next: running & deploying it → [16-operations-and-deployment.md](./16-operations-and-deployment.md)