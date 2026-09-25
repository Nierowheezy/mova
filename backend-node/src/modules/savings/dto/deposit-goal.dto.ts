import { z } from "zod";

export const DepositGoalSchema = z.object({
  body: z.object({
    uuid: z.string().uuid("Invalid goal UUID"),
    amount: z.number().positive("Amount must be greater than 0"),
  }),
});

export type DepositGoalDto = z.infer<typeof DepositGoalSchema>["body"];
