import { prisma } from "../../../config/database";
import { screenAgainstSanctions } from "../../../services/sanctions.service";
import { AuditService } from "../../../services/audit.service";
import { logger } from "../../../shared/utils/logger";

const audit = new AuditService();

export class AdminKYCService {
  async getPendingKYC() {
    return await prisma.kYC.findMany({
      where: { verificationStatus: "PENDING" },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async getAllKYC(status: string | undefined, page: number, limit: number) {
    const where: any = {};
    if (status) where.verificationStatus = status;

    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      prisma.kYC.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              username: true,
            },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.kYC.count({ where }),
    ]);

    return { records, total };
  }

  /**
   * Approve a KYC record — GATED by sanctions/PEP screening.
   *
   * Order matters:
   *   1. Screen the applicant against sanction/PEP lists FIRST.
   *   2. NOT cleared ⇒ the approval is DENIED: KYC → REJECTED, a CRITICAL
   *      `SANCTIONS_SCREEN` AML flag lands in the ops queue, the applicant is
   *      notified, the decision is audit-logged. The tiers are NOT promoted.
   *   3. Cleared ⇒ promote to the VERIFIED tier (unlocks higher limits).
   *
   * The screening result is authoritative here: `cleared:false` MUST mean
   * denied, not "logged somewhere". See sanctions.service.ts (fail-closed).
   * Uses an idempotency guard: approving an already-approved record is a
   * no-op race (never double-promotes or double-notifies).
   */
  async approveKYC(kycId: number, adminId: number) {
    const kyc = await prisma.kYC.findUnique({
      where: { id: kycId },
      include: { user: true },
    });
    if (!kyc) throw new Error("KYC record not found");
    if (kyc.verificationStatus !== "PENDING") return kyc; // idempotent retry

    // ── Gate: sanctions / PEP screening (blocking) ─────────────────────────
    const screening = await screenAgainstSanctions({
      id: kyc.userId,
      fullName: kyc.fullName,
      dateOfBirth: kyc.dateOfBirth,
      email: kyc.user?.email ?? null,
      // country: not yet collected on KYC (kyc_records has no country column).
    });

    if (!screening.cleared) {
      logger.error(
        {
          userId: kyc.userId,
          kycId,
          provider: screening.provider,
          matches: screening.matches,
        },
        "KYC approval DENIED — sanctions/PEP screening did not clear",
      );

      await prisma.$transaction(async (tx) => {
        await tx.kYC.update({
          where: { id: kycId },
          data: { verificationStatus: "REJECTED", updatedAt: new Date() },
        });
        // CRITICAL flag → ops review queue. The shared CRITICAL policy in
        // aml.service ALSO freezes (no further money moves until reviewed);
        // we freeze here too so both blocking paths behave identically.
        await tx.amlFlag.create({
          data: {
            userId: kyc.userId,
            rule: "SANCTIONS_SCREEN",
            severity: "CRITICAL",
            status: "OPEN",
            details: {
              provider: screening.provider,
              matches: screening.matches,
              screenedAt: screening.screenedAt.toISOString(),
            },
          },
        });
        await tx.user.update({
          where: { id: kyc.userId },
          data: { isFrozen: true },
        });
        await tx.notification.create({
          data: {
            userId: kyc.userId,
            transactionId: null,
            status: "DEPOSIT",
            title: "KYC Not Approved",
            message:
              "Your KYC verification could not be approved at this time.",
          },
        });
      });

      await audit.log(adminId, "KYC_REJECTED_SANCTIONS", kyc.userId, {
        kycId,
        provider: screening.provider,
        matches: screening.matches,
      });

      return prisma.kYC.findUniqueOrThrow({
        where: { id: kycId },
        include: { user: true },
      });
    }

    // ── Cleared ⇒ promote (existing behavior, now after a passing screen) ──
    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.kYC.update({
        where: { id: kycId },
        data: {
          verificationStatus: "VERIFIED",
          updatedAt: new Date(),
        },
        include: { user: true },
      });

      // KYC approved ⇒ the user earns the standard VERIFIED tier + limits.
      await tx.user.update({
        where: { id: updated.userId },
        data: { tier: "VERIFIED" },
      });

      await tx.notification.create({
        data: {
          userId: updated.userId,
          transactionId: null,
          status: "DEPOSIT",
          title: "KYC Approved",
          message:
            "Your KYC verification has been approved. Your account is now verified with higher transaction limits.",
        },
      });

      return updated;
    });

    await audit.log(adminId, "KYC_APPROVED", kyc.userId, {
      kycId,
      screening: {
        provider: screening.provider,
        matches: screening.matches,
      },
    });

    console.log(`Admin ${adminId} approved KYC for user ${kyc.userId}`);
    return updated;
  }

  async rejectKYC(kycId: number, adminId: number, reason?: string) {
    const kyc = await prisma.kYC.update({
      where: { id: kycId },
      data: {
        verificationStatus: "REJECTED",
        updatedAt: new Date(),
      },
      include: {
        user: true,
      },
    });

    await prisma.notification.create({
      data: {
        userId: kyc.userId,
        transactionId: null,
        status: "DEPOSIT",
        title: "KYC Rejected",
        message: `Your KYC verification was rejected. Reason: ${reason || "Please submit valid documents"}`,
      },
    });

    console.log(`Admin ${adminId} rejected KYC for user ${kyc.userId}`);

    return kyc;
  }
}
