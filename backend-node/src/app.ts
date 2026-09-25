import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import cookieParser from "cookie-parser";
import { env } from "./config";
import { logger } from "./shared/middleware/logger.middleware";
import { authenticate } from "./shared/middleware/auth.middleware";
import { upload } from "./services/fileUpload.service";
import { FileUploadController } from "./modules/core/fileUpload.controller";

const fileUploadController = new FileUploadController();
import {
  errorHandler,
  notFoundHandler,
} from "./shared/middleware/errorHandler";
import { apiLimiter } from "./shared/middleware/rateLimiter";
import authRoutes from "./modules/auth/auth.routes";
import kycRoutes from "./modules/kyc/kyc.routes";
import walletRoutes from "./modules/wallet/wallet.routes";
import adminRoutes from "./modules/admin/admin.routes";
import transferRoutes from "./modules/transfer/transfer.routes";
import userRoutes from "./modules/user/user.routes";
import transactionRoutes from "./modules/transaction/transaction.routes";
import beneficiaryRoutes from "./modules/beneficiary/beneficiary.routes";
import depositRoutes from "./modules/deposit/deposit.routes";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";
import savingsRoutes from "./modules/savings/savings.routes";
import webhookRoutes from "./modules/webhook/webhook.routes";
import exportRoutes from "./modules/export/export.routes";
import connectRoutes from "./modules/connect/connect.routes";
import withdrawRoutes from "./modules/withdraw/withdraw.routes";
import notificationRoutes from "./modules/notification/notification.routes";
import { requestIdMiddleware } from "./shared/middleware/requestId.middleware";
import {
  metricsEnabled,
  metricsHandler,
  metricsMiddleware,
} from "./shared/middleware/metrics.middleware";
import swaggerUi from "swagger-ui-express";
import { specs } from "./config/swagger";
import healthRoutes from "./modules/health/health.routes";
import { initSentry } from "./config/sentry";

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Compression
app.use(compression());

// ⚠️ Webhooks MUST be registered BEFORE the JSON body parser: Stripe signature
// verification needs the exact raw request body, and express.json() consumes
// the stream, making verification impossible. The webhook router applies its
// own `bodyParser.raw()` for /webhook/*.
app.use("/webhook", webhookRoutes);

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Cookie parser
app.use(cookieParser());

// ✅ Request ID middleware – must be BEFORE logging and rate limiting
app.use(requestIdMiddleware);

// Metrics (opt-in, METRICS_ENABLED=true): observes every request, labeled by
// method / normalized route / status code. Mounted before logging/rate limits
// (after requestId) so throttled and early-failing requests are counted too.
if (metricsEnabled) {
  app.use(metricsMiddleware);
}

// Logging (now has access to request ID)
app.use(logger);

// Rate limiting (after request ID)
app.use("/api/", apiLimiter);

// Health & readiness endpoints (no rate limiting, no auth) — used by
// load balancers, orchestrators and uptime probes.
app.use(healthRoutes);

// Prometheus scrape endpoint (only when metrics are enabled). Keep this behind
// your monitoring network / scraping proxy — never public.
if (metricsEnabled) {
  app.get("/metrics", metricsHandler);
}

// API routes
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/user", userRoutes);
app.use("/api/v1/kyc", kycRoutes);
app.use("/api/v1/wallet", walletRoutes);
app.use("/api/v1/transfer", transferRoutes);
app.use("/api/v1/transactions", transactionRoutes);
app.use("/api/v1/beneficiaries", beneficiaryRoutes);
app.use("/api/v1/deposit", depositRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/savings", savingsRoutes);
app.use("/api/v1/connect", connectRoutes);
app.use("/api/v1/withdraw", withdrawRoutes);
app.use("/api/v1/export", exportRoutes);
app.use("/api/v1/notifications", notificationRoutes);

// File upload (authenticated) — used by the frontend KYC flow.
// Uploaded files are stored privately and served only via the authenticated
// KYC document endpoint (NO public static exposure of PII).
app.post(
  "/api/v1/upload",
  authenticate,
  upload.single("file"),
  fileUploadController.uploadFile.bind(fileUploadController),
);

// API documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

// 404 handler
app.use(notFoundHandler);

// Global error handler
// Sentry must register its error handling BEFORE the app's catch-all so it can
// capture the error and still delegate to the standard envelope response.
const sentryEnabled = initSentry(app);
if (sentryEnabled) {
  console.log("🆗 Sentry error tracking enabled");
}
app.use(errorHandler);

export { app };