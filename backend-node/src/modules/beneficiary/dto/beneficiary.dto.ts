import { z } from "zod";

export const AddBeneficiarySchema = z.object({
  body: z.object({
    walletId: z.string().min(10, "Valid wallet ID is required"),
  }),
});

export type AddBeneficiaryDto = z.infer<typeof AddBeneficiarySchema>["body"];
