# Coding Standards

> Mintbank backend conventions. Tuned to the real stack: Express 5 + TypeScript +
> Prisma + PostgreSQL. Read before changing code.

## What this is

Mintbank is an internal bank-operations platform built **on top of** the existing
Mova banking backend. This directory is the whole product; the frontend lives in
`../frontend` as a separate stack with its own BuildFlow.

## TypeScript

- Strict mode enabled
- No `any` types - use proper typing or `unknown`
- `Decimal` from Prisma is used for all money; never convert to `number` for arithmetic
- Existing controllers return `Promise<any>` from Express handlers. Match that in
  new controllers rather than refactoring existing ones in the same diff.

## Module layout

One folder per domain under `src/modules/<domain>/`:

```
src/modules/<domain>/
  <domain>.routes.ts       Router, middleware chain, Swagger JSDoc
  <domain>.controller.ts   Class, thin, no business logic
  <domain>.service.ts      Business logic, Prisma access
  dto/                     Zod schemas, one per operation
```

Variations that exist in the codebase and are fine to follow:

- `admin/` splits into `controllers/`, `services/`, `dto/` because it spans several
  sub-domains.
- `services/` holds cross-module services (ledger, aml, sanctions) that more than
  one module calls. A service used by a single module stays inside that module.

## Routing and controllers

- Routes are mounted in `src/app.ts`. Webhook routes are registered **before**
  `express.json()` because Stripe signature verification needs the raw body.
- Every route handler is bound: `controller.method.bind(controller)`.
- Guard order is `authenticate` then role guard then `validate(Schema)`.
- Response envelope is the only shape controllers return:
  - success: `{ success: true, data }`
  - failure: `{ success: false, error: { code } }`
- Handlers `return` the response. No fallthrough.
- `AppError` (`src/shared/utils/AppError.ts`) + the central `errorHandler` is the
  contract for *unexpected* or *exceptional* failures: validation, auth token
  failures, server errors, broken invariants. The handler maps it to the envelope.
- **Routine authorization denials do not use `AppError`.** A `403` meaning "your
  role does not allow this" is a decision, not an exception. The guard writes the
  envelope directly, logs at `warn` through `getChildLogger` with structured
  fields (`event`, `role`, `userId`), and emits no stack; `errorHandler` remains
  the fallback. It runs `console.error(err.stack)` for every `AppError`, so
  routing ordinary denials through it would flood the log pipeline and
  desensitise real errors.
- Denials still use a machine-readable code. `FORBIDDEN` for "role lacks the
  permission", `UNKNOWN_ROLE` for "this build has no row for the role in the
  database", so an operator can tell a policy denial from a deployment that is
  behind its own migration.
- User scoping comes from `req.user?.userId`, never from a client-supplied id.
- Document every new route with the Swagger JSDoc block the neighbouring routes
  use, so `src/config/swagger.ts` stays accurate.

## Validation

- Zod for every request body, query, and param.
- Schemas live in the module's `dto/` folder, named `<verb>-<noun>.dto.ts`
  (for example `review-flag.dto.ts`, `change-tier.dto.ts`).
- Parse through the `validate` middleware, not ad hoc inside the controller.

## Database

- Prisma for all data access. `prisma migrate dev` for schema changes, never
  `db push`. `prisma migrate deploy` in production.
- **Table and column names are `snake_case`** via `@@map` and `@map`. Every field
  in `prisma/schema.prisma` follows this; a new model that skips it is wrong.
- Primary keys are `Int @id @default(autoincrement())`, except where a
  human-quotable public id is needed, which is a separate `uuid` column
  (see `Transaction.reference`, `SavingsGoal.uuid`).
- Money is `Decimal @db.Decimal(12, 2)`.
- Index the columns you filter and sort on. Queue and work-list queries are the
  hot paths in this product.
- Relations to banking entities use **explicit nullable foreign keys**, not a
  generic `(entityType, entityId)` pair. Real FK constraints are worth more here
  than schema flexibility, because referential integrity is a regulatory
  requirement.
- Enums live at the top of the schema with a comment explaining each value.

## Sacred code

These paths hold money-movement and identity logic. **Do not change their
business logic** as part of adding the operations layer:

- `src/services/ledger.service.ts` and the `LedgerAccount` / `LedgerEntry` models
- `src/modules/transfer/`, `src/modules/deposit/`, `src/modules/withdraw/`
- `src/modules/webhook/` (Stripe)
- `src/modules/auth/` (JWT, refresh, 2FA)

`LedgerEntry` rows are append-only and must never be updated or deleted. The
operations layer **reads** banking data; it never writes to it.

## Error handling and logging

- `AppError` with a machine-readable `code`, thrown from the service layer.
- Structured `logger` from `src/shared/utils/logger.middleware.ts`. No
  `console.log` in `src/`.
- Never log secrets: tokens, passwords, transaction PINs, encryption keys, or
  raw KYC document paths.

## Testing

A test runner is configured, so **tests are a gate for logic-bearing steps**, not
an optional extra. See the Commands section of `AGENTS.md` for the exact command.

- Runner is Vitest. `pnpm test` runs everything; `pnpm test:watch` for a loop.
- Tests live in `tests/`, not next to source. Integration tests are
  `tests/*.integration.test.ts`; unit tests are `tests/unit/*.test.ts`.
- `tests/globalSetup.ts` runs `prisma migrate reset --force` against
  `TEST_DATABASE_URL` (default `mintbank_test` on port 5433) before every run.
  **Never point `TEST_DATABASE_URL` at your dev database.**
- `fileParallelism` is off so suites share one database deterministically. Do not
  re-enable it without isolating per-suite databases.
- What to test: pure logic where a wrong answer is possible - validation,
  permissions, SLA deadline maths, status transitions, sanitisation.
- What not to test: HTTP plumbing that merely returns 200. Assert on state and
  side effects instead.
- **The existing suite is the regression gate for the sacred code above.** Run
  `pnpm test` after any change that touches banking, auth, or the ledger, and
  treat a failure there as a stop, not something to work around.
- This is a backend. There is no browser-test harness; do not add one for a
  schema or API change. `/browser-tests` owns that decision.

## Verification order

`build` (tsc) then `test`. `pnpm db:reconcile` additionally proves the ledger
still reconciles, and CI runs it too. Use it when a change could plausibly have
touched money movement.

## Code Quality

- No commented-out code unless specified
- No unused imports or variables
- Keep functions under 50 lines when possible

## Comments

Write code that explains itself; comment only what the code cannot say.
Over-commenting is a common AI tell, so resist it.

- Comment the **why**, not the **what**. Delete any comment that restates the code.
- No banner/header blocks, section dividers, or step-by-step narration of obvious
  code. A file does not need a comment announcing each region.
- A comment earns its place only when it captures something the code can't: a
  non-obvious decision, a gotcha or workaround, why a value is what it is, or a
  link to a spec or issue.
- Prefer self-documenting names and small functions over explanatory comments.
- Keep doc comments minimal: a one-line purpose on an exported type or function is
  plenty; don't write JSDoc that just repeats the signature.
- When in doubt, leave the comment out.

## Writing

- No em dashes (U+2014) in generated content: docs, comments, commit messages,
  READMEs, specs. They read as AI-generated.
- Use a hyphen for `term - description` separators; rephrase prose with commas,
  parentheses, or a colon. Avoid en dashes and the ellipsis character too.
