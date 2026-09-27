# Mintbank - Project Overview

<!-- buildflow:source-hash 9745927c223befec77b701d7b2ae77f964f15310e39b6868399195f0023035b9 -->

> An internal bank-operations platform: a "Work layer" (queues, cases, alerts,
> SLAs, audit trail) built on top of the existing Mova banking backend.

## Problem

Bank operations staff move between core banking, fraud tooling, KYC queues, CRM,
and spreadsheets to answer one question: **what needs my attention right now, and
is it safe to act?** The work is disjointed and the tooling is exception-blind.

The existing Mova backend already solved *how a bank moves money* (wallet, ledger,
transfers, KYC, AML, Stripe). Mintbank solves *how the people operating the bank
do their work*, by bringing queues of work around a shared customer record into
one calm, data-dense workspace built around exceptions rather than vanity numbers.

**Hard constraint:** the banking engine underneath is sacred. The Work layer reads
banking data; it must never write to money movement, the ledger, or auth.

## Users

Internal bank staff, not customers. Seven roles, each seeing the same product with
different priorities and permissions:

| Role | Needs |
|---|---|
| Operations Manager (primary) | Exceptions across teams, SLA tracking, team workload |
| Fraud & Risk Analyst | Investigate alerts with full context in one screen; block, clear, escalate |
| KYC Reviewer | Compare documents to application against a 48h SLA |
| Loan Officer | Check DBR and policy limits, request missing documents |
| Customer Service | Resolve cases, reply with context and macros |
| Compliance Officer | Receive escalations, rely on the audit trail |
| Administrator | Create roles from templates, control sensitive permissions |

## Features

Build-plan order. Everything is currently unbuilt; Feature 1 is next.

1. **Work Layer Backend** - Prisma models for the Work entities. *(next)*
2. **Role-Based Access Control** - expand user roles to the 7 operational roles and define permissions
3. **Operations API** - endpoints for fetching queues, assigning cases, resolving actions
4. **Customer 360 API** - one aggregation endpoint returning all customer data in a single payload
5. **Operations Dashboard UI** - exceptions-first layout, KPI cards, "Needs Attention" queue
6. **Queue Management UI** - queue list with SLA timers, filters, priority sorting
7. **Investigation Drawer UI** - transaction detail with risk score and "Why flagged" reasons
8. **Controlled Action Workflow** - mandatory reason inputs, acknowledgement checkboxes, audit log generation
9. **KYC Workspace UI** - 3-column layout with document viewer and verification checklist
10. **Customer 360 UI** - unified view of balances, KYC, alerts, support cases
11. **Mint AI Assistant** *(Post-MVP)* - floating orb UI plus RAG backend for grounded policy answers
12. **Analytics & Reporting Dashboard** *(Post-MVP)* - operational metrics: volume, success rate, fraud losses prevented
13. **Admin Settings UI** *(Post-MVP)* - role management and permissions matrix
14. **Arabic RTL & Dark Mode** *(Post-MVP)* - full localization and dark theme
15. **Loan Decision Workflow UI** *(Post-MVP)* - application review, policy checks, decision panel
16. **Support Case Resolution UI** *(Post-MVP)* - conversation timeline, internal notes, SLA timer

## Data model

### Existing Mova entities (read-only to the Work layer)

`User`, `Wallet`, `Transaction`, `KYC` (table `kyc_records`), `Beneficiary`,
`SavingsGoal`, `Notification`, `AmlFlag`, `AuditLog`, `LedgerAccount`,
`LedgerEntry`, `WebhookEvent`, `IdempotencyKey`, `RefreshToken`, `LoginAttempt`,
`PasswordHistory`, `VerificationToken`.

- Money is `Decimal(12,2)`. Primary keys are autoincrement `Int`.
- **Schema naming is load-bearing:** columns are `snake_case` via `@map`, tables
  via `@@map`. New models follow it.
- `LedgerEntry` is append-only. Never updated or deleted.
- The KYC model is named **`KYC`**, not `KYCApplication` as the project plan says.
- `UserRole` currently holds only `USER | ADMIN | SUPPORT`. Widening it to the 7
  operational roles is Feature 2, not Feature 1.

### New Work entities (Feature 1)

Purpose and relationships only; exact fields are settled in the Feature 1 spec.

- **Queue** - a unit of work (Fraud, KYC, Loans, Support). Has many cases, and a
  default SLA policy.
- **Case** - the central work record. Belongs to a queue; optionally links to a
  `User` (customer), a `Transaction`, a `KYC` record, and an `AmlFlag`; carries
  status, priority, assignee, and a resolution. Owns tasks and audit events.
- **Alert** - a detected exception that can raise a case. Source-agnostic (AML
  rule hit, ledger reconciliation break, KYC SLA breach).
- **Task** - a checklist item on a case, optionally assigned to a staff `User`.
- **SlaPolicy** - the duration a queue's work must be handled within. The concrete
  deadline is denormalised onto the case as `dueAt` so countdown queries stay
  cheap and survive policy edits. The plan calls this entity `SLA`; it is named
  `SlaPolicy` here because it holds the policy, not an instance.
- **AuditEvent** - append-only record of every controlled action, linked to a case.

**Load-bearing, lock early:** relations from `Case` to banking entities use
explicit nullable foreign keys (`customerId`, `transactionId`, `kycId`,
`amlFlagId`), not a generic `(entityType, entityId)` pair. Referential integrity
is a regulatory requirement, and queue queries need real indexed FKs.

## Tech stack

- **Express 5 + TypeScript** - HTTP layer, one folder per domain under `src/modules/`
- **Prisma + PostgreSQL** - all data access; `migrate dev` in dev, `migrate deploy` in prod
- **Zod** - request validation via a `validate` middleware
- **Vitest** - unit + integration tests against a real Postgres
- **Stripe** - existing payment rails (untouched)
- **React 19 + Vite + Tailwind 4 + daisyUI** - the separate frontend stack in `../frontend`
- **RAG (vector DB + LLM)** - Mint AI Assistant only, Post-MVP
- **Docker, Render, GitHub Actions** - deployment and CI
- **Prometheus + Grafana, Sentry, pino-style structured logging** - observability

The AI assistant must be **grounded and non-autonomous**: it answers policy
questions and takes no action of its own.

## Monetization

Not a direct revenue generator; it is an internal platform. Value is cost savings
from fewer context switches, fraud prevention from faster investigation, and
compliance adherence through enforced SLAs and an immutable audit trail.

## UI/UX

**"Calm by default, loud only when it matters."** Full direction lives in the
frontend stack's own plan; the constraints that bind backend contracts:

- Restrained forest-and-lime palette on a soft grey canvas. Green is reserved for
  primary actions and positive trends so exceptions stand out.
- Plus Jakarta Sans for dense financial data, JetBrains Mono for IDs, account
  numbers, and transaction references.
- Accessibility is a requirement, not a nice-to-have: Arabic RTL support, dark
  mode tuned for long shifts, and status indicators that use **icon + colour +
  label**, never colour alone. Backend enums must therefore be renderable as
  explicit labels, not bare codes.
- Exception-first: the dashboard answers "needs attention" before it answers
  anything else.

## Deployment

- **Backend** - Render Blueprint via `render.yaml`: API + Postgres + uploads disk
- **Frontend** - Render static site or Vercel (`frontend/vercel.json`)
- **CI/CD** - `.github/workflows/ci.yml` builds and tests both stacks on every
  push; `reconcile-nightly.yml` runs money reconciliation at 03:17 UTC
- **Env vars** - `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`,
  `STRIPE_PUBLIC_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `RESEND_API_KEY`, `FROM_EMAIL`, `CLIENT_URL`, `FRONTEND_URL`, `SENTRY_DSN`,
  `METRICS_ENABLED`
- **Health checks** - `/healthz` (liveness), `/readyz` (readiness),
  `/metrics` (Prometheus scrape)
- **Backend build/start** - `pnpm build` then `pnpm start`; package manager pnpm

## Open questions

- The project plan names the KYC entity `KYCApplication`; the real model is
  `KYC`. Treated as the same thing. Fix in the plan or accept.
- The plan asks for a new `AuditEvent` entity, but `AuditLog` already exists with
  overlapping purpose. Decide whether to extend `AuditLog` with case relations or
  keep a separate Work-layer table. **Unresolved; blocks a clean Feature 1.**
- The plan asks for a new `Alert` entity, but `AmlFlag` already models a rule hit
  with severity and review status. Decide whether `Alert` generalises it or
  duplicates it. **Unresolved; blocks a clean Feature 1.**
- `build-plan.md` item 1 lists Queue, Case, Alert, SLA, AuditEvent but omits Task,
  which `project-plan.md` section 4 lists. Treated as included.
- `pnpm lint` is broken (zero-byte `eslint.config.js`, and `--ext` was removed in
  ESLint v9; this project is on v10). Not run by CI. Not a verification gate until
  fixed.
- A stray `package-lock.json` sits alongside the authoritative `pnpm-lock.yaml`.
  It is unused and a drift risk.
