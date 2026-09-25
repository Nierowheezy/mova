import { JwtPayload } from "../../config/jwt";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      id?: string; // For request ID tracking
    }
  }
}

export {};
