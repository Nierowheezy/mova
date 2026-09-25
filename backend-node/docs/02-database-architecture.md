# 02 — Database architecture (the heart of money correctness)

> Plain-language goal: you can explain every table, why the ledger exists, how
> ACID is actually enforced here, and how migrations and the ledger backfill
> work — well enough to defend it in a review.

## 1. The engine: PostgreSQL, accessed through Prisma

- **PostgreSQL** is chosen because it gives us *real* ACID transactions and
  row-level locking. SQLite/MySQL are fine for prototypes; Postgres is the
  industry default for money.
- **Prisma 5** is the ORM: `prisma/schema.prisma` is the single source of
  truth; `prisma migrate` generates SQL migrations from it; the generated
  client is fully type-safe.

**Prisma's `$use` middleware** in `src/config/database.ts` transparently
encrypts PII fields (like `KYC.fullName`) at rest and decrypts on read, so
compliance-sensitive data isn't stored in plaintext even if the DB leaks.

## 2. Table-by-table map

### Identity & auth
| Table | Purpose | Key notes |
| --- | --- | --- |
| `users` | One row per customer. | `@unique` email/username; `transactionPin` bcrypt-hashed; 2FA secret + hashed backup codes; PIN lockout counters; `tier` (BASIC/VERIFIED/PREMIUM); `role` (USER/ADMIN/SUPPORT); freeze flags. |
| `refresh_tokens` | Rotating refresh sessions. | `family` groups tokens so a replayed old token revokes the whole family. |
| `login_attempts` | Audit of auth attempts. | Feeds the 5-attempt lockout / rate limiting. |
| `password_history` | Reuse prevention. | Last N hashes kept. |
| `verification_tokens` | Email verify / password reset. | Expiring, single-use tokens. |

### KYC
| Table | Purpose |
| --- | --- |
| `kyc_records` | One per user; `verificationStatus` (PENDING/VERIFIED/REJECTED); `idImage` stores the private `fileId`; `fullName` encrypted at rest. |

### Money — the important part
| Table | Purpose | Why it matters |
| --- | --- | --- |
| `wallets` | Per-user balance. | `balance DECIMAL(12,2)` — **never float**. Rows are locked with `SELECT … FOR UPDATE` before any mutation. |
| `transactions` | Customer-facing records. | Type (DEPOSIT/TRANSFER/WITHDRAWAL/SAVINGS), status (PENDING/SUCCESSFUL/FAILED), `externalReference` carries Stripe ids (payment_intent/po_…) so duplicates are detectable; one transfer writes **two** rows sharing one `externalReference` (one per wallet) so both parties get a statement. |
| `ledger_accounts` | Accounting buckets. | `accountId` strings like `wallet:3`, `goal:<uuid>`, `platform`. |
| `ledger_entries` | **The double-entry journal.** | Append-only; every movement creates a DEBIT + CREDIT row; `balanceAfter` snapshots each account's running balance; `txRef` links to the `Transaction`. |
| `savings_goals` | Goal state. | `targetAmount`/`currentAmount`, linked to a wallet. |
| `idempotency_keys` | Client-key → response cache. | `key` is `@unique`; TTL 24h; claiming it inside the money transaction makes replays race-safe. |

### Operations & compliance
| Table | Purpose |
| --- | --- |
| `aml_flags` | Rules-engine hits for ops review (status OPEN/UNDER_REVIEW/DISMISSED/ESCALATED, severity LOW→CRITICAL, who reviewed). |
| `webhook_events` | Deduplicates Stripe events by `eventId` — exactly-once processing. |
| `audit_logs` | Every admin action: who, what, target, IP, user-agent, when. |
| `notifications` | User-facing messages tied to transactions. |
| `beneficiaries` | Saved P2P counterparts. |

## 3. ACID — where each letter is actually enforced

| Letter | Meaning here | Enforcement |
| --- | --- | --- |
| **A**tomicity | A money move either fully happens or not at all | `prisma.$transaction(async tx => …)` — all wallet/ledger/record writes commit or roll back together |
| **C**onsistency | Balances can't go negative; ledger always nets to zero | Balance check is re-read from the **locked** row inside the transaction (never from a stale pre-read); `postDoubleEntry` writes both sides or throws; non-negative enforced for CUSTOMER_WALLET & SAVINGS_GOAL accounts |
| **I**solation | Concurrent transfers can't overspend | `SELECT … FOR UPDATE` takes a row-level lock; the second concurrent request blocks until the first commits, then sees the new balance |
| **D**urability | Committed money survives crashes | Postgres WAL + fsync; Prisma awaits commit before responding |

## 4. The double-entry ledger — the invariant that catches every bug

Every balance change posts **two** rows to `ledger_entries`:

```
Transfer $30 Alice → Bob:
  ledger_entries:  (DEBIT  $30, account wallet:3,   balanceAfter 70)
                   (CREDIT $30, account wallet:9,   balanceAfter 30)

Deposit $50 → Alice (credit via webhook):
  (DEBIT  $50, account platform,   balanceAfter -50)   ← platform can go negative
  (CREDIT $50, account wallet:3,   balanceAfter 120)   ← house account mirrors it

Withdrawal $20 by Bob:
  (DEBIT  $20, account wallet:9,   balanceAfter 10)
  (CREDIT $20, account platform,   balanceAfter …)

Failed payout refund (platform DEBIT → wallet CREDIT): reverses the pair.
```

**The invariant:** `wallets.balance === ledger_accounts(accountId="wallet:N").balance`
always. The test suite asserts this after transfers (`tests/transfer.integration.test.ts`),
and `scripts/backfill-ledger.ts` seeds accounts for wallets that existed before
the ledger shipped so the invariant holds from day one.

Rules of the ledge: **append-only** (never update/delete a `LedgerEntry`),
one `platform` house account for the settlement side (no fees/escrow yet —
that's a documented future split).

### Why the ledger at all?
If we only had `wallets.balance`, a corrupted balance could go unnoticed
forever. The ledger is the independent, auditable source that lets anyone
(you, an auditor, an examiner) prove where money came from and went. Every
serious fintech runs one.

## 5. Types that protect money

- Money columns are `Decimal(12,2)` (fixed-point). Floats are banned for
  money because `0.1 + 0.2` is not `0.3`.
- External ids (`stripe_account_id`, wallet ids) are unique so a merchant
  account can't be linked twice, etc.
- `idempotency_keys.key` unique + `webhook_events.eventId` unique = the two
  dedup rails against "the request retried" and "the webhook redelivered".

## 6. Migrations & the dev flow

- **Migrations** live in `prisma/migrations/`. `pnpm prisma:migrate` (dev,
  interactive) vs `pnpm exec prisma migrate deploy` (CI / Docker, non-interactive,
  used by `docker-entrypoint.sh`).
- **Naming**: follow `prisma migrate dev --name <short_what_changed>`.
- **`pnpm db:backfill:ledger`** — one-time script for environments whose
  wallets predate the ledger. Run it wherever pre-rollout balances exist.
- **Test DB:** `frontend tests` reset `fintech_test` via `prisma migrate reset
  --force --skip-seed` each run (see [15-testing.md](./15-testing.md)).

## 7. Indexes & query notes (senior-engineer lens)

- Ledger lookups are always `(accountId, createdAt)` or `txRef` — indexed.
- `transactions` queries filter by user + timestamp + status — make sure any
  new high-traffic query adds an index instead of scanning.
- We deliberately quote **camelCase column names** (`"accountId"`,
  `"balanceAfter"`) in raw SQL because the ledger tables kept camelCase
  columns; a snake_case migration was documented but skipped (needs
  interactive apply). When writing raw SQL, always quote them.

Next: what actually happens per request → [03-request-lifecycle.md](./03-request-lifecycle.md)