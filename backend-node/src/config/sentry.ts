import * as Sentry from "@sentry/node";
import type { Express } from "express";
import { env } from "./env";
import { logger } from "../shared/utils/logger";

/**
 * Error tracking, explicitly opt-in: without SENTRY_DSN in the environment
 * nothing is initialized and all hooks are no-ops, so local development and
 * the test suite stay completely quiet.
 *
 * When enabled:
 *  - every 4xx/5xx and thrown error is captured (via setupExpressErrorHandler),
 *  - unhandled rejections / exceptions are captured at the process level,
 *  - a 10% trace sample rate keeps our Sentry bill sane in production.
 */
const enabled = Boolean(env.SENTRY_DSN);

export function initSentry(app: Express): boolean {
  if (!enabled) {
    logger.info("Sentry disabled (SENTRY_DSN not set)");
    return false;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: process.env.GIT_SHA, // set by CI on each deploy
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0,
  });

  // Registers an error handler that captures errors and delegates to the
  // app's own error handler. Must be called after routes are mounted.
  Sentry.setupExpressErrorHandler(app);

  registerProcessHandlers();

  logger.info("Sentry enabled");
  return true;
}

/** Capture crashes that would otherwise be silent. */
export function registerProcessHandlers() {
  if (!enabled) return;
  process.on("unhandledRejection", (reason) => {
    Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
  });
  process.on("uncaughtException", (error) => {
    Sentry.captureException(error);
  });
}

/** Capture an arbitrary error (no-op when disabled). */
export function captureException(error: unknown) {
  if (enabled) Sentry.captureException(error);
}