import { randomUUID } from "crypto";

export const generateIdempotencyKey = (): string => {
  return randomUUID();
};
