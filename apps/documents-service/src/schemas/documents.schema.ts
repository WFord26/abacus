import { z } from "zod";

const maxDocumentSizeBytes = 25 * 1024 * 1024;
const allowedDocumentContentTypes = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "application/pdf",
] as const;

export const documentIdParamsSchema = z.object({
  documentId: z.string().uuid(),
});

export const transactionIdParamsSchema = z.object({
  transactionId: z.string().uuid(),
});

export const documentTransactionParamsSchema = z.object({
  documentId: z.string().uuid(),
  transactionId: z.string().uuid(),
});

export const uploadUrlBodySchema = z.object({
  contentType: z.enum(allowedDocumentContentTypes),
  filename: z.string().trim().min(1, "Filename is required").max(255, "Filename is too long"),
  size: z
    .number()
    .int()
    .positive("Size must be positive")
    .max(maxDocumentSizeBytes, `File size must be ${maxDocumentSizeBytes} bytes or less`),
});

export const finalizeDocumentBodySchema = z.object({
  documentId: z.string().uuid(),
  s3Key: z.string().trim().min(1, "s3Key is required").max(1024),
});

export const listDocumentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  page: z.coerce.number().int().min(1).default(1),
});

export const linkTransactionBodySchema = z.object({
  transactionId: z.string().uuid(),
});

export const documentsServiceConstraints = {
  allowedDocumentContentTypes,
  maxDocumentSizeBytes,
};
