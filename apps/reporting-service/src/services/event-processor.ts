import type {
  LedgerExpenseTransactionRow,
  ReportingMetricAggregateInput,
  ReportingMetricsRepository,
} from "../repositories/reporting.repo";
import type { AbacusEvent } from "@wford26/event-contracts";

export type ReportingLogger = {
  error(payload: unknown, message?: string): void;
  info?(payload: unknown, message?: string): void;
  warn?(payload: unknown, message?: string): void;
};

export type ReportingEventProcessor = {
  process(event: AbacusEvent): Promise<void>;
};

function normalizeMerchantKey(merchantRaw: string | null) {
  const base = merchantRaw?.trim().toLowerCase() || "unknown-merchant";

  return (
    base
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+/g, "")
      .replace(/-+$/g, "") || "unknown-merchant"
  );
}

function normalizeMerchantLabel(merchantRaw: string | null) {
  return merchantRaw?.trim() || "Unknown merchant";
}

function getPeriod(date: string) {
  return date.slice(0, 7);
}

function buildExpenseAggregates(
  rows: LedgerExpenseTransactionRow[]
): ReportingMetricAggregateInput[] {
  const totals = new Map<string, number>();
  const categories = new Map<
    string,
    {
      amount: number;
      categoryId: string | null;
      categoryName: string;
      transactionCount: number;
    }
  >();
  const vendors = new Map<
    string,
    {
      amount: number;
      merchantKey: string;
      merchantName: string;
      period: string;
      transactionCount: number;
    }
  >();

  for (const row of rows) {
    if (row.amount >= 0) {
      continue;
    }

    const period = getPeriod(row.date);
    const absoluteAmount = Math.abs(row.amount);
    const totalKey = `total_expenses:${period}`;
    const categoryId = row.categoryId ?? "uncategorized";
    const categoryName = row.categoryName ?? "Uncategorized";
    const categoryKey = `category_spend:${categoryId}:${period}`;
    const merchantKey = normalizeMerchantKey(row.merchantRaw);
    const vendorKey = `vendor_spend:${merchantKey}:${period}`;

    totals.set(totalKey, (totals.get(totalKey) ?? 0) + absoluteAmount);

    categories.set(categoryKey, {
      amount: (categories.get(categoryKey)?.amount ?? 0) + absoluteAmount,
      categoryId: row.categoryId,
      categoryName,
      transactionCount: (categories.get(categoryKey)?.transactionCount ?? 0) + 1,
    });

    vendors.set(vendorKey, {
      amount: (vendors.get(vendorKey)?.amount ?? 0) + absoluteAmount,
      merchantKey,
      merchantName: normalizeMerchantLabel(row.merchantRaw),
      period,
      transactionCount: (vendors.get(vendorKey)?.transactionCount ?? 0) + 1,
    });
  }

  const aggregates: ReportingMetricAggregateInput[] = [];

  for (const [metricKey, value] of totals.entries()) {
    const period = metricKey.slice("total_expenses:".length);
    aggregates.push({
      metadata: {
        kind: "expense_total",
      },
      metricKey,
      period,
      value,
    });
  }

  for (const [metricKey, category] of categories.entries()) {
    const period = metricKey.slice(metricKey.lastIndexOf(":") + 1);
    aggregates.push({
      metadata: {
        categoryId: category.categoryId,
        categoryName: category.categoryName,
        transactionCount: category.transactionCount,
      },
      metricKey,
      period,
      value: category.amount,
    });
  }

  for (const [metricKey, vendor] of vendors.entries()) {
    aggregates.push({
      metadata: {
        merchantKey: vendor.merchantKey,
        merchantName: vendor.merchantName,
        transactionCount: vendor.transactionCount,
      },
      metricKey,
      period: vendor.period,
      value: vendor.amount,
    });
  }

  return aggregates.sort((left, right) => left.metricKey.localeCompare(right.metricKey));
}

async function rebuildExpenseMetrics(
  repository: ReportingMetricsRepository,
  organizationId: string
) {
  const rows = await repository.listLedgerExpenseTransactionsForOrganization(organizationId);
  const aggregates = buildExpenseAggregates(rows);

  await repository.replaceMetricAggregatesForOrganization(organizationId, aggregates);
}

export function createReportingEventProcessor(
  repository: ReportingMetricsRepository,
  logger: ReportingLogger
): ReportingEventProcessor {
  return {
    async process(event) {
      switch (event.eventType) {
        case "transaction.created":
          await rebuildExpenseMetrics(repository, event.organizationId);
          return;

        case "transaction.updated":
          await rebuildExpenseMetrics(repository, event.organizationId);
          return;

        case "expense.categorized":
          await rebuildExpenseMetrics(repository, event.organizationId);
          return;

        case "account.reconciled":
          logger.info?.(
            {
              eventId: event.eventId,
              organizationId: event.organizationId,
            },
            "reporting subscriber received account.reconciled with no aggregate work yet"
          );
          return;

        case "invoice.paid":
          logger.info?.(
            {
              eventId: event.eventId,
              organizationId: event.organizationId,
            },
            "reporting subscriber received invoice.paid with no aggregate work yet"
          );
          return;

        default:
          logger.info?.(
            {
              eventId: event.eventId,
              eventType: event.eventType,
              organizationId: event.organizationId,
            },
            "reporting subscriber ignored unsupported event type"
          );
      }
    },
  };
}

export { buildExpenseAggregates };
