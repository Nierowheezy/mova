import { z } from "zod";

export const Login2FASchema = z.object({
  body: z.object({
    tempToken: z.string(),
    twoFactorCode: z.string().min(6),
  }),
});

export type Login2FADto = z.infer<typeof Login2FASchema>["body"];
