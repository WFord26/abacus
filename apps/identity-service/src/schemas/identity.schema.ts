import { z } from "zod";

const roleSchema = z.enum(["owner", "admin", "accountant", "viewer"]);

export const organizationParamsSchema = z.object({
  orgId: z.string().uuid(),
});

export const organizationMemberParamsSchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const updateMeBodySchema = z
  .object({
    avatarUrl: z.string().url().nullable().optional(),
    name: z.string().trim().min(1).max(120).nullable().optional(),
  })
  .refine((value) => value.name !== undefined || value.avatarUrl !== undefined, {
    message: "At least one field must be provided",
    path: ["name"],
  });

export const createOrganizationBodySchema = z.object({
  businessType: z.string().trim().min(1).max(120).nullable().optional(),
  name: z.string().trim().min(1).max(120),
});

export const updateOrganizationBodySchema = z
  .object({
    businessType: z.string().trim().min(1).max(120).nullable().optional(),
    name: z.string().trim().min(1).max(120).optional(),
  })
  .refine((value) => value.name !== undefined || value.businessType !== undefined, {
    message: "At least one field must be provided",
    path: ["name"],
  });

export const inviteMemberBodySchema = z.object({
  email: z.string().trim().email(),
  role: roleSchema.default("viewer"),
});

export const switchOrganizationBodySchema = z.object({
  organizationId: z.string().uuid(),
});

export const updateMemberRoleBodySchema = z.object({
  role: roleSchema,
});

export const registerBodySchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(128),
});

export const loginBodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});
