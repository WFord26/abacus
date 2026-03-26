import { z } from "zod";

export const invoiceStatusSchema = z.enum(["draft", "sent", "paid", "void"]);

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
const nullableTrimmedString = z.string().trim().max(500).nullable().optional();

export const customerParamsSchema = z.object({
  customerId: z.string().uuid(),
});

export const invoiceParamsSchema = z.object({
  invoiceId: z.string().uuid(),
});

export const customerBodySchema = z.object({
  address: z.record(z.string(), z.string().nullable()).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  name: z.string().trim().min(1).max(255),
  phone: z.string().trim().max(50).nullable().optional(),
});

export const updateCustomerBodySchema = customerBodySchema
  .partial()
  .refine(
    (value) =>
      value.address !== undefined ||
      value.email !== undefined ||
      value.name !== undefined ||
      value.phone !== undefined,
    {
      message: "At least one field must be provided",
      path: ["name"],
    }
  );

export const invoiceLineInputSchema = z.object({
  description: z.string().trim().min(1).max(255),
  quantity: z.number().finite().positive(),
  unitPrice: z.number().finite().min(0),
});

export const createInvoiceBodySchema = z.object({
  customerId: z.string().uuid(),
  dueDate: dateSchema.nullable().optional(),
  issueDate: dateSchema.nullable().optional(),
  lineItems: z.array(invoiceLineInputSchema).min(1),
  notes: nullableTrimmedString,
  taxRate: z.number().finite().min(0).max(100).default(0),
});

export const updateInvoiceBodySchema = z
  .object({
    customerId: z.string().uuid().optional(),
    dueDate: dateSchema.nullable().optional(),
    issueDate: dateSchema.nullable().optional(),
    lineItems: z.array(invoiceLineInputSchema).min(1).optional(),
    notes: nullableTrimmedString,
    status: invoiceStatusSchema.optional(),
    taxRate: z.number().finite().min(0).max(100).optional(),
  })
  .refine(
    (value) =>
      value.customerId !== undefined ||
      value.dueDate !== undefined ||
      value.issueDate !== undefined ||
      value.lineItems !== undefined ||
      value.notes !== undefined ||
      value.status !== undefined ||
      value.taxRate !== undefined,
    {
      message: "At least one field must be provided",
      path: ["customerId"],
    }
  );

export const listInvoicesQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  status: invoiceStatusSchema.optional(),
});
