import { prisma } from "../config/database";
import { Request } from "express";

export class AuditService {
  async log(
    userId: number,
    action: string,
    targetId?: number,
    details?: any,
    req?: Request,
  ) {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        targetId,
        details: details || undefined,
        ip: req?.ip || req?.socket.remoteAddress,
        userAgent: req?.headers["user-agent"],
      },
    });
  }
}
