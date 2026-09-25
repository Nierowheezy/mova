import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  // Server
  PORT: z.string().default("8000"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  // Database
  DATABASE_URL: z.string().min(1),

  // JWT
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_ACCESS_EXPIRY: z.string().default("15m"),
  JWT_REFRESH_EXPIRY: z.string().default("14d"),

  // Stripe
  STRIPE_PUBLIC_KEY: z.string().startsWith("pk_"),
  STRIPE_SECRET_KEY: z.string().startsWith("sk_"),
  STRIPE_WEBHOOK_SECRET: z.string().optional(), // For payment_intent webhooks
  STRIPE_CONNECT_WEBHOOK_SECRET: z.string().optional(), // For Connect payout webhooks
  STRIPE_CONNECT_CLIENT_ID: z.string().optional(), // From OAuth settings (ca_...)

  // Frontend
  CLIENT_URL: z.string().url().default("http://localhost:5173"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"), // Alias for convenience

  // File Upload
  MAX_FILE_SIZE: z.string().default("5242880"),
  UPLOAD_DIR: z.string().default("uploads/"),

  RESEND_API_KEY: z.string().min(1),
  FROM_EMAIL: z.string().email(),

  // Encryption
  ENCRYPTION_KEY: z
    .string()
    .length(64, "ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"),

  // Observability (all optional — the app runs fine without them)
  SENTRY_DSN: z.string().optional(), // error tracking; blank/absent = disabled
  METRICS_ENABLED: z.string().default("false"), // "true" exposes GET /metrics

  // Sanctions / PEP screening (see docs/10 + services/sanctions.service.ts)
  //   sandbox      → dev/test permissive; in production it FAILS CLOSED
  //   opensanctions→ screen local OpenSanctions CSV exports; missing dataset
  //                  also fails closed (never fail-open for compliance)
  SANCTIONS_PROVIDER: z
    .enum(["sandbox", "opensanctions"])
    .default("sandbox"),
  SANCTIONS_DATA_DIR: z.string().default("./data/sanctions"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment variables:", parsedEnv.error.format());
  throw new Error("Invalid environment variables");
}

export const env = parsedEnv.data;
