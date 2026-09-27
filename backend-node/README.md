# fintech-banking-app — backend-node

Production-grade Express + TypeScript + PostgreSQL (Prisma) + Stripe fintech
wallet API: transfers, deposits, withdrawals, savings goals, KYC tiers, AML
monitoring, double-entry ledger, idempotency, and 2FA.

> **Documentation lives in [`docs/`](./docs/README.md)** — 18 numbered guides
> (architecture, database, every module in plain language, scaling, deployment,
> and a senior-engineer checklist). Read `docs/README.md` first.

## Quick start

```bash
pnpm install
cp .env.example .env        # fill in values (see docs/16)
pnpm prisma:migrate
pnpm dev                    # → http://localhost:8000  ·  Swagger at /api-docs
```

Docker (Postgres + API, migrations auto-run):

```bash
docker compose up --build   # API on :8000, Postgres on host :5433
```

## Verify

```bash
pnpm build                  # tsc — must be clean
pnpm test                   # 22 integration/unit tests against mintbank_test
```

## Repository map

```
docs/                    ← start here (architecture → per-module → ops → senior checklist)
src/
  app.ts                 front door (middleware order matters — webhooks above json!)
  server.ts              boot + graceful shutdown
  config/                env (zod), database (Prisma + PII encryption), limits, jwt, swagger
  modules/               transfer · deposit · withdraw · savings · kyc · auth · wallet ·
                         transaction · admin · webhook · connect · beneficiary · ...
  services/              ledger (double-entry) · limits · aml · sanctions · audit · stripe · email
  shared/                middlewares (auth, admin, validate, rate-limit, errors, logger),
                         utils (AppError, encryption, cookies), enums, constants
prisma/
  schema.prisma          source of truth; migrations/ for every schema change
tests/                   vitest + supertest against a real Postgres (mintbank_test)
Dockerfile · docker-compose.yml · docker-entrypoint.sh
```

## Security & money invariants (short version)

- Every money movement runs in one `prisma.$transaction` with `SELECT … FOR UPDATE` row locks — no double-spend, ever.
- Double-entry ledger (`ledger_entries`) with a platform house account; wallet balance must equal its ledger account.
- Deposits are credited **only** by the Stripe webhook (amount-verified, deduped, row-locked); withdrawals debit atomically and compensate on Stripe failure.
- Client `idempotencyKey` (required for deposit/withdraw) + Stripe-side idempotency = retries can't double-charge.
- KYC tiers (BASIC/VERIFIED/PREMIUM) drive daily limits; AML rules engine flags suspicious activity for ops review (non-blocking MVP).
- bcrypt + JWT access/rotating refresh families + TOTP 2FA + PIN lockout + helmet/CORS/rate limits + PII encrypted at rest + audit logs on admin actions.

See docs/18 for the honest production-readiness checklist.

## Related

- `fintech-frontend/` — web client
- `fintech-backend-remediation.md` — the hardening plan driving this work
  (also mirrored in `code_progress/`)