import { Prisma } from "@prisma/client";

import type { PrismaClient } from "@prisma/client";
import type { Document, TransactionLink } from "@wford26/shared-types";

type TransactionReference = {
  id: string;
  isActive: boolean;
  organizationId: string;
};

type ListedDocuments = {
  documents: Document[];
  total: number;
};

export type DocumentsRepository = {
  createPendingDocument(input: {
    contentType: Document["contentType"];
    filename: string;
    id: string;
    organizationId: string;
    s3Bucket: string;
    s3Key: string;
    sizeBytes: number;
    uploadedBy: string;
  }): Promise<Document>;
  createTransactionLink(input: {
    documentId: string;
    linkedBy: string;
    organizationId: string;
    transactionId: string;
  }): Promise<TransactionLink>;
  deleteDocument(documentId: string, organizationId: string): Promise<void>;
  deleteTransactionLink(
    documentId: string,
    organizationId: string,
    transactionId: string
  ): Promise<void>;
  finalizeDocument(
    documentId: string,
    organizationId: string,
    input: {
      checksum: string | null;
      contentType: Document["contentType"];
      sizeBytes: number | null;
      status: Document["status"];
    }
  ): Promise<Document>;
  findDocumentById(documentId: string, organizationId: string): Promise<Document | null>;
  findTransactionLink(
    documentId: string,
    organizationId: string,
    transactionId: string
  ): Promise<TransactionLink | null>;
  findTransactionReference(transactionId: string): Promise<TransactionReference | null>;
  listDocuments(
    organizationId: string,
    pagination: { limit: number; page: number }
  ): Promise<ListedDocuments>;
  listDocumentsByTransaction(organizationId: string, transactionId: string): Promise<Document[]>;
  listTransactionIdsForDocumentIds(
    documentIds: string[],
    organizationId: string
  ): Promise<Map<string, string[]>>;
};

function toDocument(record: {
  checksum: string | null;
  contentType: string;
  createdAt: Date;
  filename: string;
  id: string;
  organizationId: string;
  s3Bucket: string;
  s3Key: string;
  sizeBytes: bigint | null;
  status: string;
  uploadedBy: string;
}): Document {
  return {
    checksum: record.checksum ?? null,
    contentType: record.contentType as Document["contentType"],
    createdAt: record.createdAt.toISOString(),
    filename: record.filename,
    id: record.id,
    organizationId: record.organizationId,
    s3Bucket: record.s3Bucket,
    s3Key: record.s3Key,
    sizeBytes: record.sizeBytes === null ? null : Number(record.sizeBytes),
    status: record.status as Document["status"],
    uploadedBy: record.uploadedBy,
  };
}

function toTransactionLink(record: {
  createdAt: Date;
  documentId: string;
  id: string;
  linkedBy: string;
  organizationId: string;
  transactionId: string;
}): TransactionLink {
  return {
    createdAt: record.createdAt.toISOString(),
    documentId: record.documentId,
    id: record.id,
    linkedBy: record.linkedBy,
    organizationId: record.organizationId,
    transactionId: record.transactionId,
  };
}

export function createPrismaDocumentsRepository(db: PrismaClient): DocumentsRepository {
  return {
    async createPendingDocument(input) {
      const document = await db.document.create({
        data: {
          contentType: input.contentType,
          filename: input.filename,
          id: input.id,
          organizationId: input.organizationId,
          s3Bucket: input.s3Bucket,
          s3Key: input.s3Key,
          sizeBytes: BigInt(input.sizeBytes),
          uploadedBy: input.uploadedBy,
        },
      });

      return toDocument(document);
    },

    async createTransactionLink(input) {
      const link = await db.transactionLink.create({
        data: {
          documentId: input.documentId,
          linkedBy: input.linkedBy,
          organizationId: input.organizationId,
          transactionId: input.transactionId,
        },
      });

      return toTransactionLink(link);
    },

    async deleteDocument(documentId, organizationId) {
      await db.$transaction([
        db.transactionLink.deleteMany({
          where: {
            documentId,
            organizationId,
          },
        }),
        db.document.deleteMany({
          where: {
            id: documentId,
            organizationId,
          },
        }),
      ]);
    },

    async deleteTransactionLink(documentId, organizationId, transactionId) {
      await db.transactionLink.deleteMany({
        where: {
          documentId,
          organizationId,
          transactionId,
        },
      });
    },

    async finalizeDocument(documentId, organizationId, input) {
      const document = await db.document.update({
        data: {
          checksum: input.checksum,
          contentType: input.contentType,
          ...(input.sizeBytes !== null ? { sizeBytes: BigInt(input.sizeBytes) } : {}),
          status: input.status,
        },
        where: {
          id: documentId,
        },
      });

      if (document.organizationId !== organizationId) {
        throw new Error("Document organization mismatch");
      }

      return toDocument(document);
    },

    async findDocumentById(documentId, organizationId) {
      const document = await db.document.findFirst({
        where: {
          id: documentId,
          organizationId,
        },
      });

      return document ? toDocument(document) : null;
    },

    async findTransactionLink(documentId, organizationId, transactionId) {
      const link = await db.transactionLink.findFirst({
        where: {
          documentId,
          organizationId,
          transactionId,
        },
      });

      return link ? toTransactionLink(link) : null;
    },

    async findTransactionReference(transactionId) {
      const rows = await db.$queryRaw<
        Array<{ id: string; isActive: boolean; organizationId: string }>
      >(
        Prisma.sql`
          SELECT
            id,
            organization_id AS "organizationId",
            is_active AS "isActive"
          FROM ledger.transactions
          WHERE id = ${transactionId}::uuid
          LIMIT 1
        `
      );

      return rows[0] ?? null;
    },

    async listDocuments(organizationId, pagination) {
      const skip = (pagination.page - 1) * pagination.limit;
      const [documents, total] = await Promise.all([
        db.document.findMany({
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip,
          take: pagination.limit,
          where: {
            organizationId,
          },
        }),
        db.document.count({
          where: {
            organizationId,
          },
        }),
      ]);

      return {
        documents: documents.map((document) => toDocument(document)),
        total,
      };
    },

    async listDocumentsByTransaction(organizationId, transactionId) {
      const links = await db.transactionLink.findMany({
        include: {
          document: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        where: {
          organizationId,
          transactionId,
        },
      });

      return links.map((link) => toDocument(link.document));
    },

    async listTransactionIdsForDocumentIds(documentIds, organizationId) {
      if (documentIds.length === 0) {
        return new Map();
      }

      const links = await db.transactionLink.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        where: {
          documentId: {
            in: documentIds,
          },
          organizationId,
        },
      });

      const map = new Map<string, string[]>();

      for (const link of links) {
        const existing = map.get(link.documentId) ?? [];
        existing.push(link.transactionId);
        map.set(link.documentId, existing);
      }

      return map;
    },
  };
}
