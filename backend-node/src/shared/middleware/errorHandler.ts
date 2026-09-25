import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "../utils/AppError";

export const errorHandler = (
  err: AppError | Prisma.PrismaClientKnownRequestError | ZodError | Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  // Log error
  console.error(`[ERROR] ${err.stack || err.message}`);

  // Handle custom AppError (our business errors)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  let statusCode = 500;
  let message = "Internal Server Error";
  let code = "INTERNAL_ERROR";

  // Handle Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        statusCode = 409;
        message = "A record with this value already exists";
        code = "DUPLICATE_ERROR";
        break;
      case "P2025":
        statusCode = 404;
        message = "Record not found";
        code = "NOT_FOUND";
        break;
      default:
        statusCode = 400;
        message = "Database error occurred";
        code = `PRISMA_${err.code}`;
    }
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    statusCode = 400;
    message = "Validation failed";
    code = "VALIDATION_ERROR";
    res.status(statusCode).json({
      success: false,
      error: {
        code,
        message,
        details: err.issues,
      },
    });
    return;
  }

  // Generic fallback
  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
    },
  });
};

// 404 handler for routes not found
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.url} not found`,
    },
  });
};
