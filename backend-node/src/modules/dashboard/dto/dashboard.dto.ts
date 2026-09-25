import { z } from "zod";

export const DashboardQuerySchema = z.object({
  query: z.object({
    transactionLimit: z.coerce.number().int().positive().max(20).default(5),
  }),
});

export type DashboardQueryDto = z.infer<typeof DashboardQuerySchema>["query"];
