import { createEvent } from "@wford26/event-contracts";

import { LedgerServiceError } from "../lib/errors";

import type { LedgerEventPublisher } from "../lib/events";
import type { LedgerAccountRepository } from "../repositories/accounts.repo";
import type { LedgerCategoryRepository } from "../repositories/categories.repo";
import type { LedgerTransactionRepository } from "../repositories/transactions.repo";
import type {
  ReviewStatus,
  Transaction,
  TransactionFilters,
  TransactionListResponse,
} from "@wford26/shared-types";

type TransactionMutationInput = {
  amount?: number;
  categoryId?: string | null;
  date?: string;
  description?: string | null;
  merchantRaw?: string | null;
  reviewStatus?: ReviewStatus;
};

export type LedgerTransactionsService = {
  createTransaction(input: {
    accountId: string;
    amount: number;
    categoryId?: string | null;
    createdBy: string;
    date: string;
    description?: string | null;
    merchantRaw?: string | null;
    organizationId: string;
  }): Promise<Transaction>;
  deleteTransaction(transactionId: string, organizationId: string): Promise<{ deleted: true }>;
  getTransaction(transactionId: string, organizationId: string): Promise<Transaction>;
  listTransactions(
    organizationId: string,
    filters: TransactionFilters
  ): Promise<TransactionListResponse>;
  reviewTransaction(
    transactionId: string,
    organizationId: string,
    userId: string,
    reviewStatus: ReviewStatus
  ): Promise<Transaction>;
  updateTransaction(
    transactionId: string,
    organizationId: string,
    userId: string,
    input: TransactionMutationInput
  ): Promise<Transaction>;
};

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

async function ensureActiveCategory(
  categoryRepository: LedgerCategoryRepository,
  categoryId: string | null,
  organizationId: string
) {
  if (!categoryId) {
    return null;
  }

  const category = await categoryRepository.findCategoryById(categoryId, organizationId);

  if (!category || !category.isActive) {
    throw new LedgerServiceError("CATEGORY_NOT_FOUND", "Category not found", 404);
  }

  return category;
}

function buildUpdatedEventChanges(
  original: Transaction,
  input: TransactionMutationInput
): Partial<{
  amount: number;
  categoryId: string | null;
  date: string;
  description: string | null;
  merchantRaw: string | null;
  reviewStatus: ReviewStatus;
}> {
  return {
    ...(input.amount !== undefined && input.amount !== original.amount
      ? { amount: input.amount }
      : {}),
    ...(input.categoryId !== undefined && input.categoryId !== original.categoryId
      ? { categoryId: input.categoryId ?? null }
      : {}),
    ...(input.date !== undefined && input.date !== original.date ? { date: input.date } : {}),
    ...(input.description !== undefined && input.description !== original.description
      ? { description: input.description ?? null }
      : {}),
    ...(input.merchantRaw !== undefined && input.merchantRaw !== original.merchantRaw
      ? { merchantRaw: input.merchantRaw ?? null }
      : {}),
    ...(input.reviewStatus !== undefined && input.reviewStatus !== original.reviewStatus
      ? { reviewStatus: input.reviewStatus }
      : {}),
  };
}

export function createLedgerTransactionsService(
  transactionRepository: LedgerTransactionRepository,
  accountRepository: LedgerAccountRepository,
  categoryRepository: LedgerCategoryRepository,
  eventPublisher: LedgerEventPublisher
): LedgerTransactionsService {
  return {
    async createTransaction(input) {
      await ensureActiveAccount(accountRepository, input.accountId, input.organizationId);
      await ensureActiveCategory(
        categoryRepository,
        input.categoryId ?? null,
        input.organizationId
      );

      const transaction = await transactionRepository.createTransaction(input);

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

      return transaction;
    },

    async deleteTransaction(transactionId, organizationId) {
      const transaction = await transactionRepository.findTransactionById(
        transactionId,
        organizationId
      );

      if (!transaction || !transaction.isActive) {
        throw new LedgerServiceError("NOT_FOUND", "Transaction not found", 404);
      }

      await transactionRepository.softDeleteTransaction(transactionId, organizationId);

      return {
        deleted: true as const,
      };
    },

    async getTransaction(transactionId, organizationId) {
      const transaction = await transactionRepository.findTransactionById(
        transactionId,
        organizationId
      );

      if (!transaction || !transaction.isActive) {
        throw new LedgerServiceError("NOT_FOUND", "Transaction not found", 404);
      }

      const {
        isActive: _isActive,
        sourceId: _sourceId,
        sourceType: _sourceType,
        ...result
      } = transaction;
      return result;
    },

    async listTransactions(organizationId, filters) {
      if (filters.accountId) {
        await ensureActiveAccount(accountRepository, filters.accountId, organizationId);
      }

      if (filters.categoryId) {
        await ensureActiveCategory(categoryRepository, filters.categoryId, organizationId);
      }

      const result = await transactionRepository.listTransactions(organizationId, filters);

      return {
        data: result.transactions,
        meta: {
          hasMore: filters.page * filters.limit < result.total,
          limit: filters.limit,
          page: filters.page,
          total: result.total,
        },
      };
    },

    async reviewTransaction(transactionId, organizationId, userId, reviewStatus) {
      const original = await transactionRepository.findTransactionById(
        transactionId,
        organizationId
      );

      if (!original || !original.isActive) {
        throw new LedgerServiceError("NOT_FOUND", "Transaction not found", 404);
      }

      const transaction = await transactionRepository.updateTransactionReviewStatus(
        transactionId,
        organizationId,
        reviewStatus
      );
      const changes = buildUpdatedEventChanges(
        {
          accountId: original.accountId,
          amount: original.amount,
          categoryId: original.categoryId,
          createdAt: original.createdAt,
          createdBy: original.createdBy,
          date: original.date,
          description: original.description,
          id: original.id,
          importBatchId: original.importBatchId,
          isSplit: original.isSplit,
          merchantRaw: original.merchantRaw,
          organizationId: original.organizationId,
          reviewStatus: original.reviewStatus,
          updatedAt: original.updatedAt,
        },
        {
          reviewStatus,
        }
      );

      await eventPublisher.publish(
        createEvent("transaction.updated", organizationId, userId, {
          changes,
          transactionId,
        })
      );

      return transaction;
    },

    async updateTransaction(transactionId, organizationId, userId, input) {
      const original = await transactionRepository.findTransactionById(
        transactionId,
        organizationId
      );

      if (!original || !original.isActive) {
        throw new LedgerServiceError("NOT_FOUND", "Transaction not found", 404);
      }

      if (input.categoryId !== undefined) {
        await ensureActiveCategory(categoryRepository, input.categoryId ?? null, organizationId);
      }

      const transaction = await transactionRepository.updateTransaction(
        transactionId,
        organizationId,
        input
      );
      const changes = buildUpdatedEventChanges(
        {
          accountId: original.accountId,
          amount: original.amount,
          categoryId: original.categoryId,
          createdAt: original.createdAt,
          createdBy: original.createdBy,
          date: original.date,
          description: original.description,
          id: original.id,
          importBatchId: original.importBatchId,
          isSplit: original.isSplit,
          merchantRaw: original.merchantRaw,
          organizationId: original.organizationId,
          reviewStatus: original.reviewStatus,
          updatedAt: original.updatedAt,
        },
        input
      );

      await eventPublisher.publish(
        createEvent("transaction.updated", organizationId, userId, {
          changes,
          transactionId,
        })
      );

      return transaction;
    },
  };
}
