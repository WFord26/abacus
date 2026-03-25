import { z } from "zod";

const accountTypeSchema = z.enum(["cash", "credit", "expense", "income", "liability", "equity"]);

export const accountParamsSchema = z.object({
  accountId: z.string().uuid(),
});

export const createAccountBodySchema = z.object({
  code: z.string().trim().min(1).max(32).nullable().optional(),
  name: z.string().trim().min(1).max(120),
  type: accountTypeSchema,
});

export const updateAccountBodySchema = z
  .object({
    code: z.string().trim().min(1).max(32).nullable().optional(),
    name: z.string().trim().min(1).max(120).optional(),
  })
  .refine((value) => value.name !== undefined || value.code !== undefined, {
    message: "At least one field must be provided",
    path: ["name"],
  });
