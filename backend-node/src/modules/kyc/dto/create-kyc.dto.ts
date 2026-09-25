import { z } from "zod";

export const CreateKYCSchema = z.object({
  body: z.object({
    fullName: z.string().min(3, "Full name must be at least 3 characters"),
    dateOfBirth: z.string().transform((str) => new Date(str)),
    idType: z.enum(["NATIONAL_ID", "DRIVERS_LICENSE", "PASSPORT"]),
    idImage: z
      .string()
      .min(1, "ID image is required")
      .describe("fileId returned from the upload endpoint"),
  }),
});

export type CreateKYCDto = z.infer<typeof CreateKYCSchema>["body"];
