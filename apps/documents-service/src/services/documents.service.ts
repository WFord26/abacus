import { randomUUID } from "node:crypto";

import { createEvent } from "@wford26/event-contracts";

import { DocumentsServiceError } from "../lib/errors";

import type { DocumentsEventPublisher } from "../lib/events";
import type { DocumentStorage } from "../lib/storage";
import type { DocumentsRepository } from "../repositories/documents.repo";
import type {
  Document,
  DocumentContentType,
  DocumentListItem,
  DocumentListResponse,
  DocumentWithDownloadUrl,
  TransactionLink,
  UploadUrlResponse,
} from "@wford26/shared-types";

const allowedContentTypes = new Set<DocumentContentType>([
  "image/jpeg",
  "image/png",
  "image/heic",
  "application/pdf",
]);
const maxDocumentSizeBytes = 25 * 1024 * 1024;

type ListedDocumentInput = {
  document: Document;
  linkedTransactionIds: string[];
};

export type DocumentsService = {
  deleteDocument(documentId: string, organizationId: string): Promise<{ deleted: true }>;
  finalizeDocument(input: {
    documentId: string;
    organizationId: string;
    s3Key: string;
    userId: string;
  }): Promise<DocumentListItem>;
  getDocument(documentId: string, organizationId: string): Promise<DocumentWithDownloadUrl>;
  linkTransaction(input: {
    documentId: string;
    organizationId: string;
    transactionId: string;
    userId: string;
  }): Promise<TransactionLink>;
  listDocuments(
    organizationId: string,
    pagination: {
      limit: number;
      page: number;
    }
  ): Promise<DocumentListResponse>;
  listDocumentsByTransaction(
    organizationId: string,
    transactionId: string
  ): Promise<DocumentWithDownloadUrl[]>;
  requestUploadUrl(input: {
    contentType: DocumentContentType;
    filename: string;
    organizationId: string;
    size: number;
    userId: string;
  }): Promise<UploadUrlResponse>;
  unlinkTransaction(input: {
    documentId: string;
    organizationId: string;
    transactionId: string;
  }): Promise<{ deleted: true }>;
};

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function buildDocumentKey(input: { documentId: string; filename: string; organizationId: string }) {
  return `documents/${input.organizationId}/${input.documentId}/${sanitizeFilename(input.filename)}`;
}

async function ensureDocumentExists(
  repository: DocumentsRepository,
  documentId: string,
  organizationId: string
) {
  const document = await repository.findDocumentById(documentId, organizationId);

  if (!document) {
    throw new DocumentsServiceError("DOCUMENT_NOT_FOUND", "Document not found", 404);
  }

  return document;
}

async function ensureTransactionVisible(
  repository: DocumentsRepository,
  transactionId: string,
  organizationId: string
) {
  const transaction = await repository.findTransactionReference(transactionId);

  if (!transaction || !transaction.isActive) {
    throw new DocumentsServiceError("TRANSACTION_NOT_FOUND", "Transaction not found", 404);
  }

  if (transaction.organizationId !== organizationId) {
    throw new DocumentsServiceError("FORBIDDEN", "Cannot link documents across organizations", 403);
  }

  return transaction;
}

async function toListedDocuments(
  repository: DocumentsRepository,
  documents: Document[]
): Promise<DocumentListItem[]> {
  const linkMap = await repository.listTransactionIdsForDocumentIds(
    documents.map((document) => document.id),
    documents[0]?.organizationId ?? ""
  );

  return documents.map((document) => ({
    ...document,
    linkedTransactionIds: linkMap.get(document.id) ?? [],
  }));
}

async function toSignedDocument(
  storage: DocumentStorage,
  listedDocument: ListedDocumentInput
): Promise<DocumentWithDownloadUrl> {
  const download = await storage.createDownloadUrl({
    filename: listedDocument.document.filename,
    key: listedDocument.document.s3Key,
  });

  return {
    ...listedDocument.document,
    downloadUrl: download.url,
    downloadUrlExpiresAt: download.expiresAt,
    linkedTransactionIds: listedDocument.linkedTransactionIds,
  };
}

export function createDocumentsService(
  repository: DocumentsRepository,
  storage: DocumentStorage,
  eventPublisher: DocumentsEventPublisher
): DocumentsService {
  return {
    async deleteDocument(documentId, organizationId) {
      const document = await ensureDocumentExists(repository, documentId, organizationId);

      await storage.deleteObject(document.s3Key);
      await repository.deleteDocument(documentId, organizationId);

      return {
        deleted: true as const,
      };
    },

    async finalizeDocument(input) {
      const document = await ensureDocumentExists(
        repository,
        input.documentId,
        input.organizationId
      );

      if (document.s3Key !== input.s3Key) {
        throw new DocumentsServiceError(
          "VALIDATION_ERROR",
          "s3Key does not match the pending document",
          400,
          {
            path: "s3Key",
          }
        );
      }

      if (document.status !== "pending") {
        throw new DocumentsServiceError(
          "DOCUMENT_ALREADY_FINALIZED",
          "Document has already been finalized",
          409
        );
      }

      const metadata = await storage.getObjectMetadata(document.s3Key);

      if (!metadata) {
        throw new DocumentsServiceError(
          "OBJECT_NOT_FOUND",
          "Uploaded object not found in storage",
          400
        );
      }

      if (
        !metadata.contentType ||
        !allowedContentTypes.has(metadata.contentType as DocumentContentType)
      ) {
        throw new DocumentsServiceError(
          "UNSUPPORTED_CONTENT_TYPE",
          "Uploaded file type is not allowed",
          400
        );
      }

      if (metadata.contentType !== document.contentType) {
        throw new DocumentsServiceError(
          "CONTENT_TYPE_MISMATCH",
          "Uploaded file type does not match the requested content type",
          400
        );
      }

      if (metadata.sizeBytes !== null && metadata.sizeBytes > maxDocumentSizeBytes) {
        throw new DocumentsServiceError(
          "FILE_TOO_LARGE",
          "Uploaded file exceeds the maximum document size",
          400
        );
      }

      const finalizedDocument = await repository.finalizeDocument(
        input.documentId,
        input.organizationId,
        {
          checksum: metadata.checksum,
          contentType: metadata.contentType as DocumentContentType,
          sizeBytes: metadata.sizeBytes,
          status: "uploaded",
        }
      );

      await eventPublisher.publish(
        createEvent("receipt.uploaded", input.organizationId, input.userId, {
          documentId: finalizedDocument.id,
          linkedTransactionId: null,
          s3Key: finalizedDocument.s3Key,
        })
      );

      return {
        ...finalizedDocument,
        linkedTransactionIds: [],
      };
    },

    async getDocument(documentId, organizationId) {
      const document = await ensureDocumentExists(repository, documentId, organizationId);
      const [listedDocument] = await toListedDocuments(repository, [document]);

      return toSignedDocument(storage, {
        document,
        linkedTransactionIds: listedDocument?.linkedTransactionIds ?? [],
      });
    },

    async linkTransaction(input) {
      await ensureDocumentExists(repository, input.documentId, input.organizationId);
      await ensureTransactionVisible(repository, input.transactionId, input.organizationId);

      const existing = await repository.findTransactionLink(
        input.documentId,
        input.organizationId,
        input.transactionId
      );

      if (existing) {
        return existing;
      }

      return repository.createTransactionLink({
        documentId: input.documentId,
        linkedBy: input.userId,
        organizationId: input.organizationId,
        transactionId: input.transactionId,
      });
    },

    async listDocuments(organizationId, pagination) {
      const result = await repository.listDocuments(organizationId, pagination);
      const listedDocuments = await toListedDocuments(repository, result.documents);

      return {
        data: listedDocuments,
        meta: {
          hasMore: pagination.page * pagination.limit < result.total,
          limit: pagination.limit,
          page: pagination.page,
          total: result.total,
        },
      };
    },

    async listDocumentsByTransaction(organizationId, transactionId) {
      await ensureTransactionVisible(repository, transactionId, organizationId);

      const documents = await repository.listDocumentsByTransaction(organizationId, transactionId);
      const listedDocuments = await toListedDocuments(repository, documents);

      return Promise.all(
        listedDocuments.map((document) =>
          toSignedDocument(storage, {
            document,
            linkedTransactionIds: document.linkedTransactionIds,
          })
        )
      );
    },

    async requestUploadUrl(input) {
      if (!allowedContentTypes.has(input.contentType)) {
        throw new DocumentsServiceError(
          "UNSUPPORTED_CONTENT_TYPE",
          "Only JPEG, PNG, HEIC, and PDF uploads are allowed",
          400
        );
      }

      if (input.size > maxDocumentSizeBytes) {
        throw new DocumentsServiceError(
          "FILE_TOO_LARGE",
          "Document uploads are limited to 25MB",
          400
        );
      }

      const documentId = randomUUID();
      const s3Key = buildDocumentKey({
        documentId,
        filename: input.filename,
        organizationId: input.organizationId,
      });

      await repository.createPendingDocument({
        contentType: input.contentType,
        filename: input.filename,
        id: documentId,
        organizationId: input.organizationId,
        s3Bucket: storage.bucketName,
        s3Key,
        sizeBytes: input.size,
        uploadedBy: input.userId,
      });

      const upload = await storage.createUploadUrl({
        contentType: input.contentType,
        key: s3Key,
        sizeBytes: input.size,
      });

      return {
        documentId,
        expiresAt: upload.expiresAt,
        s3Key,
        uploadUrl: upload.url,
      };
    },

    async unlinkTransaction(input) {
      await ensureDocumentExists(repository, input.documentId, input.organizationId);
      await ensureTransactionVisible(repository, input.transactionId, input.organizationId);

      const existing = await repository.findTransactionLink(
        input.documentId,
        input.organizationId,
        input.transactionId
      );

      if (!existing) {
        throw new DocumentsServiceError("LINK_NOT_FOUND", "Document link not found", 404);
      }

      await repository.deleteTransactionLink(
        input.documentId,
        input.organizationId,
        input.transactionId
      );

      return {
        deleted: true as const,
      };
    },
  };
}
