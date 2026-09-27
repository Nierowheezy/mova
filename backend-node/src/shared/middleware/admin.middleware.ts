import { requirePermission, requireRoles } from "./permission.middleware";

/**
 * The original role guards. Both now delegate to the shared authorization
 * machinery in permission.middleware.ts, which keeps their behaviour identical:
 * same status codes, same error codes, same 403 wording.
 *
 * The admin routes predate the Work layer and are deliberately left on these
 * guards. Operations routes (feature 3 onward) use `requirePermission` directly.
 *
 * Both role sets are pinned by tests/rbac.integration.test.ts. That matters
 * because these are expressed in terms of the permission matrix, so if a future
 * edit widens the matrix, the tests fail loudly instead of quietly widening the
 * admin surface.
 */

/**
 * ADMIN only. Expressed as the `permission.manage` permission, which the matrix
 * grants to ADMIN and to nobody else.
 */
export const requireAdmin = requirePermission("permission.manage", "Admin access required");

/**
 * ADMIN or SUPPORT.
 *
 * This one is a literal role set rather than a permission, because no single
 * permission in the matrix has exactly those two holders - `case.resolve`, the
 * closest, is also held by four operational roles, and adopting it would have
 * opened admin routes to the entire operations team.
 */
export const requireSupport = requireRoles(["ADMIN", "SUPPORT"], "Support or Admin access required");
