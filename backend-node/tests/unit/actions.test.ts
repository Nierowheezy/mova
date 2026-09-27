import { describe, expect, it } from "vitest";
import { UserRole } from "@prisma/client";
import {
  RESOLVE_ACTIONS,
  ROLE_RESOLVE_ACTIONS,
  canResolveWith,
  resolveActionsFor,
  type ResolveAction,
} from "../../src/modules/operations/rbac/actions";
import { hasPermission } from "../../src/modules/operations/rbac/permissions";

/**
 * Feature 2 - scoped case-resolution actions.
 *
 * `case.resolve` says a role may close a case. These tests pin *which* closures
 * each role may perform, which is the second decision and the one with legal
 * consequences: a SAR is a regulatory filing, a block is an operational one, and
 * a role that can do one must not inherit the other by accident.
 *
 * Policy only. No endpoint reads this map yet; Feature 3's resolve endpoint
 * calls `canResolveWith` to reject anything outside the caller's set with
 * 403 ACTION_NOT_PERMITTED_FOR_ROLE. Testing it here rather than at that
 * endpoint means the vocabulary is fixed and reviewable before any transport
 * exists to enforce it.
 */

const ALL_ROLES = Object.values(UserRole);

/** The sets the product decision actually specifies. */
const SPECIFIED: ReadonlyArray<readonly [UserRole, readonly ResolveAction[]]> = [
  ["FRAUD_ANALYST", ["CLEAR", "BLOCK", "BLOCK_AND_REPORT"]],
  ["COMPLIANCE_OFFICER", ["CLEAR", "SAR_FILED", "REFER_TO_LAW_ENFORCEMENT", "CLOSE_NO_ACTION"]],
  ["OPERATIONS_MANAGER", ["REASSIGN", "CLOSE_STALE"]],
];

describe("scoped resolve actions - the specified sets", () => {
  it.each(SPECIFIED)("%s may perform exactly %j", (role, expected) => {
    expect([...resolveActionsFor(role)].sort()).toEqual([...expected].sort());
  });

  // The three assertions the product decision was actually about. The first
  // two are the interesting ones: they are the pairs that a naive
  // "anyone with case.resolve can close a case" implementation would allow.
  it("a Compliance Officer may file a SAR", () => {
    expect(canResolveWith("COMPLIANCE_OFFICER", "SAR_FILED")).toBe(true);
  });

  it("a Compliance Officer may not block, which is a fraud action", () => {
    expect(canResolveWith("COMPLIANCE_OFFICER", "BLOCK")).toBe(false);
  });

  it("a Fraud Analyst may not file a SAR, which is a compliance action", () => {
    expect(canResolveWith("FRAUD_ANALYST", "SAR_FILED")).toBe(false);
  });
});

describe("scoped resolve actions - invariants", () => {
  it("names every role, so a new role cannot silently inherit the empty set", () => {
    expect(Object.keys(ROLE_RESOLVE_ACTIONS).sort()).toEqual([...ALL_ROLES].sort());
  });

  it("draws only on the declared vocabulary", () => {
    for (const role of ALL_ROLES) {
      for (const action of resolveActionsFor(role)) {
        expect(RESOLVE_ACTIONS, `${role} has unknown action ${action}`).toContain(action);
      }
    }
  });

  it("has no duplicate action within a role", () => {
    for (const role of ALL_ROLES) {
      const actions = resolveActionsFor(role);
      expect(new Set(actions).size, `${role} lists an action twice`).toBe(actions.length);
    }
  });

  it("gives a customer no actions at all", () => {
    expect(resolveActionsFor("USER")).toEqual([]);
    for (const action of RESOLVE_ACTIONS) {
      expect(canResolveWith("USER", action), `USER may ${action}`).toBe(false);
    }
  });

  it("gives ADMIN every action, so an administrator is never a dead end", () => {
    expect([...resolveActionsFor("ADMIN")].sort()).toEqual([...RESOLVE_ACTIONS].sort());
  });

  it("keeps allocation decisions away from findings", () => {
    // An Operations Manager moves work around; deciding that money was
    // fraudulent or that a regulator must be told is not theirs to make.
    for (const finding of ["CLEAR", "BLOCK", "SAR_FILED", "REFER_TO_LAW_ENFORCEMENT"]) {
      expect(
        canResolveWith("OPERATIONS_MANAGER", finding as ResolveAction),
        `OPERATIONS_MANAGER may ${finding}`,
      ).toBe(false);
    }
  });

  it("is frozen, so no request handler can widen its own role at runtime", () => {
    expect(Object.isFrozen(ROLE_RESOLVE_ACTIONS)).toBe(true);
    for (const role of ALL_ROLES) {
      expect(Object.isFrozen(ROLE_RESOLVE_ACTIONS[role]), `${role} list is mutable`).toBe(true);
    }
  });
});

describe("scoped resolve actions - agreement with the permission matrix", () => {
  it("never grants an action to a role that lacks case.resolve", () => {
    // The two maps are edited separately, so this is where they would drift: an
    // action set handed to a role that cannot reach the endpoint at all is dead
    // policy, and a role holding case.resolve with no actions is a dead end.
    for (const role of ALL_ROLES) {
      const canResolve = hasPermission(role, "case.resolve");
      const actions = resolveActionsFor(role);
      if (actions.length > 0) {
        expect(canResolve, `${role} has ${actions.length} actions but no case.resolve`).toBe(true);
      }
    }
  });

  it("leaves the roles with an undefined vocabulary visibly empty", () => {
    // SUPPORT, KYC_REVIEWER, and LOAN_OFFICER hold case.resolve but have no
    // defined action vocabulary yet. This is a known gap, not an oversight, and
    // it is pinned so that closing it is a deliberate test edit.
    for (const role of ["SUPPORT", "KYC_REVIEWER", "LOAN_OFFICER"] as const) {
      expect(hasPermission(role, "case.resolve"), `${role} should hold case.resolve`).toBe(true);
      expect(resolveActionsFor(role), `${role} vocabulary is now defined`).toEqual([]);
    }
  });
});

describe("scoped resolve actions - a role this build cannot classify", () => {
  const UNKNOWN = "ROLLED_BACK" as UserRole;

  it("reports one code for an unknown role, matching the permission matrix", () => {
    // A role value in the database that this build has no row for: a migration
    // applied ahead of the code during a rolling deploy, or a value written by
    // direct SQL. Both callers must fail the same way, or an operator sees two
    // different errors for one cause.
    for (const call of [
      () => canResolveWith(UNKNOWN, "CLEAR"),
      () => resolveActionsFor(UNKNOWN),
    ]) {
      try {
        call();
        expect.unreachable(`${UNKNOWN} should not resolve against the action map`);
      } catch (err) {
        expect(err).toBeInstanceOf(Error);
        expect((err as { code?: string }).code).toBe("UNKNOWN_ROLE");
        expect((err as { statusCode?: number }).statusCode).toBe(403);
      }
    }
  });
});
