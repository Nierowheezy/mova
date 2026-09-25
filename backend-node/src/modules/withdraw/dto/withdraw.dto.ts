import { z } from "zod";

export const WithdrawSchema = z.object({
  body: z.object({
    amount: z.number().positive("Amount must be greater than 0"),
    currency: z.string().default("usd"),
    idempotencyKey: z
      .string()
      .uuid("A uuid idempotency key is required to prevent duplicate payouts"),
  }),
});

export type WithdrawDto = z.infer<typeof WithdrawSchema>["body"];