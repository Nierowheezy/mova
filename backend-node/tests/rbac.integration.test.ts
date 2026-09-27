import { beforeAll, describe, expect, it } from "vitest";
import express, { type RequestHandler } from "express";
import request from "supertest";
import { UserRole } from "@prisma/client";
import { app } from "../src/app";
import { prisma } from "../src/config/database";
import { authenticate } from "../src/shared/middleware/auth.middleware";
import {
  requireAdmin,
  requireSupport,
} from "../src/shared/middleware/admin.middleware";
import { requirePermission } from "../src/shared/middleware/permission.middleware";
import { PERMISSIONS, hasPermission } from "../src/modules/operations/rbac/permissions";
import { bearerToken, createUser, resetDatabase, type TestUser } from "./helpers";

/**
 * Feature 2 - Role-Based Access Control.
 *
 * The admin role API is the only place the widened UserRole enum is reachable
 * from outside the database, so it is the natural place to prove the widening
 * took effect. Every request here must authenticate as an ADMIN to get past
 * requireAdmin, which makes this suite the first coverage of that middleware.
 */

const ROLE_PATH = (userId: number) => `/api/v1/admin/users/${userId}/role`;

/** Promote a user to ADMIN directly; there is no API to create an admin yet. */
async function asAdmin(user: TestUser): Promise<TestUser> {
  await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  return user;
}

const changeRole = (actor: TestUser, targetId: number, role: unknown) =>
  request(app)
    .put(ROLE_PATH(targetId))
    .set("Authorization", bearerToken(actor.id, actor.email))
    .send({ role });

beforeAll(async () => {
  await resetDatabase();
});

describe("admin role assignment - widened UserRole", () => {
  let admin: TestUser;
  let target: TestUser;

  beforeAll(async () => {
    admin = await asAdmin(await createUser());
    target = await createUser();
  });

  it("rejects a request with no authentication", async () => {
    const res = await request(app).put(ROLE_PATH(target.id)).send({ role: "FRAUD_ANALYST" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a non-admin actor", async () => {
    const customer = await createUser();

    const res = await changeRole(customer, target.id, "FRAUD_ANALYST");

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    // The rejected write must not have landed.
    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(unchanged.role).toBe("USER");
  });

  it("assigns a newly added operational role and persists it", async () => {
    const res = await changeRole(admin, target.id, "FRAUD_ANALYST");

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("FRAUD_ANALYST");

    const persisted = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(persisted.role).toBe("FRAUD_ANALYST");
  });

  it.each(["OPERATIONS_MANAGER", "KYC_REVIEWER", "LOAN_OFFICER", "COMPLIANCE_OFFICER"] as const)(
    "assigns %s",
    async (role) => {
      const res = await changeRole(admin, target.id, role);

      expect(res.status).toBe(200);
      const persisted = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
      expect(persisted.role).toBe(role);
    },
  );

  it("still assigns the pre-existing USER and ADMIN roles", async () => {
    await changeRole(admin, target.id, "ADMIN");
    let persisted = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(persisted.role).toBe("ADMIN");

    await changeRole(admin, target.id, "USER");
    persisted = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(persisted.role).toBe("USER");
  });

  it("still assigns the pre-existing SUPPORT role", async () => {
    const res = await changeRole(admin, target.id, "SUPPORT");

    expect(res.status).toBe(200);
    const persisted = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(persisted.role).toBe("SUPPORT");
  });

  it.each([
    ["SUPERUSER", "an invented role"],
    ["fraud_analyst", "the right role in the wrong case"],
    ["", "an empty string"],
  ])("rejects %s (%s) without writing anything", async (role) => {
    const res = await changeRole(admin, target.id, role);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ROLE");

    const persisted = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(persisted.role).toBe("SUPPORT");
  });

  it.each([
    [null],
    [123],
    [["FRAUD_ANALYST"]],
    [{ role: "ADMIN" }],
  ])("rejects the non-string role %j", async (role) => {
    const res = await changeRole(admin, target.id, role);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_ROLE");
  });
});

/**
 * A real Express app per guard, running the full chain: authenticate, then the
 * guard under test, then a handler. Anything less would test the predicate
 * without proving it is actually wired in front of a route.
 */
function guardedApp(guard: RequestHandler) {
  return app_(guard, true);
}

/**
 * The same app with `authenticate` omitted, for the one path that only a guard
 * standing alone can reach: 401 when nothing put a user on the request.
 */
function bareApp(guard: RequestHandler) {
  return app_(guard, false);
}

function app_(guard: RequestHandler, withAuthenticate: boolean) {
  const probe = express();
  if (withAuthenticate) probe.use(authenticate);
  probe.get("/probe", guard, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return probe;
}

const probe = (probeApp: express.Express, user?: TestUser) =>
  request(probeApp)
    .get("/probe")
    .set("Authorization", user ? bearerToken(user.id, user.email) : "");

async function asRole(role: UserRole): Promise<TestUser> {
  const user = await createUser();
  await prisma.user.update({ where: { id: user.id }, data: { role } });
  return user;
}

describe("requirePermission", () => {
  // A permission narrow enough to be discriminating: not every staff role holds
  // it, which is what makes the allow/deny assertions meaningful.
  const LOAN_REVIEW = requirePermission("loan.review");
  const LOAN_REVIEW_APP = guardedApp(LOAN_REVIEW);

  it("answers 401 when there is no authenticated user", async () => {
    const res = await probe(LOAN_REVIEW_APP);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("answers 403 for a customer", async () => {
    const customer = await createUser();

    const res = await probe(LOAN_REVIEW_APP, customer);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("answers 403 for a staff role that lacks the permission", async () => {
    const kycReviewer = await asRole("KYC_REVIEWER");

    const res = await probe(LOAN_REVIEW_APP, kycReviewer);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("calls next() for a role that holds the permission", async () => {
    const loanOfficer = await asRole("LOAN_OFFICER");

    const res = await probe(LOAN_REVIEW_APP, loanOfficer);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("admits ADMIN, which holds everything", async () => {
    const admin = await asRole("ADMIN");

    expect((await probe(LOAN_REVIEW_APP, admin)).status).toBe(200);
  });

  it("agrees with the matrix for every role and permission", async () => {
    // The middleware must not drift from the policy it claims to enforce, so
    // this walks the whole matrix over HTTP rather than trusting the unit test.
    // 128 combinations: 8 roles x 16 permissions.
    for (const role of Object.values(UserRole)) {
      for (const permission of PERMISSIONS) {
        const user = await asRole(role);
        const res = await probe(guardedApp(requirePermission(permission)), user);
        expect(res.status, `${role} probing ${permission}`).toBe(
          hasPermission(role, permission) ? 200 : 403,
        );
      }
    }
  });

  it("sees a demotion immediately, without waiting for the token to expire", async () => {
    // The reason the role is read per request instead of trusted from the JWT.
    const user = await asRole("LOAN_OFFICER");
    const token = bearerToken(user.id, user.email);

    const before = await request(LOAN_REVIEW_APP)
      .get("/probe")
      .set("Authorization", token);
    expect(before.status).toBe(200);

    await prisma.user.update({ where: { id: user.id }, data: { role: "KYC_REVIEWER" } });

    const after = await request(LOAN_REVIEW_APP).get("/probe").set("Authorization", token);
    expect(after.status).toBe(403);
  });
});

describe("legacy role guards keep their exact behaviour", () => {
  // These two are now expressed through the permission matrix, so pinning their
  // admitted sets is what stops a future matrix edit from silently widening the
  // admin surface. There was no prior coverage of either.
  const ADMIN_APP = guardedApp(requireAdmin);
  const SUPPORT_APP = guardedApp(requireSupport);

  it("requireAdmin admits only ADMIN", async () => {
    for (const role of Object.values(UserRole)) {
      const res = await probe(ADMIN_APP, await asRole(role));
      expect(res.status, `requireAdmin with ${role}`).toBe(role === "ADMIN" ? 200 : 403);
    }
  });

  it("requireSupport admits only ADMIN and SUPPORT", async () => {
    for (const role of Object.values(UserRole)) {
      const res = await probe(SUPPORT_APP, await asRole(role));
      const expected = role === "ADMIN" || role === "SUPPORT" ? 200 : 403;
      expect(res.status, `requireSupport with ${role}`).toBe(expected);
    }
  });

  it.each([
    [requireAdmin, "Admin access required"],
    [requireSupport, "Support or Admin access required"],
  ])("keeps the original 403 wording", async (guard, message) => {
    const res = await probe(guardedApp(guard as RequestHandler), await asRole("USER"));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(res.body.error.message).toBe(message);
  });

  it("answers 401 in its own right when no user is on the request", async () => {
    // Reachable only when a guard is mounted without `authenticate` ahead of
    // it, so it is pinned directly rather than through the composed chain.
    for (const guard of [requireAdmin, requireSupport] as RequestHandler[]) {
      const res = await request(bareApp(guard)).get("/probe").set("Authorization", "");

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
      expect(res.body.error.message).toBe("Authentication required");
    }
  });

  it.each([
    [requireAdmin, "Admin access required"],
    [requireSupport, "Support or Admin access required"],
  ])("leaves the composed 401 to authenticate, unchanged", async (guard) => {
    // Behind `authenticate` a missing token never reaches the guard, so the
    // caller still sees authenticate's "No token provided" rather than the
    // guard's "Authentication required". Pinned so the refactor cannot move it.
    const res = await probe(guardedApp(guard as RequestHandler));

    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe("No token provided");
  });

  it("answers 403 when the token names a user who no longer exists", async () => {
    // Authenticated but the subject is gone: forbidden, not unauthorized.
    const ghost = await asRole("ADMIN");
    await prisma.user.delete({ where: { id: ghost.id } }).catch(async () => {
      // The user owns a wallet, so a cascade may block a hard delete; deleting
      // the wallet first is enough either way.
      await prisma.wallet.deleteMany({ where: { userId: ghost.id } });
      await prisma.user.delete({ where: { id: ghost.id } });
    });

    const res = await probe(ADMIN_APP, ghost);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});
