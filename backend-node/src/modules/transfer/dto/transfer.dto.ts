import { z } from "zod";

export const TransferSchema = z.object({
  body: z.object({
    walletId: z.string().min(10, "Valid wallet ID is required"),
    amount: z.number().positive("Amount must be greater than 0"),
    transactionPin: z.string().min(4, "Transaction PIN is required"),
    saveBeneficiary: z.boolean().optional().default(false),
    idempotencyKey: z
      .string()
      .uuid("Invalid idempotency key format")
      .optional(),
  }),
});

export type TransferDto = z.infer<typeof TransferSchema>["body"];
