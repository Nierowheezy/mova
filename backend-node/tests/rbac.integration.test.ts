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

const probe = (probeApp: express.Express, user?: TestUser) => {
  const token = user ? bearerToken(user.id, user.email) : "";
  recordSign(token.replace(/^Bearer /, ""));
  return request(probeApp).get("/probe").set("Authorization", token);
};

/**
 * Diagnostics for the one assertion that has ever failed without explaining
 * itself.
 *
 * A 401 in this suite can only mean `jwt.verify` rejected the token, and the
 * only ways that happens are a bad signature, a wrong secret, or an expiry. The
 * first two are constant across the run, so if this ever fails again the
 * interesting question is always the third: was the token actually expired, and
 * by how much. These fields answer that without printing a secret or a full
 * token.
 */
const lastSign = { at: 0, exp: 0, header: "" };

function recordSign(token: string): void {
  lastSign.at = Date.now();
  lastSign.header = token;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    lastSign.exp = typeof payload.exp === "number" ? payload.exp : 0;
  } catch {
    lastSign.exp = 0;
  }
}

/** The Authorization header with the signature elided, so a log line is safe. */
function maskedHeader(token: string): string {
  const [header, payload, signature] = token.split(".");
  if (!signature) return "<unparseable>";
  return `Bearer ${header}.${payload}.${signature.slice(0, 6)}…${signature.slice(-4)}`;
}

function signDiagnostics(): string {
  const now = Date.now();
  const expMs = lastSign.exp * 1000;
  const ageMs = now - lastSign.at;
  const skewMs = expMs - now;
  return [
    `signed ${ageMs}ms before the assertion`,
    `exp claim ${new Date(expMs).toISOString()}`,
    `now       ${new Date(now).toISOString()}`,
    skewMs < 0 ? `EXPIRED ${-skewMs}ms ago` : `expires in ${skewMs}ms`,
    `header    ${maskedHeader(lastSign.header)}`,
  ].join(" | ");
}

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
        expect(
          res.status,
          [
            `${role} probing ${permission} -> ${JSON.stringify(res.body)}`,
            signDiagnostics(),
          ].join("\n"),
        ).toBe(hasPermission(role, permission) ? 200 : 403);
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

/**
 * F-01 - a role in the database that this build has no row for.
 *
 * Reproduced the only way it can really happen: the migration runs before the
 * code that knows the new roles, which is the normal order during a rolling
 * deploy. Anyone holding the new role is then a role the deployed build cannot
 * classify. The requirement is a 403 with a code that names the cause, not a
 * 500 from indexing an object that has no such key.
 */
describe("a role value this build does not know", () => {
  const UNKNOWN_LABEL = "ROLLOUT_PENDING";
  const LOAN_REVIEW_APP = guardedApp(requirePermission("loan.review"));

  beforeAll(async () => {
    // Outside a transaction block, which is why this is two statements.
    await prisma.$executeRawUnsafe(`ALTER TYPE "UserRole" ADD VALUE '${UNKNOWN_LABEL}'`);
  });

  async function asUnknownRole(): Promise<TestUser> {
    const user = await createUser();
    // Raw SQL because the generated client cannot name a value its own enum
    // type does not declare - which is the whole point of the scenario.
    await prisma.$executeRawUnsafe(
      `UPDATE "users" SET role = '${UNKNOWN_LABEL}' WHERE id = ${user.id}`,
    );
    return user;
  }

  it("answers 403 UNKNOWN_ROLE rather than failing with a 500", async () => {
    const user = await asUnknownRole();

    const res = await probe(LOAN_REVIEW_APP, user);

    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.error.code).toBe("UNKNOWN_ROLE");
  });

  it("fails closed on requireAdmin too, so a new role is never a free pass", async () => {
    // The dangerous failure mode is not the 500. It would be treating an
    // unclassifiable role as "not explicitly denied" and letting it through.
    const res = await probe(guardedApp(requireAdmin), await asUnknownRole());

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("UNKNOWN_ROLE");
  });

  it("keeps the message pointed at the deployment, not at the user", async () => {
    // The operator reading a 3am log needs to know this is a build behind its
    // own migration, not a customer who did something wrong.
    const res = await probe(LOAN_REVIEW_APP, await asUnknownRole());

    expect(res.body.error.message).toContain(UNKNOWN_LABEL);
    expect(res.body.error.message).not.toMatch(/required|permitted/i);
  });

  it("leaves a known role unaffected once the unknown one is gone", async () => {
    // Proof the added enum label did not widen or break the matrix. The label
    // stays in the test database until the next `migrate reset`, which
    // globalSetup runs before every suite, so it cannot leak between runs.
    const loanOfficer = await asRole("LOAN_OFFICER");

    expect((await probe(LOAN_REVIEW_APP, loanOfficer)).status).toBe(200);
  });
});

/**
 * F-02 - the last remaining ADMIN.
 *
 * Promotion back to ADMIN goes through the same endpoint, which itself requires
 * an ADMIN, so a sole admin demoting themselves is a one-way door: the only
 * recovery is running a seed script by hand against the database. The dev
 * database holds exactly one admin, so this was not theoretical.
 */
describe("demoting the last remaining ADMIN", () => {
  /** Leave exactly `count` admins behind, whoever they are. */
  async function withAdmins(count: number): Promise<TestUser[]> {
    await prisma.user.updateMany({ where: { role: "ADMIN" }, data: { role: "USER" } });
    const admins: TestUser[] = [];
    for (let i = 0; i < count; i++) {
      admins.push(await asRole("ADMIN"));
    }
    return admins;
  }

  it("refuses to demote the only admin", async () => {
    // With one admin, the only way to demote an admin is to demote that admin,
    // so this one case covers the whole hazard.
    const [solo] = await withAdmins(1);

    const res = await changeRole(solo, solo.id, "FRAUD_ANALYST");

    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error.code).toBe("LAST_ADMIN_CANNOT_BE_DEMOTED");

    const persisted = await prisma.user.findUniqueOrThrow({ where: { id: solo.id } });
    expect(persisted.role).toBe("ADMIN");
  });

  it.each(["USER", "SUPPORT", "OPERATIONS_MANAGER", "FRAUD_ANALYST"] as const)(
    "refuses the demotion to %s as well as to any other role",
    async (role) => {
      // The guard must be about the post being emptied, not about which role is
      // moving into it, or it is one matrix edit away from leaking.
      const [solo] = await withAdmins(1);

      const res = await changeRole(solo, solo.id, role);

      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.error.code).toBe("LAST_ADMIN_CANNOT_BE_DEMOTED");
    },
  );

  it("names the remedy in the message", async () => {
    const [solo] = await withAdmins(1);

    const res = await changeRole(solo, solo.id, "USER");

    expect(res.body.error.message).toMatch(/admin/i);
  });

  it("allows demoting one of two admins, because the post is still filled", async () => {
    const [actor, other] = await withAdmins(2);

    const res = await changeRole(actor, other.id, "KYC_REVIEWER");

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const persisted = await prisma.user.findUniqueOrThrow({ where: { id: other.id } });
    expect(persisted.role).toBe("KYC_REVIEWER");
  });

  it("still allows promoting a user to ADMIN", async () => {
    const [solo] = await withAdmins(1);
    const target = await createUser();

    const res = await changeRole(solo, target.id, "ADMIN");

    expect(res.status).toBe(200);
    const persisted = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(persisted.role).toBe("ADMIN");
  });

  it("never blocks a role change for a user who is not an admin", async () => {
    // The guard is on the *source* role, so promoting a customer or moving a
    // non-admin between staff roles stays open regardless of how many admins
    // exist.
    const [solo] = await withAdmins(1);
    const target = await createUser();

    expect((await changeRole(solo, target.id, "SUPPORT")).status).toBe(200);
    expect((await changeRole(solo, target.id, "FRAUD_ANALYST")).status).toBe(200);
    expect((await changeRole(solo, target.id, "USER")).status).toBe(200);
  });
});

