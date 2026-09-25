import pino from "pino";
import { Request } from "express";

// Configure logger for production (JSON) or development (pretty)
const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: isProduction ? "info" : "debug",
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
  formatters: {
    bindings: (bindings) => {
      return { pid: bindings.pid };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Helper to add request ID to log entries
export const getChildLogger = (req: Request) => {
  const requestId = (req as any).id || "no-request-id";
  return logger.child({ requestId });
};

// Replace console methods (optional, for legacy code)
if (!isProduction) {
  // In development, keep console for simplicity
} else {
  console.log = (...args) => logger.info(args);
  console.error = (...args) => logger.error(args);
  console.warn = (...args) => logger.warn(args);
}
