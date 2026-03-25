export type DocumentStatus = "pending" | "uploaded" | "processing" | "ready" | "failed";

export type Document = {
  id: string;
  organizationId: string;
  uploadedBy: string;
  filename: string;
  contentType: "image/jpeg" | "image/png" | "image/heic" | "application/pdf";
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
  contentType: Document["contentType"];
  size: number;
};

export type UploadUrlResponse = {
  documentId: string;
  uploadUrl: string;
  s3Key: string;
  expiresAt: string;
};
