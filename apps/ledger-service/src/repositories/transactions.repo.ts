import { Prisma } from "@prisma/client";

import type { PrismaClient } from "@prisma/client";
import type { Transaction, TransactionFilters } from "@wford26/shared-types";

type TransactionRecord = {
  accountId: string;
  amount: number;
  categoryId: string | null;
  createdAt: string;
  createdBy: string;
  date: string;
  description: string | null;
  id: string;
  importBatchId: string | null;
  isSplit: boolean;
  merchantRaw: string | null;
  organizationId: string;
  reviewStatus: Transaction["reviewStatus"];
  updatedAt: string;
};

type ListedTransactions = {
  transactions: Transaction[];
  total: number;
};

type TransactionRepositoryRecord = TransactionRecord & {
  isActive: boolean;
};

export type LedgerTransactionRepository = {
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
  findTransactionById(
    transactionId: string,
    organizationId: string
  ): Promise<TransactionRepositoryRecord | null>;
  listTransactions(
    organizationId: string,
    filters: TransactionFilters
  ): Promise<ListedTransactions>;
  softDeleteTransaction(transactionId: string, organizationId: string): Promise<void>;
  updateTransaction(
    transactionId: string,
    organizationId: string,
    input: {
      amount?: number;
      categoryId?: string | null;
      date?: string;
      description?: string | null;
      merchantRaw?: string | null;
    }
  ): Promise<Transaction>;
};

function toTransactionRecord(transaction: {
  accountId: string | null;
  amount: Prisma.Decimal;
  categoryId: string | null;
  createdAt: Date;
  createdBy: string;
  date: Date;
  description: string | null;
  id: string;
  importBatchId: string | null;
  isActive: boolean;
  isSplit: boolean;
  merchantRaw: string | null;
  organizationId: string;
  reviewStatus: string;
  updatedAt: Date;
}): TransactionRepositoryRecord {
  return {
    accountId: transaction.accountId ?? "",
    amount: Number(transaction.amount),
    categoryId: transaction.categoryId ?? null,
    createdAt: transaction.createdAt.toISOString(),
    createdBy: transaction.createdBy,
    date: transaction.date.toISOString().slice(0, 10),
    description: transaction.description ?? null,
    id: transaction.id,
    importBatchId: transaction.importBatchId ?? null,
    isActive: transaction.isActive,
    isSplit: transaction.isSplit,
    merchantRaw: transaction.merchantRaw ?? null,
    organizationId: transaction.organizationId,
    reviewStatus: transaction.reviewStatus as Transaction["reviewStatus"],
    updatedAt: transaction.updatedAt.toISOString(),
  };
}

function toListedTransaction(transaction: TransactionRepositoryRecord): Transaction {
  return {
    accountId: transaction.accountId,
    amount: transaction.amount,
    categoryId: transaction.categoryId,
    createdAt: transaction.createdAt,
    createdBy: transaction.createdBy,
    date: transaction.date,
    description: transaction.description,
    id: transaction.id,
    importBatchId: transaction.importBatchId,
    isSplit: transaction.isSplit,
    merchantRaw: transaction.merchantRaw,
    organizationId: transaction.organizationId,
    reviewStatus: transaction.reviewStatus,
    updatedAt: transaction.updatedAt,
  };
}

function buildWhereClause(
  organizationId: string,
  filters?: Partial<TransactionFilters>
): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = {
    isActive: true,
    organizationId,
  };

  if (filters?.accountId) {
    where.accountId = filters.accountId;
  }

  if (filters?.categoryId) {
    where.categoryId = filters.categoryId;
  }

  if (filters?.status) {
    where.reviewStatus = filters.status;
  }

  if (filters?.amountMin !== undefined || filters?.amountMax !== undefined) {
    where.amount = {
      ...(filters.amountMin !== undefined ? { gte: filters.amountMin } : {}),
      ...(filters.amountMax !== undefined ? { lte: filters.amountMax } : {}),
    };
  }

  if (filters?.dateFrom || filters?.dateTo) {
    where.date = {
      ...(filters.dateFrom ? { gte: new Date(`${filters.dateFrom}T00:00:00.000Z`) } : {}),
      ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T00:00:00.000Z`) } : {}),
    };
  }

  if (filters?.q) {
    where.OR = [
      {
        description: {
          contains: filters.q,
          mode: "insensitive",
        },
      },
      {
        merchantRaw: {
          contains: filters.q,
          mode: "insensitive",
        },
      },
    ];
  }

  return where;
}

export function createPrismaLedgerTransactionRepository(
  db: PrismaClient
): LedgerTransactionRepository {
  return {
    async createTransaction(input) {
      const data: Prisma.TransactionUncheckedCreateInput = {
        accountId: input.accountId,
        amount: new Prisma.Decimal(input.amount),
        createdBy: input.createdBy,
        date: new Date(`${input.date}T00:00:00.000Z`),
        organizationId: input.organizationId,
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.merchantRaw !== undefined ? { merchantRaw: input.merchantRaw } : {}),
      };
      const transaction = await db.transaction.create({
        data,
      });

      return toListedTransaction(toTransactionRecord(transaction));
    },

    async findTransactionById(transactionId, organizationId) {
      const transaction = await db.transaction.findFirst({
        where: {
          id: transactionId,
          organizationId,
        },
      });

      return transaction ? toTransactionRecord(transaction) : null;
    },

    async listTransactions(organizationId, filters) {
      const where = buildWhereClause(organizationId, filters);
      const skip = (filters.page - 1) * filters.limit;

      const [transactions, total] = await Promise.all([
        db.transaction.findMany({
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          skip,
          take: filters.limit,
          where,
        }),
        db.transaction.count({
          where,
        }),
      ]);

      return {
        total,
        transactions: transactions.map((transaction) =>
          toListedTransaction(toTransactionRecord(transaction))
        ),
      };
    },

    async softDeleteTransaction(transactionId, organizationId) {
      const data: Prisma.TransactionUncheckedUpdateManyInput = {
        isActive: false,
      };

      await db.transaction.updateMany({
        data,
        where: {
          id: transactionId,
          isActive: true,
          organizationId,
        },
      });
    },

    async updateTransaction(transactionId, organizationId, input) {
      const data: Prisma.TransactionUncheckedUpdateManyInput = {
        ...(input.amount !== undefined ? { amount: new Prisma.Decimal(input.amount) } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.date !== undefined ? { date: new Date(`${input.date}T00:00:00.000Z`) } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.merchantRaw !== undefined ? { merchantRaw: input.merchantRaw } : {}),
      };

      await db.transaction.updateMany({
        data,
        where: {
          id: transactionId,
          isActive: true,
          organizationId,
        },
      });

      const transaction = await db.transaction.findFirst({
        where: {
          id: transactionId,
          isActive: true,
          organizationId,
        },
      });

      if (!transaction) {
        throw new Error("Transaction not found after update");
      }

      return toListedTransaction(toTransactionRecord(transaction));
    },
  };
}
