// import morgan from "morgan";
// import { Request, Response } from "express";

// // Custom morgan token for request ID (we'll add request ID later)
// morgan.token("req-id", (req: Request) => (req as any).id || "-");

// // Development logging (colorful, concise)
// export const devLogger = morgan("dev");

// // Production logging (structured, with timestamp and request ID)
// export const prodLogger = morgan(
//   ':remote-addr - :req-id [:date[clf]] ":method :url" :status :res[content-length] - :response-time ms',
// );

// // Choose logger based on environment
// export const logger =
//   process.env.NODE_ENV === "production" ? prodLogger : devLogger;

/***Using Pino instead */

/*** Using Pino instead */

import pinoHttp from "pino-http";
import { logger as pinoLogger } from "../utils/logger"; // ✅ renamed import

export const logger = pinoHttp({
  logger: pinoLogger, // ✅ use renamed
  customProps: (req) => ({
    requestId: (req as any).id,
  }),
  customLogLevel: (res, _err) => {
    // res.statusCode may not be set yet; use the finished response's statusCode
    const statusCode = res.statusCode || (res as any).statusCode || 200;
    if (statusCode >= 500) return "error";
    if (statusCode >= 400) return "warn";
    return "info";
  },
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    }),
    res: (res) => ({
      statusCode: res.statusCode,
    }),
  },
});
