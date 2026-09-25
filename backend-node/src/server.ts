import { app } from "./app";
import { env } from "./config";
import { prisma } from "./config/database";
import { metricsEnabled } from "./shared/middleware/metrics.middleware";

const PORT = parseInt(env.PORT, 10);
let server: any;

const startServer = async () => {
  try {
    await prisma.$connect();
    console.log("✅ Database connected successfully");

    server = app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📝 Environment: ${env.NODE_ENV}`);
      console.log(
        `🔑 Stripe: ${env.STRIPE_PUBLIC_KEY ? "Configured" : "Missing"}`,
      );
      console.log(
        `📈 Metrics: ${
          metricsEnabled
            ? "enabled at /metrics (Prometheus + Grafana ready)"
            : 'disabled (set METRICS_ENABLED=true to expose /metrics)'
        }`,
      );
      console.log(
        `🩺 Health: /healthz (liveness) · /readyz (readiness, DB ping)`,
      );
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

const shutdown = async () => {
  console.log("🛑 Shutting down gracefully...");
  if (server) {
    server.close(async () => {
      await prisma.$disconnect();
      console.log("📴 Server closed");
      process.exit(0);
    });
  } else {
    await prisma.$disconnect();
    process.exit(0);
  }
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

startServer();
