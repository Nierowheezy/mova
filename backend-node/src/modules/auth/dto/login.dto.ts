import { z } from "zod";

export const LoginDtoSchema = z.object({
  body: z.object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(1, "Password is required"),
  }),
});

export type LoginDto = z.infer<typeof LoginDtoSchema>["body"];
