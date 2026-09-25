import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";
import { resetDatabase } from "./helpers";
import { normalizeRoute } from "../src/shared/middleware/metrics.middleware";

describe("health & readiness endpoints", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  it("GET /healthz reports the process is up", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.uptime).toBe("number");
  });

  it("GET /health (legacy alias) still works", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
  });

  it("GET /readyz returns 200 when the database answers", async () => {
    const res = await request(app).get("/readyz");
    expect(res.status).toBe(200);
    expect(res.body.db).toBe("up");
  });

  it("GET /metrics is NOT exposed unless METRICS_ENABLED=true", async () => {
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(404);
  });
});

describe("metrics route-label normalization", () => {
  it("collapses uuids and numeric ids to bounded labels", () => {
    expect(normalizeRoute("/api/v1/transactions/70613404-f7f1-40a3-bfba-6b09a58b0ba5")).toBe(
      "/api/v1/transactions/:uuid",
    );
    expect(normalizeRoute("/api/v1/admin/users/42")).toBe("/api/v1/admin/users/:id");
    expect(normalizeRoute("/api/v1/transfer")).toBe("/api/v1/transfer");
  });
});