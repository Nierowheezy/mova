import { UserRole } from "@prisma/client";
import { AppError } from "../../../shared/utils/AppError";

/**
 * The permission vocabulary. Load-bearing: later features (3, 4, 8, 12) consume
 * these exact strings, so a rename is a breaking contract change and belongs in
 * a plan edit, not a refactor.
 *
 * Shape is `verb.noun`, singular, lower-case. One permission means one decision
 * a member of staff may take; if you find yourself wanting a compound like
 * `case.assign_or_escalate`, it is really two permissions.
 *
 * The array is the source of truth and the type is derived from it, so the
 * runtime list and the compile-time union cannot drift apart.
 */
export const PERMISSIONS = [
  // Work layer: queues and cases
  "queue.view",
  "queue.manage",
  "case.view",
  "case.assign",
  "case.resolve",
  "case.escalate",
  // Needs Attention stream
  "alert.view",
  "alert.acknowledge",
  // Specialist decisions
  "kyc.review",
  "loan.review",
  // Shared context
  "customer.view",
  // Controlled actions (feature 8: freeze, block, clear an AML flag)
  "action.execute",
  // Oversight
  "audit.view",
  "report.view",
  // Administration of the roles themselves
  "user.role.manage",
  "permission.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Who may do what.
 *
 * Roles are a stored fact on the user row; permissions are policy, and policy
 * belongs in reviewable code rather than in a database column nobody can diff.
 * Runtime-editable roles are feature 13's job, and it can override this.
 *
 * Typed as `Record<UserRole, ...>` deliberately: adding a value to the Prisma
 * enum without adding a row here is a compile error, not a silent gap where a
 * new role quietly has no permissions.
 *
 * Frozen at runtime, not just by type. `Readonly<Record<...>>` stops the
 * compiler from assigning to the outer object but does nothing about a caller
 * that kept a reference to one of the arrays, and a policy that can be widened
 * at runtime is not a policy.
 *
 * The matrix is the contract. Two properties hold it together and are tested in
 * tests/unit/permissions.test.ts:
 *   - ADMIN holds every permission, so an administrator is never blocked.
 *   - USER (a bank *customer*, not staff) holds nothing at all.
 */
const MATRIX = {
  // A customer of the bank. Not one of the seven staff roles. This must stay
  // empty: a customer granted any operations permission is a privilege
  // escalation, not a configuration choice.
  USER: [],

  // The plan's "Customer Service". Reads work, resolves it, and does not assign
  // it - allocation is a manager's call, not a support agent's.
  SUPPORT: [
    "queue.view",
    "case.view",
    "case.resolve",
    "alert.view",
    "customer.view",
  ],

  // The plan's "Administrator". Full access, including the two permissions that
  // change other people's access.
  ADMIN: PERMISSIONS,

  // The primary persona: sees exceptions across every team, allocates the work,
  // and watches the SLA clock.
  OPERATIONS_MANAGER: [
    "queue.view",
    "queue.manage",
    "case.view",
    "case.assign",
    "case.resolve",
    "case.escalate",
    "alert.view",
    "alert.acknowledge",
    "customer.view",
    "audit.view",
    "report.view",
  ],

  // Investigates alerts with full context and makes the controlled calls.
  FRAUD_ANALYST: [
    "queue.view",
    "case.view",
    "case.assign",
    "case.resolve",
    "case.escalate",
    "alert.view",
    "alert.acknowledge",
    "customer.view",
    "action.execute",
  ],

  // Decides KYC against a 48h SLA.
  KYC_REVIEWER: [
    "queue.view",
    "case.view",
    "case.resolve",
    "alert.view",
    "alert.acknowledge",
    "customer.view",
    "kyc.review",
  ],

  // Checks DBR and policy limits on loan applications.
  LOAN_OFFICER: [
    "queue.view",
    "case.view",
    "case.resolve",
    "customer.view",
    "loan.review",
  ],

  // Receives escalations and is accountable to the audit trail. Holds
  // `case.resolve` because filing a SAR is how a case is closed: without it the
  // Compliance action set would be unreachable policy.
  COMPLIANCE_OFFICER: [
    "queue.view",
    "case.view",
    "case.resolve",
    "case.escalate",
    "alert.view",
    "customer.view",
    "action.execute",
    "audit.view",
    "report.view",
  ],
} satisfies Record<UserRole, readonly Permission[]>;

/** The public view. `satisfies` above is what enforces role coverage. */
export const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>> = Object.freeze(
  Object.fromEntries(
    Object.entries(MATRIX).map(([role, permissions]) => [role, Object.freeze(permissions)]),
  ) as Record<UserRole, readonly Permission[]>,
);

/** The seven internal staff roles. `USER` is a customer and is excluded. */
export const STAFF_ROLES = [
  "SUPPORT",
  "ADMIN",
  "OPERATIONS_MANAGER",
  "FRAUD_ANALYST",
  "KYC_REVIEWER",
  "LOAN_OFFICER",
  "COMPLIANCE_OFFICER",
] as const satisfies readonly UserRole[];

export function isStaffRole(role: UserRole): boolean {
  return role !== "USER";
}

/**
 * The permissions a role holds.
 *
 * Throws `AppError(..., 403, "UNKNOWN_ROLE")` for a role value this build does
 * not know. `Record<UserRole, ...>` makes a missing entry a compile error, but
 * it cannot cover the *database*: a migration applied before the code that
 * knows the new roles during a rolling deploy, or a value written by direct
 * SQL, both put a role in the `users` table that `ROLE_PERMISSIONS` has no row
 * for. Indexing it blindly threw a `TypeError` that surfaced as a 500.
 *
 * Failing loudly as a 403 is the point. A role nobody can classify is not a role
 * that should be allowed to act, and `UNKNOWN_ROLE` says "this build is behind
 * the schema" rather than "you are not permitted", which is what an operator
 * needs to see at 3am.
 */
export function permissionsFor(role: UserRole): readonly Permission[] {
  const held = ROLE_PERMISSIONS[role];
  if (!held) {
    throw new AppError(`Role "${role}" is not in the permission matrix`, 403, "UNKNOWN_ROLE");
  }
  return held;
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}
