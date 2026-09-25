import { prisma } from "../../../config/database";
import { AppError } from "../../../shared/utils/AppError";
import { AuditService } from "../../../services/audit.service";

const audit = new AuditService();

export class AdminAmlService {
  /**
   * Paginated list of AML flags, filterable by status / severity / rule /
   * user. Used by the ops queue in the admin dashboard.
   */
  async listFlags(opts: {
    status?: string;
    severity?: string;
    rule?: string;
    userId?: number;
    page: number;
    limit: number;
  }) {
    const where: any = {};
    if (opts.status) where.status = opts.status;
    if (opts.severity) where.severity = opts.severity;
    if (opts.rule) where.rule = opts.rule;
    if (opts.userId) where.userId = opts.userId;

    const skip = (opts.page - 1) * opts.limit;
    const [flags, total] = await Promise.all([
      prisma.amlFlag.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              tier: true,
              isFrozen: true,
            },
          },
        },
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        skip,
        take: opts.limit,
      }),
      prisma.amlFlag.count({ where }),
    ]);

    return { flags, total };
  }

  async getFlag(flagId: number) {
    const flag = await prisma.amlFlag.findUnique({
      where: { id: flagId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            tier: true,
            isFrozen: true,
            createdAt: true,
          },
        },
      },
    });
    if (!flag) throw new AppError("AML flag not found", 404, "AML_FLAG_NOT_FOUND");
    return flag;
  }

  /** Aggregate metrics for the ops dashboard header. */
  async getSummary() {
    const [open, underReview, escalated, dismissed, total] = await Promise.all([
      prisma.amlFlag.count({ where: { status: "OPEN" } }),
      prisma.amlFlag.count({ where: { status: "UNDER_REVIEW" } }),
      prisma.amlFlag.count({ where: { status: "ESCALATED" } }),
      prisma.amlFlag.count({ where: { status: "DISMISSED" } }),
      prisma.amlFlag.count(),
    ]);
    return { open, underReview, escalated, dismissed, total };
  }

  /**
   * Move a flag through its lifecycle. Records who reviewed it, when, and why
   * (audit + reviewNote), so every AML decision is an auditable trail.
   */
  async reviewFlag(
    flagId: number,
    adminId: number,
    status: "UNDER_REVIEW" | "DISMISSED" | "ESCALATED",
    note?: string,
  ) {
    const current = await prisma.amlFlag.findUnique({ where: { id: flagId } });
    if (!current) throw new AppError("AML flag not found", 404, "AML_FLAG_NOT_FOUND");
    if (current.status === status) return current;

    const flag = await prisma.amlFlag.update({
      where: { id: flagId },
      data: {
        status,
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewNote: note || null,
      },
    });

    await audit.log(adminId, `AML_FLAG_${status}`, flagId, {
      userId: flag.userId,
      rule: flag.rule,
      note: note || null,
    });

    return flag;
  }
}