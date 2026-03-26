import { Prisma } from "@prisma/client";

import type { PrismaClient } from "@prisma/client";
import type { AccountType, MetricAggregate, ReviewStatus } from "@wford26/shared-types";

export type LedgerExpenseTransactionRow = {
  amount: number;
  categoryId: string | null;
  categoryName: string | null;
  date: string;
  merchantRaw: string | null;
};

export type ReportingMetricAggregateInput = {
  metadata: Record<string, string | number | boolean | null> | null;
  metricKey: string;
  period: string;
  value: number;
};

export type DashboardAccountBalanceRow = {
  accountId: string;
  accountName: string;
  accountType: AccountType;
  asOf: string;
  balance: number;
};

export type DashboardRecentTransactionRow = {
  accountId: string;
  accountName: string;
  amount: number;
  categoryId: string | null;
  categoryName: string | null;
  createdAt: string;
  date: string;
  description: string | null;
  id: string;
  merchantRaw: string | null;
  reviewStatus: ReviewStatus;
};

export type DashboardLedgerSnapshot = {
  accountBalances: DashboardAccountBalanceRow[];
  recentTransactions: DashboardRecentTransactionRow[];
  uncategorizedCount: number;
  unreviewedCount: number;
};

export type ReportExportTransactionRow = {
  accountName: string;
  amount: number;
  categoryName: string | null;
  date: string;
  description: string | null;
  merchantRaw: string | null;
  reviewStatus: ReviewStatus;
};

export type ReportingMetricsRepository = {
  getDashboardLedgerSnapshot(
    organizationId: string,
    recentLimit: number
  ): Promise<DashboardLedgerSnapshot>;
  listLedgerExpenseTransactionsForOrganization(
    organizationId: string
  ): Promise<LedgerExpenseTransactionRow[]>;
  listMetricAggregatesForOrganizationPeriod(
    organizationId: string,
    period: string
  ): Promise<ReportingMetricAggregate[]>;
  listTransactionsForExport(organizationId: string): Promise<ReportExportTransactionRow[]>;
  replaceMetricAggregatesForOrganization(
    organizationId: string,
    aggregates: ReportingMetricAggregateInput[]
  ): Promise<void>;
};

type RawLedgerExpenseTransactionRow = {
  amount: Prisma.Decimal;
  categoryId: string | null;
  categoryName: string | null;
  date: Date;
  merchantRaw: string | null;
};

type RawDashboardAccountBalanceRow = {
  accountId: string;
  accountName: string;
  accountType: string;
  balance: Prisma.Decimal;
};

type RawDashboardRecentTransactionRow = {
  accountId: string;
  accountName: string;
  amount: Prisma.Decimal;
  categoryId: string | null;
  categoryName: string | null;
  createdAt: Date;
  date: Date;
  description: string | null;
  id: string;
  merchantRaw: string | null;
  reviewStatus: string;
};

type RawDashboardCountsRow = {
  uncategorizedCount: bigint | number;
  unreviewedCount: bigint | number;
};

const metricPrefixes = ["total_expenses:", "category_spend:", "vendor_spend:"];

export function createPrismaReportingMetricsRepository(
  db: PrismaClient
): ReportingMetricsRepository {
  return {
    async getDashboardLedgerSnapshot(organizationId, recentLimit) {
      const asOf = new Date().toISOString();
      const [balances, recentTransactions, counts] = await Promise.all([
        db.$queryRaw<RawDashboardAccountBalanceRow[]>(Prisma.sql`
          SELECT
            account.id AS "accountId",
            account.name AS "accountName",
            account.type AS "accountType",
            COALESCE(SUM(transaction.amount), 0) AS balance
          FROM ledger.accounts AS account
          LEFT JOIN ledger.transactions AS transaction
            ON transaction.account_id = account.id
           AND transaction.organization_id = account.organization_id
           AND transaction.is_active = true
          WHERE account.organization_id = ${organizationId}::uuid
            AND account.is_active = true
          GROUP BY account.id, account.name, account.type, account.created_at
          ORDER BY ABS(COALESCE(SUM(transaction.amount), 0)) DESC, account.created_at ASC
        `),
        db.$queryRaw<RawDashboardRecentTransactionRow[]>(Prisma.sql`
          SELECT
            transaction.id AS id,
            transaction.account_id AS "accountId",
            account.name AS "accountName",
            transaction.date AS date,
            transaction.amount AS amount,
            transaction.description AS description,
            transaction.merchant_raw AS "merchantRaw",
            transaction.category_id AS "categoryId",
            category.name AS "categoryName",
            transaction.review_status AS "reviewStatus",
            transaction.created_at AS "createdAt"
          FROM ledger.transactions AS transaction
          INNER JOIN ledger.accounts AS account
            ON account.id = transaction.account_id
          LEFT JOIN ledger.categories AS category
            ON category.id = transaction.category_id
          WHERE transaction.organization_id = ${organizationId}::uuid
            AND transaction.is_active = true
          ORDER BY transaction.date DESC, transaction.created_at DESC
          LIMIT ${recentLimit}
        `),
        db.$queryRaw<RawDashboardCountsRow[]>(Prisma.sql`
          SELECT
            COALESCE(SUM(CASE WHEN transaction.review_status = 'unreviewed' THEN 1 ELSE 0 END), 0) AS "unreviewedCount",
            COALESCE(SUM(CASE WHEN transaction.category_id IS NULL THEN 1 ELSE 0 END), 0) AS "uncategorizedCount"
          FROM ledger.transactions AS transaction
          WHERE transaction.organization_id = ${organizationId}::uuid
            AND transaction.is_active = true
        `),
      ]);

      return {
        accountBalances: balances.map((row) => ({
          accountId: row.accountId,
          accountName: row.accountName,
          accountType: row.accountType as AccountType,
          asOf,
          balance: Number(row.balance),
        })),
        recentTransactions: recentTransactions.map((row) => ({
          accountId: row.accountId,
          accountName: row.accountName,
          amount: Number(row.amount),
          categoryId: row.categoryId,
          categoryName: row.categoryName,
          createdAt: row.createdAt.toISOString(),
          date: row.date.toISOString().slice(0, 10),
          description: row.description,
          id: row.id,
          merchantRaw: row.merchantRaw,
          reviewStatus: row.reviewStatus as ReviewStatus,
        })),
        uncategorizedCount: Number(counts[0]?.uncategorizedCount ?? 0),
        unreviewedCount: Number(counts[0]?.unreviewedCount ?? 0),
      };
    },

    async listLedgerExpenseTransactionsForOrganization(organizationId) {
      const rows = await db.$queryRaw<RawLedgerExpenseTransactionRow[]>(Prisma.sql`
        SELECT
          transaction.date AS date,
          transaction.amount AS amount,
          transaction.category_id AS "categoryId",
          category.name AS "categoryName",
          transaction.merchant_raw AS "merchantRaw"
        FROM ledger.transactions AS transaction
        LEFT JOIN ledger.categories AS category
          ON category.id = transaction.category_id
        WHERE transaction.organization_id = ${organizationId}::uuid
          AND transaction.is_active = true
      `);

      return rows.map((row) => ({
        amount: Number(row.amount),
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        date: row.date.toISOString().slice(0, 10),
        merchantRaw: row.merchantRaw,
      }));
    },

    async listMetricAggregatesForOrganizationPeriod(organizationId, period) {
      const metrics = await db.metricAggregate.findMany({
        orderBy: [{ metricKey: "asc" }],
        where: {
          organizationId,
          period,
        },
      });

      return metrics.map((metric) => ({
        computedAt: metric.computedAt.toISOString(),
        id: metric.id,
        metadata:
          metric.metadata && typeof metric.metadata === "object" && !Array.isArray(metric.metadata)
            ? (metric.metadata as Record<string, string | number | boolean | null>)
            : null,
        metricKey: metric.metricKey,
        organizationId: metric.organizationId,
        period: metric.period,
        value: Number(metric.value ?? 0),
      }));
    },

    async listTransactionsForExport(organizationId) {
      const rows = await db.$queryRaw<
        Array<{
          accountName: string;
          amount: Prisma.Decimal;
          categoryName: string | null;
          date: Date;
          description: string | null;
          merchantRaw: string | null;
          reviewStatus: string;
        }>
      >(Prisma.sql`
        SELECT
          transaction.date AS date,
          transaction.description AS description,
          transaction.merchant_raw AS "merchantRaw",
          account.name AS "accountName",
          category.name AS "categoryName",
          transaction.amount AS amount,
          transaction.review_status AS "reviewStatus"
        FROM ledger.transactions AS transaction
        INNER JOIN ledger.accounts AS account
          ON account.id = transaction.account_id
        LEFT JOIN ledger.categories AS category
          ON category.id = transaction.category_id
        WHERE transaction.organization_id = ${organizationId}::uuid
          AND transaction.is_active = true
        ORDER BY transaction.date DESC, transaction.created_at DESC
      `);

      return rows.map((row) => ({
        accountName: row.accountName,
        amount: Number(row.amount),
        categoryName: row.categoryName,
        date: row.date.toISOString().slice(0, 10),
        description: row.description,
        merchantRaw: row.merchantRaw,
        reviewStatus: row.reviewStatus as ReviewStatus,
      }));
    },

    async replaceMetricAggregatesForOrganization(organizationId, aggregates) {
      await db.$transaction(async (tx) => {
        await tx.metricAggregate.deleteMany({
          where: {
            organizationId,
            OR: metricPrefixes.map((prefix) => ({
              metricKey: {
                startsWith: prefix,
              },
            })),
          },
        });

        if (aggregates.length === 0) {
          return;
        }

        await tx.metricAggregate.createMany({
          data: aggregates.map((aggregate) => ({
            computedAt: new Date(),
            metadata: aggregate.metadata ?? Prisma.JsonNull,
            metricKey: aggregate.metricKey,
            organizationId,
            period: aggregate.period,
            value: aggregate.value,
          })),
        });
      });
    },
  };
}

export type ReportingMetricAggregate = MetricAggregate;
