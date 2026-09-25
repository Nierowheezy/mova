import { Response } from "express";
import { env } from "../../config";

export const setRefreshTokenCookie = (
  res: Response,
  refreshToken: string,
): void => {
  res.cookie("refresh", refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    // Cross-site (Vercel frontend -> Render backend) requires "none" in prod
    // with Secure. Localhost dev keeps "lax" (same-site).
    sameSite: env.NODE_ENV === "production" ? ("none" as const) : ("lax" as const),
    maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days in milliseconds
  });
};

export const clearRefreshTokenCookie = (res: Response): void => {
  res.clearCookie("refresh", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? ("none" as const) : ("lax" as const),
  });
};
