import { z } from "zod";

const colorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Color must be a valid hex value");

export const categoryParamsSchema = z.object({
  categoryId: z.string().uuid(),
});

export const createCategoryBodySchema = z.object({
  color: colorSchema.nullable().optional(),
  name: z.string().trim().min(1).max(120),
  parentId: z.string().uuid().nullable().optional(),
});

export const updateCategoryBodySchema = z
  .object({
    color: colorSchema.nullable().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    parentId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined || value.color !== undefined || value.parentId !== undefined,
    {
      message: "At least one field must be provided",
      path: ["name"],
    }
  );
