import { z } from "zod";

export const reviewStatusSchema = z.enum(["unreviewed", "reviewed", "flagged"]);

const transactionDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

const amountSchema = z
  .number()
  .finite()
  .refine((value) => value !== 0, {
    message: "Amount must be non-zero",
  });

export const transactionParamsSchema = z.object({
  transactionId: z.string().uuid(),
});

export const createTransactionBodySchema = z.object({
  accountId: z.string().uuid(),
  amount: amountSchema,
  categoryId: z.string().uuid().nullable().optional(),
  date: transactionDateSchema,
  description: z.string().trim().max(500).nullable().optional(),
  merchantRaw: z.string().trim().max(255).nullable().optional(),
});

export const reviewTransactionBodySchema = z.object({
  status: reviewStatusSchema,
});

export const updateTransactionBodySchema = z
  .object({
    amount: amountSchema.optional(),
    categoryId: z.string().uuid().nullable().optional(),
    date: transactionDateSchema.optional(),
    description: z.string().trim().max(500).nullable().optional(),
    merchantRaw: z.string().trim().max(255).nullable().optional(),
  })
  .refine(
    (value) =>
      value.amount !== undefined ||
      value.categoryId !== undefined ||
      value.date !== undefined ||
      value.description !== undefined ||
      value.merchantRaw !== undefined,
    {
      message: "At least one field must be provided",
      path: ["amount"],
    }
  );

export const listTransactionsQuerySchema = z
  .object({
    accountId: z.string().uuid().optional(),
    amountMax: z.coerce.number().finite().optional(),
    amountMin: z.coerce.number().finite().optional(),
    categoryId: z.string().uuid().optional(),
    dateFrom: transactionDateSchema.optional(),
    dateTo: transactionDateSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    page: z.coerce.number().int().min(1).default(1),
    q: z.string().trim().max(255).optional(),
    status: reviewStatusSchema.optional(),
  })
  .refine(
    (value) =>
      value.amountMin === undefined ||
      value.amountMax === undefined ||
      value.amountMin <= value.amountMax,
    {
      message: "amountMin must be less than or equal to amountMax",
      path: ["amountMin"],
    }
  );
