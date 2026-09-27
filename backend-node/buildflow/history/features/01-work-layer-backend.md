# Feature: Work Layer Backend

**From build-plan:** feature 1
**Status:** verified

## Goal

Add the database foundation for Mintbank's operations cockpit: the Work-layer
entities (queues, cases, alerts, tasks, SLA policies, audit wiring) and the
`src/modules/operations/` scaffold they belong to.

Everything after this feature (the operations API, RBAC, every UI surface) reads
and writes these tables, so the shapes decided here are load-bearing and expensive
to change later. This feature is schema and scaffolding only.

## Decisions that need your sign-off

Three points where `project-plan.md` and the existing Mova schema disagree. I have
picked a default for each; say the word and I will flip it.

| # | Plan says | Reality | My default | Why |
|---|---|---|---|---|
| 1 | add an `AuditEvent` entity | `AuditLog` already exists: actor, action, target, details, ip, user agent, timestamp, indexed | **Extend `AuditLog`** with a nullable `caseId`, no new table | Two audit tables split the trail. For a compliance product that is the worst outcome, and the admin module already writes `AuditLog` for every controlled action. |
| 2 | add an `Alert` entity | `AmlFlag` already models a rule hit with severity and review status | **New `Alert`**, source-agnostic, may reference an `AmlFlag` | `AmlFlag` is AML-only. Ops needs one "Needs Attention" stream across AML, ledger breaks, and KYC SLA breaches. Reusing `AmlFlag` would mean rewriting AML logic, which is off-limits. |
| 3 | entity named `SLA` | - | **Name it `SlaPolicy`** | It holds the *policy* (a duration). The actual deadline is denormalised onto each case as `dueAt`, so countdown queries stay cheap and survive policy edits. A model named `Sla` that holds no SLA instance is misleading. |

Also noted, not blocking: the plan calls the KYC entity `KYCApplication`; the real
model is `KYC`. I am using `KYC`.

| # | Question | Decision | Why |
|---|---|---|---|
| 4 | Which database holds the Work layer? | **One Mintbank database** — `mintbank_dev` / `mintbank_test`, holding the banking tables and the work layer together | The work layer holds nine foreign keys into the banking tables (`Case` → users, transactions, kyc_records, aml_flags; `Alert` → users, transactions, aml_flags; `AuditLog` → cases). PostgreSQL cannot enforce a cross-database FK, so a second database would mean `postgres_fdw`, application-level checks, or duplicated customer rows — giving up the database-enforced referential integrity these relations exist to provide. Mova is the foundation layer *inside* Mintbank, not a neighbouring system. |

Decided 2026-09-27: the old `fintech_dev` / `fintech_test` were left in place but are
no longer referenced. Nothing is committed, so the move was cheap.

## In scope

- New enums: `QueueCategory`, `CaseStatus`, `CasePriority`, `TaskStatus`, `AlertStatus`
- New models: `SlaPolicy`, `Queue`, `Case`, `Task`, `Alert`
- Additive back-relations on `User`, `Transaction`, `KYC`, `AmlFlag` (inert fields; no logic touched)
- `AuditLog.caseId` plus its index
- Two Prisma migrations, applied to the local dev database
- `src/modules/operations/` scaffold with a README recording the decisions
- An integration test proving the new relations resolve and foreign keys are enforced

## Out of scope

- **Any HTTP surface.** No routes, controllers, services, DTOs, or `app.ts`
  registration. That is Feature 3.
- **RBAC.** `UserRole` stays `USER | ADMIN | SUPPORT`. Widening it to the seven
  operational roles is Feature 2. `assigneeId` points at `User` with no role
  constraint for now.
- **Seed data** for the four queues. Feature 6 needs them to exist; that belongs
  with the queue feature, not here.
- **SLA business-hours arithmetic.** The `businessHoursOnly` flag is stored; the
  deadline calculator ships with the API.
- **Customer 360 aggregation** (Feature 4), all UI (Features 5-10, 13-16), Mint AI
  (Feature 11), analytics (Feature 12), i18n and dark mode (Feature 14).
- **DB-level append-only enforcement** for the audit trail (revoking `UPDATE`
  grants). That is a deployment concern, not a schema one.
- **Any change to banking logic.** The ledger, transfers, deposits, withdrawals,
  Stripe webhooks, and auth are untouched.

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [ ] **Step 1 - Operations module scaffold** - create `src/modules/operations/`
  with a README recording the Work entities, the three decisions above, and what
  Features 2-4 will add. Deliberately registers nothing in `app.ts`.
  *Done when:* the folder and README exist, `app.ts` is byte-identical to `HEAD`,
  and `pnpm build` still passes.

- [ ] **Step 2 - Core work schema** - add the `QueueCategory`, `CaseStatus`,
  `CasePriority`, `TaskStatus` enums and the `SlaPolicy`, `Queue`, `Case`, `Task`
  models, plus inert back-relations on `User`, `Transaction`, and `KYC`. Then
  `pnpm prisma:migrate` and `pnpm prisma:generate`.
  *Done when:* `prisma validate` passes, the migration applies to `mintbank_dev`,
  `prisma migrate status` reports up to date, `pnpm build` is green, and the
  existing 40 tests still pass.
  *This is the largest step, roughly 130 lines of schema, and I am deliberately
  not splitting it further.* `Queue` cannot declare its `cases` relation before
  `Case` exists, so splitting by model produces migrations that are invalid in
  isolation. The schema reads top-to-bottom in one file, so one diff is easier to
  read than three. Flagging the size rather than pretending it is small.

- [ ] **Step 3 - Alert intake and audit wiring** - add the `Alert` model and
  `AlertStatus` enum, the `AmlFlag` back-relation, and `AuditLog.caseId` with its
  index. Second migration.
  *Done when:* same checks as Step 2, and `AuditLog` rows written by the existing
  admin flow still insert without a `caseId`.

- [ ] **Step 4 - Schema integration test** - `tests/work-layer.integration.test.ts`
  proving the relations resolve and the constraints bite.
  *Done when:* the new suite passes and the total goes from 40 tests to 40 + the
  new count, with zero pre-existing tests changed.

## Files / areas

**New**

- `src/modules/operations/README.md`
- `prisma/migrations/<ts>_add_work_layer_core/migration.sql`
- `prisma/migrations/<ts>_add_work_layer_alerts/migration.sql`
- `tests/work-layer.integration.test.ts`

**Modified**

- `prisma/schema.prisma` - additive only: new enums, new models, back-relations,
  `AuditLog.caseId`
- `buildflow/build-plan.md` - check item 1 off on completion

**Explicitly not modified**

- `src/app.ts`, `src/services/ledger.service.ts`, `src/modules/transfer/`,
  `src/modules/deposit/`, `src/modules/withdraw/`, `src/modules/webhook/`,
  `src/modules/auth/`, `src/services/aml.service.ts`

## Data / contracts

All tables `snake_case` via `@@map`, all columns `snake_case` via `@map`, matching
the existing schema. `Int @id @default(autoincrement())`, matching the existing
models.

**New enums**

- `QueueCategory`: `FRAUD`, `KYC`, `LOANS`, `SUPPORT`
- `CaseStatus`: `OPEN`, `UNDER_REVIEW`, `ESCALATED`, `RESOLVED`
- `CasePriority`: `LOW`, `NORMAL`, `HIGH`, `URGENT`
- `TaskStatus`: `OPEN`, `DONE`
- `AlertStatus`: `NEW`, `ACKNOWLEDGED`, `RESOLVED`, `DISMISSED`

`Alert.severity` **reuses the existing `AmlSeverity`** (`LOW`, `MEDIUM`, `HIGH`,
`CRITICAL`) rather than adding a near-identical enum. `AlertStatus` is
deliberately *not* `AmlFlagStatus`: an alert is an input to the work layer, while
`AmlFlagStatus` describes review of the flag itself.

**Models**

| Model | Table | Key fields | Relations |
|---|---|---|---|
| `SlaPolicy` | `sla_policies` | `name` (unique), `durationMinutes`, `businessHoursOnly`, `escalateAfterMinutes?` | default for many `Queue`; used by many `Case` |
| `Queue` | `queues` | `name` (unique), `slug` (unique), `category`, `description?`, `isActive`, `defaultSlaPolicyId?` | many `Case` |
| `Case` | `cases` | `reference` (uuid, unique, quotable), `title`, `description?`, `status`, `priority`, `dueAt?`, `openedAt`, `resolvedAt?`, `resolutionReason?` | 1 queue, 1 slaPolicy?, 1 customer?, 1 transaction?, 1 kyc?, 1 amlFlag?, 1 assignee?, many `Task`, many `AuditLog`, 0..1 source `Alert` |
| `Task` | `tasks` | `title`, `status`, `dueAt?`, `completedAt?` | 1 case, 0..1 assignee |
| `Alert` | `alerts` | `rule`, `source`, `severity`, `status`, `title`, `details?` (the "why flagged" inputs), `createdAt` | 0..1 customer?, 0..1 transaction?, 0..1 amlFlag?, 0..1 case? |

**Indexes** (these are the hot paths for the exceptions-first dashboard)

- `Case`: `[queueId, status]`, `[assigneeId, status]`, `[dueAt]`, `[customerId]`
- `Task`: `[caseId]`, `[assigneeId, status]`
- `Alert`: `[status, severity]`, `[userId]`, `[rule]`
- `AuditLog`: `[caseId]`

**Load-bearing:** the `Case` -> banking relations are **explicit nullable foreign
keys** (`customerId`, `transactionId`, `kycId`, `amlFlagId`), not a generic
`(entityType, entityId)` pair. Referential integrity is a regulatory requirement
here, and queue queries need real indexed FKs. This is recorded in
`coding-standards.md` so later features do not reintroduce a polymorphic shortcut.

**Denormalised deadline:** `Case.dueAt` is copied from the active `SlaPolicy` when
the case opens, then never recomputed. Editing a policy must not retroactively
move deadlines on cases already in flight. The calculator that populates it ships
with the API (Feature 3).

**Status enum note:** `CaseStatus` and `AlertStatus` are rendered as explicit
labels, never bare codes, because the design requires icon + colour + label and no
colour-only signalling. These enums are the contract for that.

**Not locked here, on purpose:** the shape of `Alert.details` (the "Why flagged"
payload Feature 7's Investigation Drawer renders) and the `AuditLog.action` string
vocabulary for controlled actions. Both are consumed by later features and both
should be defined by the feature that first writes them, not guessed now. This
feature stores them as untyped `Json` / `String` so nothing is prematurely
committed.

## Testing

A test runner is configured, so this is a gate. `pnpm test` is the command; it
resets `TEST_DATABASE_URL` (default `mintbank_test` on port 5433) first, so a local
Postgres must be up.

The in-scope logic here is **relational integrity**, not HTTP. The new suite
covers exactly that:

- A `Case` resolves `customer`, `transaction`, `kyc`, `queue`, `slaPolicy`, and
  its `tasks` after being created with those links.
- An `Alert` resolves its `amlFlag` and can be the source of a `Case`.
- An `AuditLog` written with a `caseId` resolves back to the case, and one written
  without a `caseId` still inserts (this is the regression guard for decision 1).
- An `Alert` can exist **unlinked** (no case yet), then be adopted by a case
  later. This is the normal intake order, so the nullable link must work both ways.
- **Foreign keys actually bite:** creating a `Case` with a non-existent
  `customerId` is rejected by Postgres, not silently accepted.
- `Case.dueAt` round-trips as written, independent of any policy maths.

Deliberately not tested: HTTP status codes, route plumbing, and anything asserting
UI behaviour. Per `coding-standards.md`, those are not this project's test scope.

Regression gate: the 6 existing suites / 40 tests must stay green and unmodified
at every step. They cover the sacred banking and auth paths.

## Notes for the AI

- **Additive only.** No column is dropped, renamed, or retyped. Every existing
  model change is a new back-relation array, which Prisma requires but which is
  inert at runtime. If a step ever needs to alter an existing column, stop and
  raise it: that is far more likely to be a mistake than a requirement.
- `pnpm`, never `npm` (see Commands in `AGENTS.md`; a stray `package-lock.json`
  exists and is unused).
- `pnpm lint` is broken and is not a gate. Do not run it, do not quote its output,
  and do not try to fix it in this feature.
- Table names follow the existing schema's plain plural convention (`queues`,
  `cases`, `alerts`, `tasks`, `sla_policies`). `cases` is not reserved in
  PostgreSQL and Prisma quotes identifiers, so no prefix is needed.
- Do not register the module in `src/app.ts`. This feature ships no HTTP surface.
- Money is never involved in the Work layer, so no `Decimal` fields are expected.
- If any step's diff grows past roughly 150 lines of schema, split it rather than
  asking the reviewer to squint.

## Verification evidence

Recorded by `/complete` on 2026-09-27. There is no `verify` package script, so
the fallback gate applies.

| Check | Command | Result |
|---|---|---|
| Schema valid | `pnpm exec prisma validate` | valid |
| Migrations applied | `pnpm exec prisma migrate status` | 15 migrations, up to date |
| Type-check + build | `pnpm build` | `tsc` clean, exit 0 |
| Tests | `pnpm test` | 7 files, 46/46 passed (40 pre-existing untouched, 6 new) |
| Tests repeatable | `pnpm test` (2nd run) | 46/46 again |
| Ledger reconcile | `pnpm db:reconcile` | clean, 1 wallet, platform in balance |

Sacred paths confirmed byte-identical to the pre-feature commit: `app.ts`,
`services/ledger.service.ts`, `services/aml.service.ts`, `modules/transfer/`,
`modules/deposit/`, `modules/withdraw/`, `modules/webhook/`, `modules/auth/`.

No findings were recorded, no independent review was requested, and
`qualityGates.regular` is `manual` across all four gates, so no audit, check, or
try guide was required for this item.
