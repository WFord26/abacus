import type { Prisma, PrismaClient } from "@prisma/client";
import type { ImportBatch, ImportBatchDetail, ImportBatchRowResult } from "@wford26/shared-types";

type ImportBatchRecord = ImportBatch;

function toImportBatchRecord(batch: {
  accountId: string;
  createdAt: Date;
  createdBy: string;
  duplicateCount: number;
  errorCount: number;
  filename: string | null;
  id: string;
  importedCount: number;
  organizationId: string;
  rowCount: number;
  status: string;
  updatedAt: Date;
}): ImportBatchRecord {
  return {
    accountId: batch.accountId,
    createdAt: batch.createdAt.toISOString(),
    createdBy: batch.createdBy,
    duplicateCount: batch.duplicateCount,
    errorCount: batch.errorCount,
    filename: batch.filename,
    id: batch.id,
    importedCount: batch.importedCount,
    organizationId: batch.organizationId,
    rowCount: batch.rowCount,
    status: batch.status as ImportBatch["status"],
    updatedAt: batch.updatedAt.toISOString(),
  };
}

function parseRowResults(value: Prisma.JsonValue): ImportBatchRowResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((row) => {
    const record = row as Record<string, unknown>;

    return {
      amount: typeof record.amount === "number" ? record.amount : null,
      date: typeof record.date === "string" ? record.date : null,
      description: typeof record.description === "string" ? record.description : null,
      message: typeof record.message === "string" ? record.message : null,
      rowNumber: typeof record.rowNumber === "number" ? record.rowNumber : 0,
      status:
        record.status === "imported" ||
        record.status === "duplicate" ||
        record.status === "error" ||
        record.status === "skipped"
          ? record.status
          : "error",
      transactionId: typeof record.transactionId === "string" ? record.transactionId : null,
    };
  });
}

export type LedgerImportBatchRepository = {
  createImportBatch(input: {
    accountId: string;
    createdBy: string;
    filename?: string | null;
    organizationId: string;
  }): Promise<ImportBatch>;
  findImportBatchById(batchId: string, organizationId: string): Promise<ImportBatchDetail | null>;
  listImportBatches(organizationId: string): Promise<ImportBatch[]>;
  updateImportBatch(
    batchId: string,
    organizationId: string,
    input: {
      duplicateCount: number;
      errorCount: number;
      importedCount: number;
      rowCount: number;
      rows: ImportBatchRowResult[];
      status: ImportBatch["status"];
    }
  ): Promise<ImportBatchDetail>;
};

export function createPrismaLedgerImportBatchRepository(
  db: PrismaClient
): LedgerImportBatchRepository {
  return {
    async createImportBatch(input) {
      const batch = await db.importBatch.create({
        data: {
          accountId: input.accountId,
          createdBy: input.createdBy,
          ...(input.filename !== undefined ? { filename: input.filename } : {}),
          organizationId: input.organizationId,
          status: "processing",
        },
      });

      return toImportBatchRecord(batch);
    },

    async findImportBatchById(batchId, organizationId) {
      const batch = await db.importBatch.findFirst({
        where: {
          id: batchId,
          organizationId,
        },
      });

      if (!batch) {
        return null;
      }

      return {
        ...toImportBatchRecord(batch),
        rows: parseRowResults(batch.rowResults),
      };
    },

    async listImportBatches(organizationId) {
      const batches = await db.importBatch.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        where: {
          organizationId,
        },
      });

      return batches.map(toImportBatchRecord);
    },

    async updateImportBatch(batchId, organizationId, input) {
      await db.importBatch.updateMany({
        data: {
          duplicateCount: input.duplicateCount,
          errorCount: input.errorCount,
          importedCount: input.importedCount,
          rowCount: input.rowCount,
          rowResults: input.rows as unknown as Prisma.InputJsonValue,
          status: input.status,
        },
        where: {
          id: batchId,
          organizationId,
        },
      });

      const batch = await db.importBatch.findFirst({
        where: {
          id: batchId,
          organizationId,
        },
      });

      if (!batch) {
        throw new Error("Import batch not found after update");
      }

      return {
        ...toImportBatchRecord(batch),
        rows: parseRowResults(batch.rowResults),
      };
    },
  };
}
