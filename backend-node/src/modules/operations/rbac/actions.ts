import { UserRole } from "@prisma/client";
import { AppError } from "../../../shared/utils/AppError";

/**
 * Case resolution actions, and which roles may perform them.
 *
 * Holding `case.resolve` says a role may close a case. It does not say *how*.
 * Those are different decisions with different consequences: a Fraud Analyst
 * blocking a transaction and a Compliance Officer filing a SAR are not
 * interchangeable, and a role that can do one must not be able to do the other
 * just because both are "resolutions". This map is that second decision.
 *
 * Policy only. Nothing reads it yet - the resolve endpoint arrives with Feature 3
 * and calls `canResolveWith` to reject anything outside the caller's set. Adding
 * an endpoint before the policy existed would have meant inventing the vocabulary
 * at the same moment as the transport, which is how action names end up
 * inconsistent across features.
 *
 * Every resolution still writes an `AuditLog` row (not `AuditEvent`: the Work
 * layer deliberately extends the existing audit table so the compliance trail is
 * not split in two) carrying the action, the reason, and the actor.
 */

/** The vocabulary. Deriving the type from the array keeps the two in step. */
export const RESOLVE_ACTIONS = [
  // Fraud outcome
  "CLEAR",
  "BLOCK",
  "BLOCK_AND_REPORT",
  // Compliance outcome
  "SAR_FILED",
  "REFER_TO_LAW_ENFORCEMENT",
  "CLOSE_NO_ACTION",
  // Administrative outcome
  "REASSIGN",
  "CLOSE_STALE",
] as const;

export type ResolveAction = (typeof RESOLVE_ACTIONS)[number];

/**
 * Which resolve actions each role may perform.
 *
 * Typed as `Record<UserRole, ...>` for the same reason the permission matrix is:
 * adding a role to the enum without deciding its actions is a compile error
 * rather than a role that silently cannot resolve anything.
 *
 * The empty entries are deliberate and mean "this role holds `case.resolve` but
 * its action vocabulary is not defined yet". `SUPPORT`, `KYC_REVIEWER`, and
 * `LOAN_OFFICER` all hold `case.resolve` in the permission matrix, but deciding
 * what a KYC approval or a loan decision is *called* is Feature 3's call to make
 * with the resolve endpoint in front of it, not something to invent here. They
 * are listed rather than omitted so the gap is visible in the source.
 */
const ACTIONS = {
  // A customer never resolves anything.
  USER: [],

  // Customer Service closes the conversation, not the compliance question. It
  // has no scoped action yet for the same reason as KYC_REVIEWER below.
  SUPPORT: [],

  // Administrator holds every action, matching its standing in the permission
  // matrix, so an administrator is never the reason a case cannot be closed.
  ADMIN: RESOLVE_ACTIONS,

  // Allocation decisions, not findings. A manager moves work and clears stale
  // cases; they do not clear a fraud alert or file a SAR.
  OPERATIONS_MANAGER: ["REASSIGN", "CLOSE_STALE"],

  // Fraud outcomes only. Notably not SAR_FILED: filing a report is a compliance
  // act with regulatory consequences, not a fraud triage decision.
  FRAUD_ANALYST: ["CLEAR", "BLOCK", "BLOCK_AND_REPORT"],

  KYC_REVIEWER: [],
  LOAN_OFFICER: [],

  // Compliance outcomes. `CLEAR` is shared with Fraud Analyst deliberately:
  // both can conclude no violation occurred, but only Compliance can escalate
  // that conclusion into a report.
  COMPLIANCE_OFFICER: [
    "CLEAR",
    "SAR_FILED",
    "REFER_TO_LAW_ENFORCEMENT",
    "CLOSE_NO_ACTION",
  ],
} satisfies Record<UserRole, readonly ResolveAction[]>;

/** Frozen for the same reason as the permission matrix: policy is not mutable. */
export const ROLE_RESOLVE_ACTIONS: Readonly<Record<UserRole, readonly ResolveAction[]>> =
  Object.freeze(
    Object.fromEntries(
      Object.entries(ACTIONS).map(([role, actions]) => [role, Object.freeze(actions)]),
    ) as Record<UserRole, readonly ResolveAction[]>,
  );

/**
 * Whether a role may resolve a case with this action. Throws
 * `UNKNOWN_ROLE` on a role this build cannot classify, matching
 * `hasPermission`, so one bad row produces one error code rather than two.
 */
export function canResolveWith(role: UserRole, action: ResolveAction): boolean {
  const allowed = ROLE_RESOLVE_ACTIONS[role];
  if (!allowed) {
    throw new AppError(`Role "${role}" is not in the resolve action map`, 403, "UNKNOWN_ROLE");
  }
  return allowed.includes(action);
}

/** The actions a role may perform. For describing a role, not deciding. */
export function resolveActionsFor(role: UserRole): readonly ResolveAction[] {
  const allowed = ROLE_RESOLVE_ACTIONS[role];
  if (!allowed) {
    throw new AppError(`Role "${role}" is not in the resolve action map`, 403, "UNKNOWN_ROLE");
  }
  return allowed;
}
