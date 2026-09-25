import { Router } from "express";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import { logger } from "../../shared/utils/logger";

/**
 * Health endpoints for orchestrators / load balancers / uptime probes.
 * Mounted OUTSIDE the /api rate limiter by design — probes must never be
 * throttled or increment per-user limits.
 *
 *  - GET /health  (alias) /  GET /healthz  → liveness: process is up and
 *    serving. Does NOT touch the database (so a DB outage doesn't make
 *    every replica get killed/replaced).
 *  - GET /readyz  → readiness: process is up AND the database answers. This
 *    is what the load balancer should route traffic on — 503 means "stop
 *    sending me requests, I can't serve them yet".
 */
const router = Router();

router.get(["/healthz", "/health"], (_req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

router.get("/readyz", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: "ok",
      db: "up",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ err: error }, "readiness check failed (database unreachable)");
    res.status(503).json({
      status: "unavailable",
      db: "down",
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;