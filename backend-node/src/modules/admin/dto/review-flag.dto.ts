import { z } from "zod";

/**
 * DTO for reviewing an AML flag. Admins move a flag from OPEN to one of:
 *  - UNDER_REVIEW : ops is investigating (keeps it out of the open queue)
 *  - DISMISSED    : investigated and considered a false positive / benign
 *  - ESCALATED    : requires manual action (freeze, SAR filing, legal)
 */
export const ReviewAmlFlagSchema = z.object({
  body: z.object({
    status: z.enum(["UNDER_REVIEW", "DISMISSED", "ESCALATED"]),
    note: z.string().max(1000).optional(),
  }),
  params: z.object({
    flagId: z.string().regex(/^\d+$/, "flagId must be a number"),
  }),
});

export type ReviewAmlFlagDto = z.infer<typeof ReviewAmlFlagSchema>["body"];