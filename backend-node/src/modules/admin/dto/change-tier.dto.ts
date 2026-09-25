import { z } from "zod";

/**
 * DTO for promoting/demoting a customer's KYC tier. Tier drives fraud-control
 * limits (src/config/limits.ts → LIMITS_BY_TIER):
 *   BASIC → VERIFIED → PREMIUM.
 * Ops-only operation, always written to the audit log.
 */
export const ChangeTierSchema = z.object({
  body: z.object({
    tier: z.enum(["BASIC", "VERIFIED", "PREMIUM"], {
      message: "tier must be one of BASIC, VERIFIED, PREMIUM",
    }),
    reason: z.string().min(3).max(500),
  }),
  params: z.object({
    userId: z.string().regex(/^\d+$/, "userId must be a number"),
  }),
});

export type ChangeTierDto = z.infer<typeof ChangeTierSchema>["body"];