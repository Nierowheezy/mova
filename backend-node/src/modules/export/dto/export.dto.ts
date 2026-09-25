import { z } from "zod";

export const ExportQuerySchema = z.object({
  query: z.object({
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    type: z.enum(["DEPOSIT", "TRANSFER", "WITHDRAWAL", "SAVINGS"]).optional(),
    format: z.enum(["csv"]).default("csv"),
  }),
});

export type ExportQueryDto = z.infer<typeof ExportQuerySchema>["query"];
