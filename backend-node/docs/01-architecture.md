# 01 — Architecture pattern, end to end

> Plain-language goal: by the end of this doc you can draw the whole system on
> a whiteboard — front door to database — and explain why it is shaped that
> way, including the trade-offs a senior engineer cares about.

## 1. The pattern: a modular monolith with a layered core

This backend is a **modular monolith**. There is one deployable service
(`backend-node`), one database, one codebase — but the code is split into
**feature modules** (`transfer`, `deposit`, `withdraw`, `savings`, `kyc`,
`admin`, …) that each contain the full slice of their feature (routes,
controller, DTOs, service). Shared, cross-cutting concerns live in
`src/shared` and `src/services`.

```
HTTP request
   │
   ▼
┌───────────────────────────── app.ts ─────────────────────────────┐
│  middleware stack (helmet → cors → webhooks → body → requestId → │
│  logging → rate limit → routes → 404 → error handler)            │
└──────────────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────── feature module (e.g. transfer) ──────────────┐
│  routes  →  controller  →  DTO (zod)  →  service (business logic)│
└──────────────────────────────────────────────────────────────────┘
   │                              │
   ▼                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  shared services: ledger, limits, aml, sanctions, audit, file    │
│  storage, stripe (a thin wrapper), email (resend)                │
└──────────────────────────────────────────────────────────────────┘
   │
   ▼
┌───────────────────────────── PostgreSQL ─────────────────────────┐
│  users, wallets, transactions, ledger_accounts, ledger_entries,  │
│  savings_goals, idempotency_keys, aml_flags, webhook_events,     │
│  audit_logs, refresh_tokens, … (Prisma models)                   │
└──────────────────────────────────────────────────────────────────┘
   │
   ▼
Stripe (Payments + Connect): PaymentIntents  →  Webhooks →  Payouts
```

### Why a modular monolith (and strengths/weaknesses)

**Why it is the right call for this stage:**

1. **Money correctness lives in the database transaction.** A single service +
   a single Postgres instance means every money movement is one ACID
   transaction. Microservices would split a transfer across network hops and
   force distributed-transaction gymnastics — the #1 source of fintech bugs
   (double credits, missing debits).
2. **Simple deployment.** One image, one port, one health check. A two-person
   team can ship it.
3. **Refactor friendliness.** Feature modules are self-contained, so a module
   (e.g. `withdraw`) can be extracted into its own service later without
   rewriting it — the seams already exist.

**Pros (in a table because you asked for "pros and cons"):**

| Pro | Detail |
| --- | --- |
| Atomic money ops | Row locks + transactions inside one DB = no double-spend |
| Easy testing | Integration tests hit the real stack (app + real Postgres) |
| Low ops surface | No network orchestration for the core flows |
| Fast iteration | Change `transfer/` without touching the rest |

**Cons:**

| Con | Mitigation / plan |
| --- | --- |
| One deploy = one blast radius | Health probes, canary deploys, DB is the bottleneck not the code |
| Team scaling | Bigger codebase; enforce module boundaries via review + `src/modules/*` convention |
| DB is the scaling ceiling | It's also the source of truth; scale it first (see 17-scaling) |

**Alternatives reviewed (and why not):**

- **Microservices** — deferred. Reintroduces distributed money bugs and
  infrastructure cost. Revisit only when modules need independent scaling or
  separate compliance domains (e.g. a dedicated "payments processor").
- **Serverless functions (Vercel/CF Workers)** — bad fit for stateful money
  flows that hold DB row locks for the duration of a Stripe call, and for
  always-on webhook processing. Good later for read/export paths.
- **Hexagonal / clean architecture** — conceptually respected (boundary DTOs,
  service layer, ports for Stripe/email), but a full port-adapter ceremony
  would add boilerplate without earning its keep at this size.

## 2. The layered core (each request's path)

### Layer 0 — Bottleneck-free "front door" (`src/app.ts`)

Middleware ordering is deliberate and is **not** cosmetic:

1. `helmet()` — security headers.
2. `cors()` — allow only `CLIENT_URL`, credentials on.
3. Webhook router — mounted **before** `express.json()`, because Stripe
   signature verification needs the raw request body. If this moved, webhooks
   would silently break (this was a real bug, now fixed).
4. `express.json()` + `express.urlencoded()` + `cookieParser()`.
5. `requestIdMiddleware` → `logger` — every log line carries a request id so
   you can trace one user action across modules.
6. `apiLimiter` — global rate limit (100 req / 15 min per user or IP).
7. Routes → `notFoundHandler` → `errorHandler`.

### Layer 1 — Feature module (route → controller → DTO → service)

Every module follows the same 4 files (you'll notice they look identical —
that's intended discipline):

- **`*.routes.ts`** — defines the HTTP surface, applies middlewares
  (`authenticate`, `validate(Dto)`, `transactionLimiter`), and swagger JSDoc.
- **`dto/*.ts`** — a **zod schema** describing the request contract. Validated
  at the door so garbage never reaches business logic: `validate(schema)`
  parses `{ body, query, params }` and returns `400 VALIDATION_ERROR` on
  failure.
- **`*.controller.ts`** — extracts `req.user`, calls the service, shapes the
  response. No business rules live here.
- **`*.service.ts`** — the actual logic, including every money transaction.

### Layer 2 — Shared services (the "bank engine")

- `src/services/ledger.service.ts` — double-entry posting, account helpers.
- `src/services/limits.service.ts` — per-tier fraud limits.
- `src/services/aml.service.ts` — the AML rules engine (see 10-kyc-and-aml).
- `src/services/sanctions.service.ts` — sanction/PEP screening hook.
- `src/services/audit.service.ts` — immutable admin audit trail.
- `src/services/stripe.service.ts` / `email.service.ts` / `fileUpload.service.ts`
  — external integrations wrapped so the rest of the code talks to a thin seam.

### Layer 3 — PostgreSQL (the source of truth)

Prisma models in `prisma/schema.prisma`. Two families of "transaction"
tables exist on purpose:

- `Transaction` — the *customer-facing* record (receipts, statements, limits).
- `LedgerEntry` — the *accounting* record: an immutable, append-only
  double-entry journal. Every `Transaction` money movement creates a matching
  DEBIT/CREDIT pair. Detail in [02-database-architecture.md](./02-database-architecture.md).

## 3. The money architecture in one flow

The three money paths follow one mastering idea — **front-end requests ask,
webhooks and DB transactions confirm**:

| Flow | Request does | Authority that actually moves money |
| ---- | ------------ | ----------------------------------- |
| Transfer | Validates PIN, locks both wallets, checks balance, writes one `$transaction` | The request itself (internal transfer, fully inside DB ACID) |
| Deposit | Creates Stripe PaymentIntent + a PENDING `Transaction` | `payment_intent.succeeded` webhook (amount-verified) |
| Withdraw | Locks wallet, atomically debits + records PENDING | Stripe payout; on failure a compensating reversal |

Why "webhook-authoritative" for external money: the only person who *really
knows* the card payment succeeded is Stripe. If we credited optimistically and
the charge failed, we'd have given away real balance for fake money.

## 4. Cross-cutting concerns (where they live)

| Concern | Where |
| --- | --- |
| AuthN/AuthZ | `src/shared/middleware/auth.middleware.ts`, `admin.middleware.ts` |
| Validation | `src/shared/middleware/validation.middleware.ts` + per-module DTOs |
| Errors | `src/shared/utils/AppError.ts`, `src/shared/middleware/errorHandler.ts` |
| Logging | `src/shared/middleware/logger.middleware.ts`, `src/shared/utils/logger.ts` |
| Rate limiting | `src/shared/middleware/rateLimiter.ts` |
| Encryption (PII at rest) | `src/shared/utils/encryption.ts`, wired via a Prisma `$use` middleware in `src/config/database.ts` |
| Env configuration | `src/config/env.ts` (zod-validated at boot — the app refuses to start misconfigured) |

## 5. Things to consider (the honest list)

1. **The DB is the concurrency authority.** All horizontal scaling must
   accept that wallet rows serialize on their lock. That's correct but means
   throughput per wallet is bounded by DB speed — acceptable for wallets;
   see [17-scaling-and-load.md](./17-scaling-and-load.md).
2. **Webhook processing is synchronous in-process.** A long Stripe outage or
   a flood of events could delay request handling. A queue consumer (BullMQ
   + Valkey) is the documented next step.
3. **Files live on the local disk** (private, authenticated). Production
   should move to object storage with signed URLs.
4. **Rate limiting is per-instance in memory.** With N replicas, add a shared
   store (Redis/Valkey) so limits are global (documented in 17).
5. **No CI/CD pipeline yet.** Tests + build exist; a GitHub Actions stage that
   runs them and deploys the Docker image is the biggest single win still on
   the table (see the checklist in 18).

Next: the database, which is the heart of the money-correctness claims →
[02-database-architecture.md](./02-database-architecture.md)