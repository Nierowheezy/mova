import { NextFunction, Request, Response } from "express";
import * as client from "@prometheus-io/client";
import { env } from "../../config/env";
import { logger } from "../utils/logger";

/**
 * Prometheus metrics for fleet-wide observability.
 *
 * Enabled explicitly with METRICS_ENABLED=true (default off). When enabled:
 *  - process/runtime metrics (collectDefaultMetrics, prefix `fintech_`),
 *  - HTTP latency histogram + request counter, labeled by method, normalized
 *    route (UUIDs/ids become :uuid/:id so cardinality stays bounded), and
 *    status class, e.g.:
 *      fintech_http_request_duration_seconds{method="POST",route="/api/v1/transfer",status_code="201"}
 *
 * Security note: /metrics is intentionally NOT under /api/v1 (no auth), but it
 * SHOULD only ever be reachable from your monitoring network / scraping proxy
 * (firewall, private VPC, or a token-auth sidecar). Never expose it to the
 * public internet — it leaks request volume and internal route names.
 */

export const metricsEnabled = env.METRICS_ENABLED === "true";
export const METRICS_SERVICE_LABEL = "backend-node";

/** Normalize dynamic ids in a URL path so label cardinality stays bounded. */
const UUID_RE =
  /(^|\/)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\/|$)/gi;
const NUM_RE = /(^|\/)\d+(\/|$)/g;
export function normalizeRoute(path: string): string {
  const normalized = path
    .replace(UUID_RE, "$1:uuid$2")
    .replace(NUM_RE, "$1:id$2");
  return normalized || "/";
}

let httpDuration: client.Histogram<string> | undefined;
let httpRequestsTotal: client.Counter<string> | undefined;

if (metricsEnabled) {
  client.collectDefaultMetrics({
    prefix: "fintech_",
    labels: { service: METRICS_SERVICE_LABEL },
  });
  client.register.setDefaultLabels({ service: METRICS_SERVICE_LABEL });

  httpDuration = new client.Histogram({
    name: "fintech_http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status_code"] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  });

  httpRequestsTotal = new client.Counter({
    name: "fintech_http_requests_total",
    help: "Total HTTP requests processed",
    labelNames: ["method", "route", "status_code"] as const,
  });

  logger.info("Metrics enabled at GET /metrics");
}

/** Mounted early: observe every request (including 4xx/5xx and rate-limited ones). */
export function metricsMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  if (!metricsEnabled) return next();
  const start = process.hrtime.bigint();
  _res.on("finish", () => {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    // Use req.originalUrl, NOT req.path: by the time `finish` fires, router
    // internals have rewritten req.url/path relative to the mount point
    // (/api/v1/transactions/<uuid> would collapse to /:uuid). originalUrl is
    // untouched, so labels keep the real endpoint. Strip any query string —
    // labels must be bounded.
    const rawPath = req.originalUrl.split("?")[0];
    const labels = {
      method: req.method,
      route: normalizeRoute(rawPath),
      status_code: String(_res.statusCode),
    };
    httpRequestsTotal?.inc(labels);
    httpDuration?.observe(labels, seconds);
  });
  next();
}

/** Prometheus scrape endpoint (GET /metrics). */
export async function metricsHandler(_req: Request, res: Response) {
  try {
    const body = await client.register.metrics();
    res.setHeader("Content-Type", client.prometheusContentType);
    res.end(body);
  } catch (error) {
    logger.error({ err: error }, "metrics scrape failed");
    res.status(500).end();
  }
}
