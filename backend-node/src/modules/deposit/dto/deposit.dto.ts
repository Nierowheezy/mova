import { z } from "zod";

export const DepositSchema = z.object({
  body: z.object({
    paymentMethodId: z.string().min(1, "Payment method ID is required"),
    amount: z.number().positive("Amount must be greater than 0"),
    idempotencyKey: z
      .string()
      .uuid("A uuid idempotency key is required to prevent duplicate charges"),
  }),
});

export type DepositDto = z.infer<typeof DepositSchema>["body"];