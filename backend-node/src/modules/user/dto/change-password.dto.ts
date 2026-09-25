import { z } from "zod";

const passwordRegex =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

export const ChangePasswordSchema = z.object({
  body: z
    .object({
      currentPassword: z.string().min(1, "Current password is required"),
      newPassword: z
        .string()
        .min(8, "New password must be at least 8 characters")
        .regex(
          passwordRegex,
          "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)",
        ),
      confirmNewPassword: z.string(),
    })
    .refine((data) => data.newPassword === data.confirmNewPassword, {
      message: "New passwords don't match",
      path: ["confirmNewPassword"],
    })
    .refine((data) => data.currentPassword !== data.newPassword, {
      message: "New password must be different from current password",
      path: ["newPassword"],
    }),
});

export type ChangePasswordDto = z.infer<typeof ChangePasswordSchema>["body"];
