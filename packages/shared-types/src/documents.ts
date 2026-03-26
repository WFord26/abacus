import type { PaginatedResponse } from "./api";

export type DocumentStatus = "pending" | "uploaded" | "processing" | "ready" | "failed";

export type DocumentContentType = "image/jpeg" | "image/png" | "image/heic" | "application/pdf";

export type Document = {
  id: string;
  organizationId: string;
  uploadedBy: string;
  filename: string;
  contentType: DocumentContentType;
  sizeBytes?: number | null;
  s3Key: string;
  s3Bucket: string;
  checksum?: string | null;
  status: DocumentStatus;
  createdAt: string;
};

export type TransactionLink = {
  id: string;
  documentId: string;
  transactionId: string;
  organizationId: string;
  linkedBy: string;
  createdAt: string;
};

export type UploadUrlRequest = {
  filename: string;
  contentType: DocumentContentType;
  size: number;
};

export type UploadUrlResponse = {
  documentId: string;
  uploadUrl: string;
  s3Key: string;
  expiresAt: string;
};

export type FinalizeDocumentRequest = {
  documentId: string;
  s3Key: string;
};

export type DocumentListItem = Document & {
  linkedTransactionIds: string[];
};

export type DocumentWithDownloadUrl = DocumentListItem & {
  downloadUrl: string;
  downloadUrlExpiresAt: string;
};

export type DocumentListResponse = PaginatedResponse<DocumentListItem>;

export type LinkTransactionRequest = {
  transactionId: string;
};
