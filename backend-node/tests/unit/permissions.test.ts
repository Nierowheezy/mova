import { describe, expect, it } from "vitest";
import { UserRole } from "@prisma/client";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  STAFF_ROLES,
  hasPermission,
  isStaffRole,
  permissionsFor,
  type Permission,
} from "../../src/modules/operations/rbac/permissions";

/**
 * The permission matrix is a security contract, so it is tested as one. These
 * are pure functions - no database, no HTTP - which is why this suite is fast
 * enough to run on every change.
 *
 * The matrix cannot be fully pinned by these tests: whether a Fraud Analyst
 * *should* hold `action.execute` is a product decision, not a code fact. What is
 * pinned here are the invariants that must hold whatever the policy turns out to
 * be, so a future edit cannot quietly break them.
 */

const ALL_ROLES = Object.values(UserRole);

describe("permission vocabulary", () => {
  it("has no duplicate entries", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it("uses verb.noun, lower-case, no leading or trailing whitespace", () => {
    for (const permission of PERMISSIONS) {
      expect(permission, permission).toMatch(/^[a-z][a-z]*\.[a-z][a-z.]*$/);
      expect(permission.trim(), permission).toBe(permission);
    }
  });

  it("grants nothing to a customer", () => {
    expect(ROLE_PERMISSIONS.USER).toEqual([]);
  });
});

describe("matrix integrity", () => {
  it("maps every role in the enum", () => {
    for (const role of ALL_ROLES) {
      expect(ROLE_PERMISSIONS[role], `no matrix entry for ${role}`).toBeDefined();
    }
  });

  it("grants ADMIN every permission", () => {
    expect([...ROLE_PERMISSIONS.ADMIN].sort()).toEqual([...PERMISSIONS].sort());
  });

  it("grants a customer no permission at all", () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission("USER", permission), `USER must not hold ${permission}`).toBe(false);
    }
  });

  it("grants every staff role a non-empty set", () => {
    for (const role of STAFF_ROLES) {
      expect(ROLE_PERMISSIONS[role].length, `${role} holds nothing`).toBeGreaterThan(0);
    }
  });

  it("never lists a permission that is not in the vocabulary", () => {
    const vocabulary = new Set<string>(PERMISSIONS);
    for (const role of ALL_ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(vocabulary.has(permission), `${role} -> unknown ${permission}`).toBe(true);
      }
    }
  });

  it("never lists the same permission twice for one role", () => {
    for (const role of ALL_ROLES) {
      const held = ROLE_PERMISSIONS[role];
      expect(new Set(held).size, `${role} has duplicates`).toBe(held.length);
    }
  });

  it("never leaves a staff role with ADMIN-equivalent power", () => {
    // ADMIN excepted: holding everything is its job, and is asserted above.
    for (const role of STAFF_ROLES.filter((r) => r !== "ADMIN")) {
      expect(ROLE_PERMISSIONS[role].length, `${role} is over-privileged`).toBeLessThan(
        PERMISSIONS.length,
      );
    }
  });

  it("keeps the two role-management permissions to ADMIN alone", () => {
    // Widening these would let a non-admin escalate themselves, so they are
    // pinned individually rather than inferred from a total.
    for (const permission of ["user.role.manage", "permission.manage"] as const) {
      const holders = ALL_ROLES.filter((role) => ROLE_PERMISSIONS[role].includes(permission));
      expect(holders, `${permission} must be ADMIN-only`).toEqual(["ADMIN"]);
    }
  });

  it("is frozen at runtime, so a caller cannot widen a live role", () => {
    // `Readonly<...>` is a compile-time fiction for the inner arrays. If this
    // ever fails, any code holding the array could grant itself a permission.
    for (const role of ALL_ROLES) {
      const held = ROLE_PERMISSIONS[role];
      expect(Object.isFrozen(held), `${role} array is not frozen`).toBe(true);
      expect(() => (held as Permission[]).push("permission.manage")).toThrow();
    }
    expect(Object.isFrozen(ROLE_PERMISSIONS)).toBe(true);
    expect(Object.isFrozen(PERMISSIONS)).toBe(true);
  });
});

describe("isStaffRole", () => {
  it("excludes only the customer", () => {
    expect(isStaffRole("USER")).toBe(false);
  });

  it.each(STAFF_ROLES)("counts %s as staff", (role) => {
    expect(isStaffRole(role)).toBe(true);
  });

  it("agrees with the matrix: staff iff the role holds something", () => {
    for (const role of ALL_ROLES) {
      expect(isStaffRole(role), role).toBe(ROLE_PERMISSIONS[role].length > 0);
    }
  });
});

describe("hasPermission", () => {
  it("agrees with the matrix for every role and permission pair", () => {
    for (const role of ALL_ROLES) {
      for (const permission of PERMISSIONS) {
        expect(hasPermission(role, permission), `${role} / ${permission}`).toBe(
          ROLE_PERMISSIONS[role].includes(permission),
        );
      }
    }
  });
});

describe("permissionsFor", () => {
  it("returns the same view as hasPermission", () => {
    for (const role of ALL_ROLES) {
      const held = permissionsFor(role);
      for (const permission of PERMISSIONS) {
        expect(held.includes(permission), `${role} / ${permission}`).toBe(
          hasPermission(role, permission),
        );
      }
    }
  });

  it("returns the frozen matrix entry, not a copy that could be edited", () => {
    for (const role of ALL_ROLES) {
      expect(permissionsFor(role)).toBe(ROLE_PERMISSIONS[role]);
      expect(Object.isFrozen(permissionsFor(role))).toBe(true);
    }
  });
});
