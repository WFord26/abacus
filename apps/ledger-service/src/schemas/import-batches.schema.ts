import { z } from "zod";

export const importBatchParamsSchema = z.object({
  importBatchId: z.string().uuid(),
});

export const importTransactionsCsvFieldsSchema = z.object({
  accountId: z.string().uuid(),
});
