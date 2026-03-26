import { randomUUID } from "node:crypto";

import { signToken } from "@wford26/auth-sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildDocumentsServiceApp } from "../../src/app";

import type { DocumentsEventPublisher } from "../../src/lib/events";
import type {
  DocumentStorage,
  DocumentStorageMetadata,
  DocumentStoragePresignedUrl,
} from "../../src/lib/storage";
import type { DocumentsRepository } from "../../src/repositories/documents.repo";
import type { AbacusEvent } from "@wford26/event-contracts";
import type { Document, DocumentContentType, TransactionLink } from "@wford26/shared-types";

const JWT_SECRET = "documents-test-secret";

type StoredDocument = Document;
type TransactionReference = {
  id: string;
  isActive: boolean;
  organizationId: string;
};

type RepoState = {
  documents: Map<string, StoredDocument>;
  links: Map<string, TransactionLink>;
  publishedEvents: AbacusEvent[];
  storageMetadata: Map<string, DocumentStorageMetadata>;
  transactions: Map<string, TransactionReference>;
};

function createDocumentRecord(input: {
  checksum?: string | null;
  contentType: DocumentContentType;
  filename: string;
  id?: string;
  organizationId: string;
  s3Bucket?: string;
  s3Key: string;
  sizeBytes?: number | null;
  status?: Document["status"];
  uploadedBy: string;
}): Document {
  return {
    checksum: input.checksum ?? null,
    contentType: input.contentType,
    createdAt: new Date().toISOString(),
    filename: input.filename,
    id: input.id ?? randomUUID(),
    organizationId: input.organizationId,
    s3Bucket: input.s3Bucket ?? "test-bucket",
    s3Key: input.s3Key,
    sizeBytes: input.sizeBytes ?? null,
    status: input.status ?? "pending",
    uploadedBy: input.uploadedBy,
  };
}

function buildLinkKey(documentId: string, transactionId: string) {
  return `${documentId}:${transactionId}`;
}

function createRepository(state: RepoState): DocumentsRepository {
  return {
    async createPendingDocument(input) {
      const document = createDocumentRecord({
        contentType: input.contentType,
        filename: input.filename,
        id: input.id,
        organizationId: input.organizationId,
        s3Bucket: input.s3Bucket,
        s3Key: input.s3Key,
        sizeBytes: input.sizeBytes,
        uploadedBy: input.uploadedBy,
      });

      state.documents.set(document.id, document);
      return document;
    },

    async createTransactionLink(input) {
      const link: TransactionLink = {
        createdAt: new Date().toISOString(),
        documentId: input.documentId,
        id: randomUUID(),
        linkedBy: input.linkedBy,
        organizationId: input.organizationId,
        transactionId: input.transactionId,
      };

      state.links.set(buildLinkKey(input.documentId, input.transactionId), link);
      return link;
    },

    async deleteDocument(documentId, organizationId) {
      const existing = state.documents.get(documentId);

      if (!existing || existing.organizationId !== organizationId) {
        return;
      }

      state.documents.delete(documentId);

      for (const [key, link] of state.links.entries()) {
        if (link.documentId === documentId && link.organizationId === organizationId) {
          state.links.delete(key);
        }
      }
    },

    async deleteTransactionLink(documentId, organizationId, transactionId) {
      const existing = state.links.get(buildLinkKey(documentId, transactionId));

      if (!existing || existing.organizationId !== organizationId) {
        return;
      }

      state.links.delete(buildLinkKey(documentId, transactionId));
    },

    async finalizeDocument(documentId, organizationId, input) {
      const existing = state.documents.get(documentId);

      if (!existing || existing.organizationId !== organizationId) {
        throw new Error("Document not found");
      }

      const updated: Document = {
        ...existing,
        checksum: input.checksum,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        status: input.status,
      };

      state.documents.set(documentId, updated);
      return updated;
    },

    async findDocumentById(documentId, organizationId) {
      const document = state.documents.get(documentId);
      return document && document.organizationId === organizationId ? document : null;
    },

    async findTransactionLink(documentId, organizationId, transactionId) {
      const link = state.links.get(buildLinkKey(documentId, transactionId));
      return link && link.organizationId === organizationId ? link : null;
    },

    async findTransactionReference(transactionId) {
      return state.transactions.get(transactionId) ?? null;
    },

    async listDocuments(organizationId, pagination) {
      const documents = [...state.documents.values()]
        .filter((document) => document.organizationId === organizationId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      const start = (pagination.page - 1) * pagination.limit;

      return {
        documents: documents.slice(start, start + pagination.limit),
        total: documents.length,
      };
    },

    async listDocumentsByTransaction(organizationId, transactionId) {
      return [...state.links.values()]
        .filter(
          (link) => link.organizationId === organizationId && link.transactionId === transactionId
        )
        .map((link) => state.documents.get(link.documentId))
        .filter((document): document is Document => Boolean(document));
    },

    async listTransactionIdsForDocumentIds(documentIds, organizationId) {
      const documentIdSet = new Set(documentIds);
      const map = new Map<string, string[]>();

      for (const link of state.links.values()) {
        if (link.organizationId !== organizationId || !documentIdSet.has(link.documentId)) {
          continue;
        }

        const existing = map.get(link.documentId) ?? [];
        existing.push(link.transactionId);
        map.set(link.documentId, existing);
      }

      return map;
    },
  };
}

function createStorage(state: RepoState): DocumentStorage {
  return {
    bucketName: "test-bucket",

    async createDownloadUrl(input) {
      return {
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        url: `https://downloads.test/${encodeURIComponent(input.key)}?filename=${encodeURIComponent(input.filename)}`,
      } satisfies DocumentStoragePresignedUrl;
    },

    async createUploadUrl(input) {
      return {
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        url: `https://uploads.test/${encodeURIComponent(input.key)}?contentType=${encodeURIComponent(input.contentType)}&size=${input.sizeBytes}`,
      } satisfies DocumentStoragePresignedUrl;
    },

    async deleteObject(key) {
      state.storageMetadata.delete(key);
    },

    async getObjectMetadata(key) {
      return state.storageMetadata.get(key) ?? null;
    },
  };
}

function createEventPublisher(state: RepoState): DocumentsEventPublisher {
  return {
    async publish(event) {
      state.publishedEvents.push(event);
    },
  };
}

function createAuthToken(input: {
  organizationId: string;
  role?: "owner" | "admin" | "accountant" | "viewer";
  userId?: string;
}) {
  return signToken(
    {
      email: "tester@example.com",
      organizationId: input.organizationId,
      role: input.role ?? "admin",
      userId: input.userId ?? randomUUID(),
    },
    JWT_SECRET,
    "1h"
  );
}

describe("documents service routes", () => {
  let app: ReturnType<typeof buildDocumentsServiceApp>;
  let state: RepoState;

  beforeEach(() => {
    state = {
      documents: new Map(),
      links: new Map(),
      publishedEvents: [],
      storageMetadata: new Map(),
      transactions: new Map(),
    };

    app = buildDocumentsServiceApp({
      eventPublisher: createEventPublisher(state),
      jwtSecret: JWT_SECRET,
      repository: createRepository(state),
      storage: createStorage(state),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates an upload url, finalizes the document, and publishes receipt.uploaded", async () => {
    const organizationId = randomUUID();
    const userId = randomUUID();
    const token = createAuthToken({
      organizationId,
      userId,
    });

    await app.ready();

    const uploadResponse = await app.inject({
      headers: {
        authorization: `Bearer ${token}`,
      },
      method: "POST",
      payload: {
        contentType: "image/png",
        filename: "receipt.png",
        size: 2048,
      },
      url: "/documents/upload-url",
    });

    expect(uploadResponse.statusCode).toBe(200);
    expect(uploadResponse.json().data.documentId).toEqual(expect.any(String));
    expect(uploadResponse.json().data.s3Key).toContain(organizationId);
    expect(uploadResponse.json().data.uploadUrl).toContain("https://uploads.test/");

    const documentId = uploadResponse.json().data.documentId as string;
    const s3Key = uploadResponse.json().data.s3Key as string;
    state.storageMetadata.set(s3Key, {
      checksum: "etag-123",
      contentType: "image/png",
      sizeBytes: 2048,
    });

    const finalizeResponse = await app.inject({
      headers: {
        authorization: `Bearer ${token}`,
      },
      method: "POST",
      payload: {
        documentId,
        s3Key,
      },
      url: "/documents",
    });

    expect(finalizeResponse.statusCode).toBe(201);
    expect(finalizeResponse.json().data.status).toBe("uploaded");
    expect(finalizeResponse.json().data.linkedTransactionIds).toEqual([]);
    expect(state.publishedEvents).toHaveLength(1);
    expect(state.publishedEvents[0]?.eventType).toBe("receipt.uploaded");
  });

  it("returns a fresh signed download url from GET /documents/:documentId", async () => {
    const organizationId = randomUUID();
    const token = createAuthToken({
      organizationId,
    });
    const document = createDocumentRecord({
      contentType: "application/pdf",
      filename: "invoice.pdf",
      organizationId,
      s3Key: "documents/test/invoice.pdf",
      status: "uploaded",
      uploadedBy: randomUUID(),
    });
    state.documents.set(document.id, document);

    await app.ready();

    const response = await app.inject({
      headers: {
        authorization: `Bearer ${token}`,
      },
      method: "GET",
      url: `/documents/${document.id}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.downloadUrl).toContain("https://downloads.test/");
    expect(response.json().data.id).toBe(document.id);
  });

  it("lists documents with pagination metadata", async () => {
    const organizationId = randomUUID();
    const token = createAuthToken({
      organizationId,
    });

    const first = createDocumentRecord({
      contentType: "image/jpeg",
      filename: "first.jpg",
      organizationId,
      s3Key: "documents/test/first.jpg",
      status: "uploaded",
      uploadedBy: randomUUID(),
    });
    const second = createDocumentRecord({
      contentType: "image/png",
      filename: "second.png",
      organizationId,
      s3Key: "documents/test/second.png",
      status: "uploaded",
      uploadedBy: randomUUID(),
    });
    state.documents.set(first.id, first);
    state.documents.set(second.id, second);

    await app.ready();

    const response = await app.inject({
      headers: {
        authorization: `Bearer ${token}`,
      },
      method: "GET",
      url: "/documents?page=1&limit=1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.data).toHaveLength(1);
    expect(response.json().data.meta.total).toBe(2);
    expect(response.json().data.meta.hasMore).toBe(true);
  });

  it("deletes both the storage object and the document record", async () => {
    const organizationId = randomUUID();
    const token = createAuthToken({
      organizationId,
    });
    const document = createDocumentRecord({
      contentType: "image/jpeg",
      filename: "receipt.jpg",
      organizationId,
      s3Key: "documents/test/receipt.jpg",
      status: "uploaded",
      uploadedBy: randomUUID(),
    });
    state.documents.set(document.id, document);
    state.storageMetadata.set(document.s3Key, {
      checksum: null,
      contentType: document.contentType,
      sizeBytes: 1500,
    });

    await app.ready();

    const response = await app.inject({
      headers: {
        authorization: `Bearer ${token}`,
      },
      method: "DELETE",
      url: `/documents/${document.id}`,
    });

    expect(response.statusCode).toBe(200);

    expect(state.documents.has(document.id)).toBe(false);
    expect(state.storageMetadata.has(document.s3Key)).toBe(false);
  });

  it("links a document to a transaction and returns it from by-transaction with signed urls", async () => {
    const organizationId = randomUUID();
    const transactionId = randomUUID();
    const token = createAuthToken({
      organizationId,
    });
    const document = createDocumentRecord({
      contentType: "image/png",
      filename: "hotel.png",
      organizationId,
      s3Key: "documents/test/hotel.png",
      status: "uploaded",
      uploadedBy: randomUUID(),
    });
    state.documents.set(document.id, document);
    state.transactions.set(transactionId, {
      id: transactionId,
      isActive: true,
      organizationId,
    });

    await app.ready();

    const linkResponse = await app.inject({
      headers: {
        authorization: `Bearer ${token}`,
      },
      method: "POST",
      payload: {
        transactionId,
      },
      url: `/documents/${document.id}/link-transaction`,
    });

    expect(linkResponse.statusCode).toBe(201);
    expect(linkResponse.json().data.transactionId).toBe(transactionId);

    const documentsResponse = await app.inject({
      headers: {
        authorization: `Bearer ${token}`,
      },
      method: "GET",
      url: `/documents/by-transaction/${transactionId}`,
    });

    expect(documentsResponse.statusCode).toBe(200);
    expect(documentsResponse.json().data).toHaveLength(1);
    expect(documentsResponse.json().data[0].linkedTransactionIds).toContain(transactionId);
    expect(documentsResponse.json().data[0].downloadUrl).toContain("https://downloads.test/");
  });

  it("returns 404 when linking a non-existent transaction", async () => {
    const organizationId = randomUUID();
    const token = createAuthToken({
      organizationId,
    });
    const document = createDocumentRecord({
      contentType: "image/png",
      filename: "missing.png",
      organizationId,
      s3Key: "documents/test/missing.png",
      status: "uploaded",
      uploadedBy: randomUUID(),
    });
    state.documents.set(document.id, document);

    await app.ready();

    const response = await app.inject({
      headers: {
        authorization: `Bearer ${token}`,
      },
      method: "POST",
      payload: {
        transactionId: randomUUID(),
      },
      url: `/documents/${document.id}/link-transaction`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("TRANSACTION_NOT_FOUND");
  });

  it("returns 403 when linking a transaction from a different organization", async () => {
    const organizationId = randomUUID();
    const otherOrganizationId = randomUUID();
    const transactionId = randomUUID();
    const token = createAuthToken({
      organizationId,
    });
    const document = createDocumentRecord({
      contentType: "image/heic",
      filename: "cross-org.heic",
      organizationId,
      s3Key: "documents/test/cross-org.heic",
      status: "uploaded",
      uploadedBy: randomUUID(),
    });
    state.documents.set(document.id, document);
    state.transactions.set(transactionId, {
      id: transactionId,
      isActive: true,
      organizationId: otherOrganizationId,
    });

    await app.ready();

    const response = await app.inject({
      headers: {
        authorization: `Bearer ${token}`,
      },
      method: "POST",
      payload: {
        transactionId,
      },
      url: `/documents/${document.id}/link-transaction`,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
  });

  it("removes an existing document link", async () => {
    const organizationId = randomUUID();
    const transactionId = randomUUID();
    const token = createAuthToken({
      organizationId,
    });
    const document = createDocumentRecord({
      contentType: "image/png",
      filename: "unlink.png",
      organizationId,
      s3Key: "documents/test/unlink.png",
      status: "uploaded",
      uploadedBy: randomUUID(),
    });
    state.documents.set(document.id, document);
    state.transactions.set(transactionId, {
      id: transactionId,
      isActive: true,
      organizationId,
    });
    state.links.set(buildLinkKey(document.id, transactionId), {
      createdAt: new Date().toISOString(),
      documentId: document.id,
      id: randomUUID(),
      linkedBy: randomUUID(),
      organizationId,
      transactionId,
    });

    await app.ready();

    const response = await app.inject({
      headers: {
        authorization: `Bearer ${token}`,
      },
      method: "DELETE",
      url: `/documents/${document.id}/link-transaction/${transactionId}`,
    });

    expect(response.statusCode).toBe(200);

    expect(state.links.has(buildLinkKey(document.id, transactionId))).toBe(false);
  });
});
