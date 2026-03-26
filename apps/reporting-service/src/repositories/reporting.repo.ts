import { Prisma } from "@prisma/client";

import type { PrismaClient } from "@prisma/client";
import type { MetricAggregate } from "@wford26/shared-types";

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

export type ReportingMetricsRepository = {
  listLedgerExpenseTransactionsForOrganization(
    organizationId: string
  ): Promise<LedgerExpenseTransactionRow[]>;
  listMetricAggregatesForOrganizationPeriod(
    organizationId: string,
    period: string
  ): Promise<ReportingMetricAggregate[]>;
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

const metricPrefixes = ["total_expenses:", "category_spend:", "vendor_spend:"];

export function createPrismaReportingMetricsRepository(
  db: PrismaClient
): ReportingMetricsRepository {
  return {
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
