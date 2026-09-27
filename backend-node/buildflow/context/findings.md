# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-01 [P2] fixed - An unknown role value crashes the permission check instead of denying cleanly

**File:** src/modules/operations/rbac/permissions.ts:169; src/shared/middleware/permission.middleware.ts:61
**Found:** 2026-09-27 by /audit (scope: current; lens: security, quality)
**Fixed:** 2026-09-27 on audit/auth-authorization
**Why it matters:** `hasPermission` indexes `ROLE_PERMISSIONS[role]` and calls
`.includes` on the result. `Record<UserRole, ...>` makes a missing entry a
compile error, but the *database* is not covered by that guarantee. When the
database holds a role this build does not know - a migration applied before the
code that knows the new roles during a rolling deploy, or a value added by
direct SQL - the lookup returns `undefined` and throws a `TypeError`.

**Corrected root cause (found while fixing):** the audit's reproduction was
incomplete. The `TypeError` in `hasPermission` was real, but it was not the
first thing to throw. `authorize` read the role with
`prisma.user.findUnique({ select: { role: true } })`, and the generated client
*throws* on a column value its own enum type does not declare - confirmed by
reading a user whose role was set to an undeclared label. So the failure was a
`PrismaClientUnknownRequestError` from the lookup, not the permission check,
and it landed outside any guard. That is worse than reported: the 500 came
from the read, so fixing only `permissionsFor` would have left the bug in place.

**Fix (two parts):**
1. `permissionsFor` is now total and throws `AppError(..., 403, "UNKNOWN_ROLE")`.
2. `authorize` reads the role as text via `$queryRaw` instead of through the
   typed client, so an undeclared role reaches the policy check rather than
   failing the read. This also keeps the two failure modes apart: a database
   outage still surfaces as an error, while an unclassifiable role is answered
   as the policy decision it is.

The `AppError` is caught in `authorize` and answered as a direct 403 with a
structured pino `warn` log (`event: "unknown_role"`, `role`, `userId`), not
routed through `errorHandler` - see F-03.
**Tests:** 4 new cases in `tests/rbac.integration.test.ts` under "a role value
this build does not know", including the `ALTER TYPE` reproduction and the
`requireAdmin` fail-closed check.

### F-02 [P2] fixed - The last ADMIN can demote themselves and permanently lock the admin API

**File:** src/modules/admin/services/user.service.ts:146
**Found:** 2026-09-27 by /audit (scope: current; lens: security)
**Fixed:** 2026-09-27 on audit/auth-authorization
**Why it matters:** `changeUserRole` checks only that the new value is a valid
`UserRole` and that the caller is an ADMIN. Nothing prevents the sole ADMIN from
demoting themselves. Promoting anyone back to ADMIN requires the same endpoint,
which then requires an ADMIN, so the lockout is permanent from inside the API.
The only recovery path is running `scripts/seed-admin.ts` by hand against the
database.

This is pre-existing - the endpoint and its hardcoded role list predate this
feature - but it sits squarely in the authorization path this feature owns, and
this feature is what made the role-change API properly reachable and tested. The
dev database currently holds exactly one ADMIN, so the scenario is one request
away. Pre-existing does not mean not worth fixing; it means it is not a
regression introduced here.
**Fix:** `changeUserRole` now refuses to demote the last remaining ADMIN with
`400 LAST_ADMIN_CANNOT_BE_DEMOTED`. The guard
counts ADMINs only when the target is currently an ADMIN and the new role is not,
so promoting a user to ADMIN and moving a non-admin between staff roles stay
open. Deliberately minimal: no "promote another admin first" flow, which is
Feature 13.
**Tests:** 6 new cases in `tests/rbac.integration.test.ts` under "demoting the
last remaining ADMIN".

### F-03 [P3] fixed (standard amended) - New denials bypass the prescribed AppError path, and that path is wrong for denials

**File:** src/shared/middleware/permission.middleware.ts
**Found:** 2026-09-27 by /audit (scope: current; lens: quality)
**Fixed:** 2026-09-27 on audit/auth-authorization - standard amended, code unchanged
**Why it matters:** `coding-standards.md:49` said throwing `AppError` is the way
to fail, with the central `errorHandler` mapping it to the response envelope.
`errorHandler` maps `AppError` to a byte-identical
`{ success: false, error: { code, message } }`, so the response is not the issue.
The issue is that `errorHandler:13` also runs
`console.error(\`[ERROR] ${err.stack || err.message}\`)` for *every* `AppError`.
Routing routine 401s and 403s through it would emit a full stack trace for each
denied request, turning a normal authorization decision into a logged error.

The new code therefore follows the neighbouring `auth.middleware.ts` and the
previous `admin.middleware.ts` rather than the written standard, which is the
right call, but the standard and the code now disagree and nothing records why.
**Fix:** `coding-standards.md` now separates the two contracts. `AppError` +
`errorHandler` is for *unexpected* or *exceptional* failures; routine
authorization denials write the envelope directly, log at `warn` through
`getChildLogger` with structured fields, and emit no stack. The standard also
records that denials still carry a machine-readable code (`FORBIDDEN` vs
`UNKNOWN_ROLE`) so an operator can tell a policy denial from a deployment behind
its own migration. The middleware code was already correct and was not changed
for this finding.

### F-04 [P3] open - Four new exports have no production caller, and requireSupport guards no route

**File:** src/modules/operations/rbac/permissions.ts
**Found:** 2026-09-27 by /audit (scope: current; lens: quality)
**Why it matters:** `isStaffRole`, `permissionsFor`, `STAFF_ROLES`, and
`requireRoles` have no caller in `src/` outside their own module and tests.
`requireRoles` exists only to build `requireSupport`, and `requireSupport` is
exported but guards no route - also pre-existing.

This is deliberate rather than accidental: the spec calls for the helpers, and
Feature 3 is the intended consumer for all of them. Recording it so a later
cleanup does not delete an API that the next feature is about to need. Note the
`requireSupport` state is now pinned by tests, so a future reader can see the
empty-caller situation is a choice rather than an oversight.
**Suggested fix:** none needed for this feature. If Feature 3 does not consume
`STAFF_ROLES` and `permissionsFor`, delete them then rather than carrying unused
exports forward.

### F-05 [P2] fixed - COMPLIANCE_OFFICER held no scoped resolve actions because it lacked case.resolve

**File:** src/modules/operations/rbac/permissions.ts:135
**Found:** 2026-09-27 while landing the resolve-action policy map
**Fixed:** 2026-09-27 on audit/auth-authorization
**Why it matters:** The permission matrix gave `COMPLIANCE_OFFICER` `case.escalate`
but not `case.resolve`, while the product decision requires it to perform
`SAR_FILED`, `REFER_TO_LAW_ENFORCEMENT`, and `CLOSE_NO_ACTION`. Without
`case.resolve` the role cannot reach the resolve endpoint at all, so its entire
action set would have been unreachable policy - the one role that can file a SAR
being structurally unable to do so.

The spec's own permission table (`current-feature.md:164`) omitted
`COMPLIANCE_OFFICER` from the `case.resolve` row, so the matrix was a faithful
implementation of a table that contradicted the decision it was derived from.
**Fix:** added `case.resolve` to `COMPLIANCE_OFFICER` in the matrix and corrected
the spec table. Caught by the new cross-map invariant test in
`tests/unit/actions.test.ts` ("never grants an action to a role that lacks
case.resolve"), which is exactly the drift the two maps were at risk of.

**Checked and deliberately not raised:** a frozen account (`User.isFrozen`) is
not blocked by `authenticate` or by the new guards. `docs/06-transfers.md:73-74`
and `docs/03-request-lifecycle.md:47` scope frozen checks to transfer
destination rules (`403 ACCOUNT_FROZEN`, `403 RECEIVER_FROZEN`), and
`docs/03-request-lifecycle.md:68` shows `isFrozen` surfaced in responses. Frozen
is a money-movement constraint, not an access revocation, so a frozen customer
still being able to sign in and read their account is intended. The one genuine
open question is narrower: should a frozen *staff* account be denied
`action.execute`? That belongs to Feature 8, which owns controlled actions.
