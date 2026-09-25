import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const requestId = randomUUID();
  (req as any).id = requestId; // ✅ type assertion bypasses the error
  res.setHeader("X-Request-Id", requestId);
  next();
};
