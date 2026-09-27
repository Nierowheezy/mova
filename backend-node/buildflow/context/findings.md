# Findings

> **Generated file.** The findings ledger: review findings raised by `/audit`
> against the work in progress, each with a durable ID, severity (P0-P3), and
> status. `/implement` marks repaired findings `fixed`, a later `/audit` pass
> moves them to `closed`, and `/complete` refuses to merge while any P0 or P1
> finding is `open` or `fixed`, then archives resolved findings with the work
> and resets this file.

### F-01 [P2] open - An unknown role value crashes the permission check instead of denying cleanly

**File:** src/modules/operations/rbac/permissions.ts:169
**Found:** 2026-09-27 by /audit (scope: current; lens: security, quality)
**Why it matters:** `hasPermission` indexes `ROLE_PERMISSIONS[role]` and calls
`.includes` on the result. `Record<UserRole, ...>` makes a missing entry a
compile error, but the *database* is not covered by that guarantee. When the
database holds a role this build does not know - a migration applied before the
code that knows the new roles during a rolling deploy, or a value added by
direct SQL - the lookup returns `undefined` and throws a `TypeError`.

Reproduced against this build:
`ROLE_PERMISSIONS["TREASURY_OFFICER"]` is `undefined`, and
`hasPermission("TREASURY_OFFICER", "case.view")` throws
`Cannot read properties of undefined (reading 'includes')`.

Inside `requirePermission` that rejection reaches the Express 5 error handler
and the caller gets a `500 INTERNAL_ERROR` rather than a `403 FORBIDDEN`. It
fails closed, so this is not a privilege escalation, and the test suite would
still pass. The cost is a misleading status code, a `console.error` stack per
occurrence, and any operations route becoming unavailable for those users.
**Suggested fix:** make the lookup total. Either narrow in
`permissionsFor`/`hasPermission` with a guard, or have `authorize` treat an
absent role as a denial. A test that calls `hasPermission` with an unknown
string would then pin it.

### F-02 [P2] open - The last ADMIN can demote themselves and permanently lock the admin API

**File:** src/modules/admin/controllers/user.controller.ts:124
**Found:** 2026-09-27 by /audit (scope: current; lens: security)
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
**Suggested fix:** reject demoting the last remaining ADMIN, with a distinct
error code so an operator can tell it apart from a plain permission failure.

### F-03 [P3] open - New denials bypass the prescribed AppError path, and that path is wrong for denials

**File:** src/shared/middleware/permission.middleware.ts
**Found:** 2026-09-27 by /audit (scope: current; lens: quality)
**Why it matters:** `coding-standards.md:49` says throwing `AppError` is the way
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
**Suggested fix:** keep the direct responses and record the carve-out in
`coding-standards.md` - a denial is a decision, not an exception. A shared
`deny(res, status, code, message)` helper in `shared/middleware` would also stop
the envelope being hand-written in three places.

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

**Checked and deliberately not raised:** a frozen account (`User.isFrozen`) is
not blocked by `authenticate` or by the new guards. `docs/06-transfers.md:73-74`
and `docs/03-request-lifecycle.md:47` scope frozen checks to transfer
destination rules (`403 ACCOUNT_FROZEN`, `403 RECEIVER_FROZEN`), and
`docs/03-request-lifecycle.md:68` shows `isFrozen` surfaced in responses. Frozen
is a money-movement constraint, not an access revocation, so a frozen customer
still being able to sign in and read their account is intended. The one genuine
open question is narrower: should a frozen *staff* account be denied
`action.execute`? That belongs to Feature 8, which owns controlled actions.
