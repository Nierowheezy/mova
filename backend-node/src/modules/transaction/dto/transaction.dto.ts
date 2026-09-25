import { z } from "zod";

export const TransactionQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().min(1).max(100).default(20),
    type: z.enum(["DEPOSIT", "TRANSFER", "WITHDRAWAL", "SAVINGS"]).optional(),
    status: z.enum(["PENDING", "SUCCESSFUL", "FAILED"]).optional(),
    startDate: z
      .string()
      .optional()
      .transform((val) => (val ? new Date(val) : undefined)),
    endDate: z
      .string()
      .optional()
      .transform((val) => (val ? new Date(val) : undefined)),
  }),
});

export type TransactionQueryDto = z.infer<
  typeof TransactionQuerySchema
>["query"];
