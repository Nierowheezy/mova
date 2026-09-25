# backend-node — Documentation

Everything you need to own this codebase end to end: how the money works,
how every module is built, why each pattern was chosen, the trade-offs, and
what still needs doing before it is a bank-grade production system.

## How to read this documentation

The first three docs are the "campaign overview". Read them first:

| Doc | What it gives you |
| --- | --- |
| [01-architecture.md](./01-architecture.md) | The architectural pattern, layer by layer, end to end. Why this pattern, its pros/cons, and the alternatives considered. |
| [02-database-architecture.md](./02-database-architecture.md) | The core database design: every table, the double-entry ledger, ACID, indexes, migrations. |
| [03-request-lifecycle.md](./03-request-lifecycle.md) | What happens from the moment an HTTP request arrives to the moment a response leaves. |

Then read the feature docs in any order — each is written in plain language
so a non-specialist can follow it, with the "why" and "what a senior engineer
reviews" sections for when you are defending the design:

| Doc | Covers |
| --- | --- |
| [04-auth-security.md](./04-auth-security.md) | Passwords, JWT access/refresh rotation, 2FA, lockouts, security headers |
| [05-wallet-and-ledger.md](./05-wallet-and-ledger.md) | Wallets, double-entry ledger, the wallet = ledger invariant |
| [06-transfers.md](./06-transfers.md) | P2P transfers: row locks, PIN, idempotency |
| [07-deposits.md](./07-deposits.md) | Funding the wallet via Stripe, webhook-authoritative crediting |
| [08-withdrawals.md](./08-withdrawals.md) | Cash-out via Stripe Connect, atomic debit + compensation |
| [09-savings-goals.md](./09-savings-goals.md) | Savings goals and their ledger |
| [10-kyc-and-aml.md](./10-kyc-and-aml.md) | KYC tiers, sanctions screening hook, AML rules engine, admin ops |
| [11-webhooks-stripe.md](./11-webhooks-stripe.md) | Stripe webhooks: raw bodies, signatures, dedup, exact-once crediting |
| [12-uploads-and-storage.md](./12-uploads-and-storage.md) | Private file storage for KYC documents |
| [13-idempotency.md](./13-idempotency.md) | The idempotency system across transfer/deposit/withdraw |
| [14-errors-validation-dtos.md](./14-errors-validation-dtos.md) | DTOs, validation, error envelopes, error codes |
| [15-testing.md](./15-testing.md) | How the 27 integration + unit tests work |
| [16-operations-and-deployment.md](./16-operations-and-deployment.md) | Running it: local, Docker, env vars, migrations, Stripe setup |
| [17-scaling-and-load.md](./17-scaling-and-load.md) | Growth & load: horizontal scaling, pooling, queues, observability |
| [18-senior-engineer-checklist.md](./18-senior-engineer-checklist.md) | Everything a senior engineer would put in place — done vs. to-do |
| [19-observability-and-runbooks.md](./19-observability-and-runbooks.md) | Production observability with a $0-licensing plan: health checks, metrics, error tracking, the money-reconciliation job, dashboards, alerts, runbooks, DR |

## One-paragraph executive summary

`backend-node` is an **Express + TypeScript + PostgreSQL (Prisma ORM) +
Stripe** fintech wallet API organized as a **modular monolith**: feature
folders (`transfer`, `deposit`, `withdraw`, `kyc`, `admin`, …) each split
into route → controller → DTO → service. All money movement runs inside
**PostgreSQL transactions with row locks** (`SELECT … FOR UPDATE`) so
concurrent requests can never overspend, records a **double-entry ledger**
entry pair (debit + credit) so balances always reconcile, and is protected by
**client idempotency keys** so retries can never double-charge. Deposits are
credited **only by the Stripe webhook** (never optimistically in the request),
withdrawals debit atomically and compensate on Stripe failure, KYC tiers gate
the fraud-control limits, and an **AML rules engine** flags suspicious
activity for ops review. On top of that sits the standard security stack:
JWT access + rotating refresh tokens, 2FA, PIN lockout, bcrypt hashing,
helmet/CORS/rate limiting, encrypted PII at rest, audit logs, and a test
suite that proves the money invariants.

## The tech stack (what was used and why)

| Concern | Choice | Why |
| ---- | ---- | ---- |
| Runtime | Node 22 + Express 5 + TypeScript | Massive ecosystem, fast iteration, static typing across the money code |
| Database | PostgreSQL 16 | Battle-tested ACID transactions + row locks — the foundation of money correctness |
| ORM | Prisma 5 | Type-safe queries, schema-as-source-of-truth, easy migrations |
| Validation | zod 4 (DTOs) | Runtime validation at the API boundary, shared types between client/server |
| Payments | Stripe (PaymentIntents + Connect) | Card deposits, payouts to bank accounts, webhooks with cryptographic signatures |
| MFA | speakeasy (TOTP) | Standard RFC-6238 one-time passwords |
| Security | helmet, bcryptjs, express-rate-limit, cookie-parser | Headers, password hashing, per-user/per-auth route limiting, secure cookies |
| Logging | pino + pino-http | Fast structured JSON logs with request IDs |
| Docs | swagger-jsdoc + swagger-ui-express | Live OpenAPI docs at `/api-docs` |
| Tests | Vitest + supertest | Fast integration tests against a disposable Postgres database |
| Files | multer + sharp (upload-side) | Private uploads — served only through an authenticated endpoint |

Jump to the architecture doc → [01-architecture.md](./01-architecture.md)