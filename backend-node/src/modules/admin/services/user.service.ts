import { UserRole } from "@prisma/client";
import { AppError } from "../../../shared/utils/AppError";
import { prisma } from "../../../config/database";

export class AdminUserService {
  async getAllUsers(
    search: string | undefined,
    isFrozen: boolean | undefined,
    page: number,
    limit: number,
  ) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { email: { contains: search } },
        { username: { contains: search } },
      ];
    }
    if (isFrozen === true) where.isFrozen = true;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          isActive: true,
          isFrozen: true,
          frozenReason: true,
          createdAt: true,
          wallet: {
            select: {
              walletId: true,
              balance: true,
            },
          },
          kycProfile: {
            select: {
              verificationStatus: true,
              fullName: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total };
  }

  async getUserDetails(userId: number) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        isActive: true,
        isFrozen: true,
        frozenReason: true,
        frozenAt: true,
        createdAt: true,
        wallet: {
          select: {
            walletId: true,
            balance: true,
            createdAt: true,
          },
        },
        kycProfile: true,
        transactions: {
          take: 10,
          orderBy: { timestamp: "desc" },
          select: {
            reference: true,
            amount: true,
            transactionType: true,
            status: true,
            timestamp: true,
          },
        },
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  }

  async freezeUser(userId: number, reason?: string) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        isFrozen: true,
        frozenReason: reason,
        frozenAt: new Date(),
      },
    });

    await prisma.notification.create({
      data: {
        userId: user.id,
        transactionId: 1,
        status: "DEPOSIT",
        title: "Account Frozen",
        message: `Your account has been frozen. Reason: ${reason || "Policy violation"}. Contact support for assistance.`,
      },
    });

    return user;
  }

  async unfreezeUser(userId: number) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        isFrozen: false,
        frozenReason: null,
        frozenAt: null,
      },
    });

    await prisma.notification.create({
      data: {
        userId: user.id,
        transactionId: 1,
        status: "DEPOSIT",
        title: "Account Unfrozen",
        message:
          "Your account has been unfrozen. You can now use all features.",
      },
    });

    return user;
  }

  async changeUserRole(userId: number, role: UserRole) {
    // Refuse to demote the last remaining ADMIN. Promotion back to ADMIN goes
    // through this same endpoint, which itself requires an ADMIN, so without this
    // guard a sole admin demoting themselves locks the admin API permanently
    // and recovery means running a seed script by hand against the database.
    if (role !== "ADMIN") {
      const current = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });

      if (current?.role === "ADMIN") {
        const admins = await prisma.user.count({ where: { role: "ADMIN" } });
        if (admins <= 1) {
          throw new AppError(
            "Cannot demote the last remaining ADMIN; promote another admin first",
            400,
            "LAST_ADMIN_CANNOT_BE_DEMOTED",
          );
        }
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
    });

    return user;
  }

  /**
   * Promote/demote a KYC tier. Tier controls fraud-control limits, so every
   * change is audited (caller records the AuditLog with the reason).
   */
  async changeUserTier(userId: number, tier: "BASIC" | "VERIFIED" | "PREMIUM") {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tier: true },
    });
    if (!existing) throw new Error("User not found");

    const fromTier = existing.tier;
    const user = await prisma.user.update({
      where: { id: userId },
      data: { tier },
    });

    await prisma.notification.create({
      data: {
        userId: user.id,
        transactionId: null,
        status: "DEPOSIT",
        title: "Account Tier Updated",
        message: `Your account tier has been updated to ${tier}. ${tier === "PREMIUM" ? "You now enjoy higher transaction limits." : ""}`,
      },
    });

    return { user, fromTier };
  }
}
