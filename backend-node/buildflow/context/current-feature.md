# Feature: Role-Based Access Control

**From build-plan:** feature 2
**Status:** in progress

## Goal

Give the seven operational staff roles real, enforceable permissions, so that
`Case.assigneeId` and the audit actor name someone who is actually allowed to do
the work. Today `UserRole` is `USER | ADMIN | SUPPORT`, which cannot express "a
Fraud Analyst may clear an alert but may not change a user's role."

This feature defines **who may do what** and the middleware that enforces it. It
adds no operations endpoints; Feature 3 applies the permissions to real routes.

## Design reference

None. Not a visual feature, and there is no mockup to match.

## Decisions that need your sign-off

| # | Question | My default | Why |
|---|---|---|---|
| 1 | Rename `ADMIN` / `SUPPORT` to match the plan's role names? | **No - keep both, add five new values** (8 total) | Renaming means `ALTER TYPE ... RENAME VALUE` plus edits to `admin.middleware.ts` and live data, for vocabulary alignment only. The mapping is `ADMIN` = Administrator, `SUPPORT` = Customer Service. `USER` is a bank *customer* and is not one of the seven staff roles. |
| 2 | Where do permissions live? | **A TypeScript constant matrix**, the single source of truth | Runtime-editable roles are Feature 13's "role management and permissions matrix" UI. A DB-backed matrix now would need a cache-invalidation story before any UI exists to justify it. `Record<UserRole, ...>` makes the compiler enforce that every role is mapped. |
| 3 | Is the role read from the JWT or the database per request? | **Database per request** | Matches what `requireAdmin` already does. A JWT-carried role would keep granting access after an admin demotes or deactivates a compromised staff account, until the token expires. Correctness for a security control beats saving one query. |
| 4 | Do customers (`USER`) get any permission? | **No. Explicitly zero, and tested** | The seven roles are all internal staff. A customer must fail every operations permission, and a future bug that grants one is a privilege-escalation bug. |

## In scope

- Widen `UserRole` with `OPERATIONS_MANAGER`, `FRAUD_ANALYST`, `KYC_REVIEWER`,
  `LOAN_OFFICER`, `COMPLIANCE_OFFICER`, plus a migration.
- Make the new roles assignable through the existing admin API. Today
  `user.controller.ts:115` hardcodes `["USER","ADMIN","SUPPORT"]`, so widening
  the enum alone would leave the new roles settable only by direct SQL.
  The check becomes `Object.values(UserRole).includes(role)` so it tracks the
  enum instead of drifting from it.
- A `Permission` string-union vocabulary, and a `ROLE_PERMISSIONS` matrix.
- `hasPermission(role, permission)` and `isStaffRole(role)` as pure functions.
- A `requirePermission(permission)` middleware that reads the role per request.
- Express the existing `requireAdmin` / `requireSupport` in terms of that matrix,
  with **byte-identical behaviour** (only `ADMIN`; and `ADMIN` or `SUPPORT`).
- Tests: matrix integrity, middleware allow/deny per role, admin endpoint
  accepts a new role, existing admin routes unchanged.
- A role/permission reference in `src/modules/operations/README.md`.

## Out of scope

- **Operations endpoints.** Feature 3. This feature ships the enforcement
  mechanism and proves it on the existing admin routes.
- **Admin-editable roles and permissions.** Feature 13.
- **Customer 360 and analytics permission wiring.** Features 4 and 12 consume
  permissions this feature defines.
- **Enforcing that `Case.assigneeId` is a staff user.** The database cannot
  constrain it, and there is no case-write API until Feature 3. Flagged there as
  an application-level validation.
- **Seeding staff accounts.** No dev seed data exists; `scripts/seed.ts` is
  currently zero bytes and fixing it is separate work.
- **Auditing role changes to include the new roles.** `AuditLog.action` already
  records the old behaviour; the vocabulary is deliberately unlocked and belongs
  to Feature 8 (Controlled Action Workflow).

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at
   the end.

Never accept a step you haven't read. If a diff is too big to review, the step
was too big, so split it.

## Build steps

- [x] **Step 1 - widen `UserRole` and make the roles assignable** - add the five
  operational role values with a migration, and replace the hardcoded
  `["USER","ADMIN","SUPPORT"]` check in `changeUserRole` with an enum-derived
  check. *Done when:* `prisma validate` passes; the migration applies to
  `mintbank_dev` and `mintbank_test`; `pnpm build` and `pnpm test` pass;
  `PUT /api/v1/admin/users/:id/role` accepts `FRAUD_ANALYST` and still rejects
  `"SUPERUSER"` with 400 `INVALID_ROLE`; and an integration test proves both.

- [x] **Step 2 - define the permission vocabulary and matrix** -
  `Permission` union, `ROLE_PERMISSIONS` matrix, `hasPermission`, `isStaffRole`,
  and the reference table in the module README. *Done when:* the compiler rejects
  the file if any `UserRole` is missing from the matrix (delete a row and
  `tsc` fails); unit tests prove every matrix value is a declared `Permission`,
  that `ADMIN` holds every permission, that `USER` holds none, that all seven
  staff roles are flagged by `isStaffRole` while `USER` is not, and that
  `hasPermission` is symmetric with the matrix.

- [x] **Step 3 - `requirePermission` middleware** - a middleware that reads the
  role per request, plus `requireAdmin` / `requireSupport` re-expressed through
  the matrix. *Done when:* the middleware returns 401 with no authenticated
  user, 403 `FORBIDDEN` when the role lacks the permission, and calls `next()`
  when it has it; and new tests pin `requireAdmin` to exactly `{ADMIN}` and
  `requireSupport` to exactly `{ADMIN, SUPPORT}`. Note there is **no** existing
  admin coverage to fall back on, so these tests are the safety net, not a
  confirmation of one.

## Files / areas

**Create**

- `src/modules/operations/rbac/permissions.ts` - `Permission` vocabulary,
  `ROLE_PERMISSIONS`, `hasPermission`, `isStaffRole`, `permissionsFor`
- `tests/unit/permissions.test.ts` - matrix integrity
- `src/shared/middleware/permission.middleware.ts` - `requirePermission`,
  `requireRoles`, shared `authorize`
- `tests/rbac.integration.test.ts` - role-assignment API and guard behaviour

**Change**

- `prisma/schema.prisma` - five `UserRole` values (additive)
- `prisma/migrations/20260927145421_widen_user_roles/` - new migration
- `src/modules/admin/controllers/user.controller.ts` - enum-derived role check
- `src/modules/admin/services/user.service.ts` - `UserRole` instead of
  `role: string` plus an `as any` cast
- `src/shared/middleware/admin.middleware.ts` - delegate to the matrix
- `src/modules/operations/README.md` - role/permission reference

**Deviations from the original plan, and why**

1. The unit test went to `tests/unit/permissions.test.ts`, not
   `src/modules/operations/rbac/permissions.test.ts`. `vitest.config.ts` sets
   `include: ["tests/**/*.test.ts"]`, so a test under `src/` would never have run
   - it would have looked like coverage and been dead weight.
2. The middleware went to `src/shared/middleware/permission.middleware.ts`, not
   inside the operations module. It is generic infrastructure and is imported by
   `shared/middleware/admin.middleware.ts`; `shared/` importing from a feature
   module inverts the dependency direction.
3. `requireSupport` is an explicit role set, not a permission. No permission in
   the matrix has exactly `{ADMIN, SUPPORT}` as its holders - `case.resolve`, the
   closest, is also held by four operational roles, and using it would have
   opened the admin routes to the entire operations team. `requireAdmin` *is* a
   permission (`permission.manage`, ADMIN-only), with a test that fails if the
   matrix ever widens it.

**Must not change**

- `src/modules/auth/` - JWT signing and verification are sacred
- `src/config/jwt.ts` - `JwtPayload` stays `{ userId, email }`
- ledger, transfer, deposit, withdraw, webhook, and `src/app.ts`

## Data / contracts

**`UserRole` (widened, additive):** `USER`, `ADMIN`, `SUPPORT`,
`OPERATIONS_MANAGER`, `FRAUD_ANALYST`, `KYC_REVIEWER`, `LOAN_OFFICER`,
`COMPLIANCE_OFFICER`. `USER` is a bank customer, not staff.

**`Permission` - load-bearing, locked here.** Later features consume these
strings, so they are `verb.noun` and never renamed without a plan edit.

| Permission | Grants | Held by |
|---|---|---|
| `queue.view` | see queues and case counts | all staff |
| `queue.manage` | create, edit, deactivate queues; set default SLA | OPERATIONS_MANAGER, ADMIN |
| `case.view` | see cases | all staff |
| `case.assign` | assign or reassign a case or task | OPERATIONS_MANAGER, FRAUD_ANALYST, ADMIN |
| `case.resolve` | resolve with a recorded reason | OPERATIONS_MANAGER, FRAUD_ANALYST, KYC_REVIEWER, LOAN_OFFICER, SUPPORT, ADMIN |
| `case.escalate` | escalate out of the queue | OPERATIONS_MANAGER, FRAUD_ANALYST, COMPLIANCE_OFFICER, ADMIN |
| `alert.view` | the "Needs Attention" stream | OPERATIONS_MANAGER, FRAUD_ANALYST, KYC_REVIEWER, COMPLIANCE_OFFICER, SUPPORT, ADMIN |
| `alert.acknowledge` | triage an alert into a case | OPERATIONS_MANAGER, FRAUD_ANALYST, KYC_REVIEWER, ADMIN |
| `kyc.review` | decide a KYC application | KYC_REVIEWER, ADMIN |
| `loan.review` | decide a loan application | LOAN_OFFICER, ADMIN |
| `customer.view` | Customer 360 | all staff |
| `action.execute` | controlled actions: freeze, block, clear an AML flag | FRAUD_ANALYST, COMPLIANCE_OFFICER, ADMIN |
| `audit.view` | read the audit trail | OPERATIONS_MANAGER, COMPLIANCE_OFFICER, ADMIN |
| `report.view` | analytics and reporting | OPERATIONS_MANAGER, COMPLIANCE_OFFICER, ADMIN |
| `user.role.manage` | change a user's role | ADMIN |
| `permission.manage` | manage the permission matrix | ADMIN |

`ADMIN` holds all sixteen. `USER` holds none.

**Shape of the module:**

```ts
export type Permission = "queue.view" | /* ... */ "permission.manage";

// Compile error if a role is ever added without a matrix entry.
export const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>>;

export function hasPermission(role: UserRole, permission: Permission): boolean;
export function isStaffRole(role: UserRole): boolean;
```

**Error contract, unchanged from today's middleware:** 401
`{ code: "UNAUTHORIZED" }` when `req.user` is absent, 403
`{ code: "FORBIDDEN" }` when the role lacks the permission. Success is
`next()` with no body, so it composes on a route without shaping a response.

## Testing

A test runner is configured (`pnpm test`, 46 tests before this feature), so every
logic-bearing step ships its test.

- **Step 1** - `tests/rbac.integration.test.ts`: `PUT
  /api/v1/admin/users/:id/role` accepts `FRAUD_ANALYST` and persists it; an
  unknown role returns 400 `INVALID_ROLE`; `USER` and `ADMIN` still work.
  Proves the enum-derived check, which is the step's actual risk. Reaching the
  route at all requires authenticating as an `ADMIN`, so this step also creates
  the **first ever coverage of the admin authorization path** - the admin module
  currently has none.
- **Step 2** - `permissions.test.ts`: every matrix entry is a declared
  `Permission`; `ADMIN` holds all; `USER` holds none; the seven staff roles are
  all `isStaffRole`; `hasPermission` agrees with the matrix for every
  role/permission pair, so the two cannot drift.
- **Step 3** - middleware tests over a real Express app: 401 unauthenticated,
  403 for a role without the permission, `next()` for a role with it, and
  `requireAdmin` / `requireSupport` admitting exactly their previous sets.

Gate per step: `prisma validate`, `pnpm build`, and `pnpm test` at or above the
current 46 passing, with **no pre-existing test file modified**. There is no
browser surface, so no browser tests.

## Notes for the AI

- **Server-side only.** This is an enforcement mechanism on the API. Never trust
  a role or permission supplied by the client; both come from the database.
- **The role is read from the database per request**, matching `requireAdmin`.
  Do not add `role` to `JwtPayload` - a stale token would keep granting access
  after a demotion. `src/config/jwt.ts` is sacred.
- **Preserve `requireAdmin` / `requireSupport` behaviour exactly.** `requireAdmin`
  must still admit only `ADMIN`; `requireSupport` only `ADMIN` and `SUPPORT`.
  Refactoring them through the matrix is the point, but a behaviour change here
  is a security regression, not a refactor. Add a test that pins the old sets.
- **`requireSupport` is currently unused** by any route, so changing it has no
  live blast radius today. It is still pinned by test, because
  `requireSupport` is exported and a later feature will route through it.
- **Schema naming is load-bearing**: columns `snake_case` via `@map`, tables via
  `@@map`. Enum values are unchanged in style: `SCREAMING_SNAKE_CASE`.
- **Enum widening is additive.** The migration is `ALTER TYPE "UserRole" ADD
  VALUE`. PostgreSQL 12+ allows it in a transaction, but a value added in a
  migration cannot be *used* in the same migration, so do not insert a row with
  a new role in the same file.
- **Read `UserRole` from `@prisma/client`, not a hand-written string union**, so
  the matrix stays exhaustive when the enum grows.
- Match existing module layout: controller / service / dto under `src/modules/`,
  middleware under `src/shared/middleware/`, Zod validation via the existing
  `validate` middleware, Swagger JSDoc on any new route (there should be none).
- This is auth-adjacent code. The configured quality gates are all `manual`, so
  no audit runs automatically. Consider `/audit` before merging.
