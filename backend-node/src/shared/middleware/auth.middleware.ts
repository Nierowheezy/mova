import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../../config/jwt";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "No token provided",
      },
    });
    return;
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid or expired token",
      },
    });
    return;
  }

  req.user = payload;
  next();
};

// Optional: Role-based middleware (for future admin routes)
export const requireVerifiedKYC = async (
  _req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  // This will be implemented when we create the KYC service
  // For now, it's a placeholder
  next();
};
