import { Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { AdminUserService } from "../services/user.service";
import { AuditService } from "../../../services/audit.service";

/** Type guard over the Prisma enum, so the check below stays exhaustive. */
const isUserRole = (value: string): value is UserRole =>
  (Object.values(UserRole) as string[]).includes(value);

const userService = new AdminUserService();
const audit = new AuditService();

export class AdminUserController {
  async getAllUsers(req: Request, res: Response): Promise<any> {
    const { page = "1", limit = "20", search, isFrozen } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const result = await userService.getAllUsers(
      search as string,
      isFrozen === "true",
      pageNum,
      limitNum,
    );

    return res.status(200).json({
      success: true,
      data: result.users,
      meta: {
        total: result.total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(result.total / limitNum),
      },
    });
  }

  async getUserDetails(req: Request, res: Response): Promise<any> {
    const { userId } = req.params;

    const userIdStr = Array.isArray(userId) ? userId[0] : userId;
    if (!userIdStr) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_ID", message: "Invalid user ID" },
      });
    }

    try {
      const user = await userService.getUserDetails(parseInt(userIdStr));
      return res.status(200).json({ success: true, data: user });
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: error.message },
      });
    }
  }

  async freezeUser(req: Request, res: Response): Promise<any> {
    const { userId } = req.params;
    const { reason } = req.body;

    const userIdStr = Array.isArray(userId) ? userId[0] : userId;
    if (!userIdStr) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_ID", message: "Invalid user ID" },
      });
    }

    const user = await userService.freezeUser(parseInt(userIdStr), reason);

    return res.status(200).json({
      success: true,
      data: {
        message: "User account frozen",
        userId: user.id,
        email: user.email,
      },
    });
  }

  async unfreezeUser(req: Request, res: Response): Promise<any> {
    const { userId } = req.params;

    const userIdStr = Array.isArray(userId) ? userId[0] : userId;
    if (!userIdStr) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_ID", message: "Invalid user ID" },
      });
    }

    const user = await userService.unfreezeUser(parseInt(userIdStr));

    return res.status(200).json({
      success: true,
      data: {
        message: "User account unfrozen",
        userId: user.id,
        email: user.email,
      },
    });
  }

  async changeUserRole(req: Request, res: Response): Promise<any> {
    const { userId } = req.params;
    const { role } = req.body;

    const userIdStr = Array.isArray(userId) ? userId[0] : userId;
    if (!userIdStr) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_ID", message: "Invalid user ID" },
      });
    }

    // Validated against the live enum rather than a hand-written list, so the
    // role API cannot drift behind the schema: widening UserRole (feature 2
    // added the five operational staff roles) is otherwise invisible here and
    // those roles would be assignable only by direct SQL.
    if (typeof role !== "string" || !isUserRole(role)) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_ROLE", message: "Invalid role" },
      });
    }

    const user = await userService.changeUserRole(parseInt(userIdStr), role);

    return res.status(200).json({
      success: true,
      data: {
        message: `User role updated to ${role}`,
        userId: user.id,
        email: user.email,
        role: user.role,
      },
    });
  }

  /** PUT /api/v1/admin/users/:userId/tier — KYC tier promotion/demotion */
  async changeUserTier(req: Request, res: Response): Promise<any> {
    const { userId } = req.params;
    const { tier, reason } = req.body;
    const adminId = req.user?.userId;

    const userIdStr = Array.isArray(userId) ? userId[0] : userId;
    if (!userIdStr) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_ID", message: "Invalid user ID" },
      });
    }
    if (!adminId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const result = await userService.changeUserTier(
      parseInt(userIdStr),
      tier as "BASIC" | "VERIFIED" | "PREMIUM",
    );

    // Audit the tier change — who, whom, from, to, and why.
    await audit.log(adminId, "CHANGE_USER_TIER", result.user.id, {
      fromTier: result.fromTier,
      newTier: tier,
      reason,
    });

    return res.status(200).json({
      success: true,
      data: {
        message: `User tier updated to ${tier}`,
        userId: result.user.id,
        email: result.user.email,
        tier: result.user.tier,
      },
    });
  }
}
