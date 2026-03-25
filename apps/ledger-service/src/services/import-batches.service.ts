import { createEvent } from "@wford26/event-contracts";

import { parseTransactionCsv } from "../lib/csv-import";
import { LedgerServiceError } from "../lib/errors";

import type { LedgerEventPublisher } from "../lib/events";
import type { LedgerAccountRepository } from "../repositories/accounts.repo";
import type { LedgerImportBatchRepository } from "../repositories/import-batches.repo";
import type { LedgerTransactionRepository } from "../repositories/transactions.repo";
import type { ImportBatch, ImportBatchDetail, ImportBatchRowResult } from "@wford26/shared-types";

type ImportCsvInput = {
  accountId: string;
  content: string;
  createdBy: string;
  filename?: string | null;
  organizationId: string;
};

function buildDuplicateKey(input: { amount: number; date: string; description: string | null }) {
  return JSON.stringify([input.date, input.amount, input.description ?? null]);
}

async function ensureActiveAccount(
  accountRepository: LedgerAccountRepository,
  accountId: string,
  organizationId: string
) {
  const account = await accountRepository.findAccountById(accountId, organizationId);

  if (!account) {
    throw new LedgerServiceError("ACCOUNT_NOT_FOUND", "Account not found", 404);
  }

  return account;
}

export type LedgerImportBatchesService = {
  getImportBatch(batchId: string, organizationId: string): Promise<ImportBatchDetail>;
  importTransactionsCsv(input: ImportCsvInput): Promise<ImportBatchDetail>;
  listImportBatches(organizationId: string): Promise<ImportBatch[]>;
};

export function createLedgerImportBatchesService(
  importBatchRepository: LedgerImportBatchRepository,
  transactionRepository: LedgerTransactionRepository,
  accountRepository: LedgerAccountRepository,
  eventPublisher: LedgerEventPublisher
): LedgerImportBatchesService {
  return {
    async getImportBatch(batchId, organizationId) {
      const batch = await importBatchRepository.findImportBatchById(batchId, organizationId);

      if (!batch) {
        throw new LedgerServiceError("NOT_FOUND", "Import batch not found", 404);
      }

      return batch;
    },

    async importTransactionsCsv(input) {
      await ensureActiveAccount(accountRepository, input.accountId, input.organizationId);

      let parsedRows;

      try {
        parsedRows = parseTransactionCsv(input.content);
      } catch (error) {
        throw new LedgerServiceError(
          "INVALID_CSV_FORMAT",
          error instanceof Error ? error.message : "Unsupported CSV format",
          400
        );
      }

      const batch = await importBatchRepository.createImportBatch({
        accountId: input.accountId,
        createdBy: input.createdBy,
        ...(input.filename !== undefined ? { filename: input.filename } : {}),
        organizationId: input.organizationId,
      });

      const readyRows = parsedRows.filter((row) => row.status === "ready");
      const existingTransactions =
        await transactionRepository.findTransactionsByDuplicateCandidates({
          accountId: input.accountId,
          candidates: readyRows.map((row) => ({
            amount: row.amount,
            date: row.date,
            description: row.description,
          })),
          organizationId: input.organizationId,
        });
      const knownKeys = new Set(
        existingTransactions.map((transaction) =>
          buildDuplicateKey({
            amount: transaction.amount,
            date: transaction.date,
            description: transaction.description ?? null,
          })
        )
      );
      const rows: ImportBatchRowResult[] = [];
      let duplicateCount = 0;
      let errorCount = 0;
      let importedCount = 0;

      for (const row of parsedRows) {
        if (row.status === "error") {
          errorCount += 1;
          rows.push({
            amount: row.amount,
            date: row.date,
            description: row.description,
            message: row.message,
            rowNumber: row.rowNumber,
            status: "error",
            transactionId: null,
          });
          continue;
        }

        if (row.status === "skipped") {
          rows.push({
            amount: row.amount,
            date: row.date,
            description: row.description,
            message: row.message,
            rowNumber: row.rowNumber,
            status: "skipped",
            transactionId: null,
          });
          continue;
        }

        const duplicateKey = buildDuplicateKey({
          amount: row.amount,
          date: row.date,
          description: row.description,
        });

        if (knownKeys.has(duplicateKey)) {
          duplicateCount += 1;
          rows.push({
            amount: row.amount,
            date: row.date,
            description: row.description,
            message: "Duplicate transaction",
            rowNumber: row.rowNumber,
            status: "duplicate",
            transactionId: null,
          });
          continue;
        }

        const transaction = await transactionRepository.createTransaction({
          accountId: input.accountId,
          amount: row.amount,
          createdBy: input.createdBy,
          date: row.date,
          description: row.description,
          importBatchId: batch.id,
          merchantRaw: null,
          organizationId: input.organizationId,
        });

        await eventPublisher.publish(
          createEvent("transaction.created", input.organizationId, input.createdBy, {
            accountId: transaction.accountId,
            amount: transaction.amount,
            categoryId: transaction.categoryId ?? null,
            date: transaction.date,
            description: transaction.description ?? "",
            merchantRaw: transaction.merchantRaw ?? null,
            transactionId: transaction.id,
          })
        );

        importedCount += 1;
        knownKeys.add(duplicateKey);
        rows.push({
          amount: row.amount,
          date: row.date,
          description: row.description,
          message: null,
          rowNumber: row.rowNumber,
          status: "imported",
          transactionId: transaction.id,
        });
      }

      return importBatchRepository.updateImportBatch(batch.id, input.organizationId, {
        duplicateCount,
        errorCount,
        importedCount,
        rowCount: parsedRows.length,
        rows,
        status: "completed",
      });
    },

    async listImportBatches(organizationId) {
      return importBatchRepository.listImportBatches(organizationId);
    },
  };
}
