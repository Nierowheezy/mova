import { z } from "zod";

// Password regex:
// - At least 8 characters
// - At least 1 uppercase letter
// - At least 1 lowercase letter
// - At least 1 number
// - At least 1 special character
const passwordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

export const RegisterDtoSchema = z.object({
  body: z
    .object({
      email: z.string().email("Invalid email format"),
      password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(
          passwordRegex,
          "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)",
        ),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: "Passwords don't match",
      path: ["confirmPassword"],
    }),
});

export type RegisterDto = z.infer<typeof RegisterDtoSchema>["body"];
