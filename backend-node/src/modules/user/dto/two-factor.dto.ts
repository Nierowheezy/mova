import { z } from "zod";

export const Enable2FASchema = z.object({
  body: z.object({
    password: z.string().min(1, "Password required"),
  }),
});

export const Verify2FASchema = z.object({
  body: z.object({
    token: z.string().length(6, "Token must be 6 digits"),
  }),
});

export const Disable2FASchema = z.object({
  body: z.object({
    password: z.string().min(1, "Password required"),
    token: z.string().length(6, "Token required"),
  }),
});

export const Login2FASchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string(),
    twoFactorCode: z.string().optional(),
  }),
});

export type Enable2FADto = z.infer<typeof Enable2FASchema>["body"];
export type Verify2FADto = z.infer<typeof Verify2FASchema>["body"];
export type Disable2FADto = z.infer<typeof Disable2FASchema>["body"];
export type Login2FADto = z.infer<typeof Login2FASchema>["body"];
