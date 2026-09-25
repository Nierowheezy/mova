import { Request, Response, NextFunction } from "express";
import { prisma } from "../../config/database";

export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const userId = req.user?.userId;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user || user.role !== "ADMIN") {
    res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "Admin access required" },
    });
    return;
  }

  next();
};

export const requireSupport = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const userId = req.user?.userId;

  if (!userId) {
    res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (!user || (user.role !== "ADMIN" && user.role !== "SUPPORT")) {
    res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: "Support or Admin access required" },
    });
    return;
  }

  next();
};
