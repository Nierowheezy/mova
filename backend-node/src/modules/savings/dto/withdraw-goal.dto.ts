import { z } from "zod";

export const WithdrawGoalSchema = z.object({
  body: z.object({
    uuid: z.string().uuid("Invalid goal UUID"),
  }),
});

export type WithdrawGoalDto = z.infer<typeof WithdrawGoalSchema>["body"];
