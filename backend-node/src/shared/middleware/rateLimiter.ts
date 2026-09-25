import rateLimit, { ipKeyGenerator } from "express-rate-limit";

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  keyGenerator: (req) => {
    const userId = (req as any).user?.userId;
    const ip = req.ip ?? "unknown"; // ✅ fallback for undefined
    const baseKey = userId ? `user-${userId}` : ipKeyGenerator(ip);
    return baseKey;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests, please try again later.",
    },
  },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: (req) => {
    const email = req.body?.email || "";
    const ip = req.ip ?? "unknown";
    const baseKey = `${ipKeyGenerator(ip)}-${email}`;
    return baseKey;
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: {
      code: "TOO_MANY_ATTEMPTS",
      message: "Too many authentication attempts, please try again later.",
    },
  },
});

export const transactionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => {
    const userId = (req as any).user?.userId;
    const ip = req.ip ?? "unknown";
    const baseKey = userId ? `user-${userId}` : ipKeyGenerator(ip);
    return baseKey;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "TOO_MANY_TRANSACTIONS",
      message: "Too many transactions, please slow down.",
    },
  },
});
