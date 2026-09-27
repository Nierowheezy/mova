import { Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { prisma } from "../../config/database";
import { AppError } from "../utils/AppError";
import { getChildLogger } from "../utils/logger";
import { hasPermission, type Permission } from "../../modules/operations/rbac/permissions";

/**
 * Authorization middleware. Answers one question per request: given who is
 * calling, is this call allowed?
 *
 * The role is read from the database on **every** request. `authenticate` only
 * verifies the token signature - `JwtPayload` carries `{ userId, email }` and
 * deliberately no role - so the database is the only source of truth available.
 * This costs one indexed primary-key lookup and buys immediate revocation:
 * demoting or disabling a staff account takes effect on their next request
 * instead of whenever their token happens to expire. For a control that decides
 * who may freeze an account or clear an AML flag, that trade is not close.
 *
 * Status codes follow the existing middleware exactly, so swapping
 * `requireAdmin` in does not change a single response:
 *   - 401 UNAUTHORIZED when there is no authenticated user
 *   - 403 FORBIDDEN when the user exists but is not allowed
 *
 * Success is `next()` with no body, so a guard composes on a route without
 * shaping the response.
 */

const unauthenticated = (res: Response, message: string): void => {
  res.status(401).json({
    success: false,
    error: { code: "UNAUTHORIZED", message },
  });
};

const forbidden = (res: Response, message: string): void => {
  res.status(403).json({
    success: false,
    error: { code: "FORBIDDEN", message },
  });
};

/**
 * Shared body of every authorization guard: resolve the caller, then apply a
 * predicate. `denied` is the 403 message, passed in so each guard keeps the
 * exact wording it had before.
 */
async function authorize(
  req: Request,
  res: Response,
  denied: string,
  isAllowed: (role: UserRole) => boolean,
): Promise<boolean> {
  const userId = req.user?.userId;

  if (!userId) {
    unauthenticated(res, "Authentication required");
    return false;
  }

  // The role is read as text rather than through the typed client on purpose.
  // `findUnique` deserializes the column into the generated enum type and
  // *throws* on a value that type does not declare, so a database holding a role
  // this build has not heard of would fail the read rather than reach the
  // permission check - a 500 from the lookup, not a 403 from the policy. Reading
  // it as text keeps the two failures apart: a database outage still surfaces as
  // an error, while an unclassifiable role reaches `permissionsFor` and is
  // answered as the policy decision it is.
  const rows = await prisma.$queryRaw<{ role: string }[]>`
    SELECT "role" FROM "users" WHERE "id" = ${userId}
  `;
  const role = rows[0]?.role;

  // A token that names a user who no longer exists is forbidden, not
  // unauthorized: the request was authenticated, the subject is just gone.
  if (!role) {
    forbidden(res, denied);
    return false;
  }

  try {
    if (isAllowed(role as UserRole)) {
      return true;
    }
  } catch (err) {
    // A role this build cannot classify: the database is ahead of the deployed
    // code. That is a deployment problem rather than a user problem, so it gets
    // its own error code and is logged at warn with the role and request id
    // attached. It deliberately does not go through the central errorHandler: an
    // authorization denial is a decision rather than an exception, and a stack
    // trace per denial desensitises real errors. See coding-standards.md.
    if (err instanceof AppError) {
      getChildLogger(req).warn(
        { event: "unknown_role", role, userId, code: err.code },
        err.message,
      );
      res.status(err.statusCode).json({
        success: false,
        error: { code: err.code, message: err.message },
      });
      return false;
    }
    throw err;
  }

  forbidden(res, denied);
  return false;
}

/**
 * Require one specific permission. This is the guard new operations routes use.
 *
 * @param permission  the permission the route needs
 * @param denied      403 message; defaults to the generic one
 */
export const requirePermission =
  (permission: Permission, denied = "Insufficient permissions") =>
  async (req: Request, res: Response, next: () => void): Promise<void> => {
    if (await authorize(req, res, denied, (role) => hasPermission(role, permission))) {
      next();
    }
  };

/**
 * Require membership of an explicit set of roles, for the legacy admin
 * middleware whose behaviour is a fixed role list rather than a permission.
 * Prefer `requirePermission` for anything new.
 */
export const requireRoles =
  (roles: readonly UserRole[], denied: string) =>
  async (req: Request, res: Response, next: () => void): Promise<void> => {
    if (await authorize(req, res, denied, (role) => roles.includes(role))) {
      next();
    }
  };
