import { z } from "zod";

export const StatementQuerySchema = z.object({
  query: z.object({
    startDate: z.string().transform((val) => new Date(val)),
    endDate: z.string().transform((val) => new Date(val)),
    format: z.enum(["pdf"]).default("pdf"),
  }),
});

export type StatementQueryDto = z.infer<typeof StatementQuerySchema>["query"];
