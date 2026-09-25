import { z } from "zod";

export const CreateGoalSchema = z.object({
  body: z.object({
    name: z.string().min(3, "Goal name must be at least 3 characters"),
    targetAmount: z.number().positive("Target amount must be greater than 0"),
    targetDate: z
      .string()
      .optional()
      .transform((val) => (val ? new Date(val) : undefined)),
  }),
});

export type CreateGoalDto = z.infer<typeof CreateGoalSchema>["body"];
