import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { env } from "./env";

export interface JwtPayload {
  userId: number;
  email: string;
}

export const generateAccessToken = (
  payload: JwtPayload,
  expiresIn: string = env.JWT_ACCESS_EXPIRY,
): string => {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: expiresIn as any });
};

export const generateRefreshToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRY as jwt.SignOptions["expiresIn"],
    // Unique ID guarantees the token is never byte-identical across
    // generations within the same second (token column is unique).
    jwtid: randomUUID(),
  });
};

export const verifyToken = (token: string): JwtPayload | null => {
  try {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
};
