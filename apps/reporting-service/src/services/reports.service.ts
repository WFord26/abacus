import type { ReportingMetricsRepository } from "../repositories/reporting.repo";
import type {
  ExpenseByCategoryReport,
  MetricAggregate,
  PnLLineItem,
  PnLReport,
  VendorSpendReport,
} from "@wford26/shared-types";

function getComparableTimestamp(value: string) {
  return new Date(value).getTime();
}

function getGeneratedAt(metrics: MetricAggregate[]) {
  return metrics.length > 0
    ? metrics.reduce(
        (latest, metric) =>
          getComparableTimestamp(metric.computedAt) > getComparableTimestamp(latest)
            ? metric.computedAt
            : latest,
        metrics[0]?.computedAt ?? new Date().toISOString()
      )
    : new Date().toISOString();
}

function toCategoryLineItem(metric: MetricAggregate): PnLLineItem {
  const categoryId =
    typeof metric.metadata?.categoryId === "string" ? metric.metadata.categoryId : null;
  const categoryName =
    typeof metric.metadata?.categoryName === "string"
      ? metric.metadata.categoryName
      : "Uncategorized";

  return {
    amount: metric.value,
    categoryId,
    categoryName,
  };
}

function getRoundedPercentages(values: number[]) {
  if (values.length === 0) {
    return [];
  }

  const total = values.reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    return values.map(() => 0);
  }

  const allocations = values.map((value, index) => {
    const raw = (value / total) * 10000;
    const base = Math.floor(raw);

    return {
      base,
      fractional: raw - base,
      index,
    };
  });

  let remaining = 10000 - allocations.reduce((sum, allocation) => sum + allocation.base, 0);
  const ranked = [...allocations].sort((left, right) => {
    if (right.fractional !== left.fractional) {
      return right.fractional - left.fractional;
    }

    return left.index - right.index;
  });

  for (const allocation of ranked) {
    if (remaining <= 0) {
      break;
    }

    allocation.base += 1;
    remaining -= 1;
  }

  const percentageMap = new Map(
    ranked.map((allocation) => [allocation.index, allocation.base / 100])
  );

  return values.map((_, index) => percentageMap.get(index) ?? 0);
}

export type ReportingReportsService = {
  getExpenseByCategoryReport(
    organizationId: string,
    period: string,
    limit: number
  ): Promise<ExpenseByCategoryReport>;
  getPnlReport(organizationId: string, period: string): Promise<PnLReport>;
  getVendorSpendReport(
    organizationId: string,
    period: string,
    limit: number
  ): Promise<VendorSpendReport>;
};

export function createReportingReportsService(
  repository: ReportingMetricsRepository
): ReportingReportsService {
  return {
    async getPnlReport(organizationId, period) {
      const metrics = await repository.listMetricAggregatesForOrganizationPeriod(
        organizationId,
        period
      );

      const totalExpensesMetric =
        metrics.find((metric) => metric.metricKey === `total_expenses:${period}`) ?? null;
      const expenseMetrics = metrics
        .filter((metric) => metric.metricKey.startsWith("category_spend:"))
        .sort((left, right) => right.value - left.value);

      return {
        expenses: expenseMetrics.map(toCategoryLineItem),
        generatedAt: getGeneratedAt(metrics),
        income: [],
        netIncome: -(totalExpensesMetric?.value ?? 0),
        period,
        totalExpenses: totalExpensesMetric?.value ?? 0,
        totalIncome: 0,
      };
    },

    async getExpenseByCategoryReport(organizationId, period, limit) {
      const metrics = await repository.listMetricAggregatesForOrganizationPeriod(
        organizationId,
        period
      );
      const categoryMetrics = metrics
        .filter((metric) => metric.metricKey.startsWith("category_spend:"))
        .sort((left, right) => right.value - left.value)
        .slice(0, limit);
      const total = categoryMetrics.reduce((sum, metric) => sum + metric.value, 0);
      const percentages = getRoundedPercentages(categoryMetrics.map((metric) => metric.value));

      return {
        categories: categoryMetrics.map((metric, index) => ({
          amount: metric.value,
          categoryId:
            typeof metric.metadata?.categoryId === "string" ? metric.metadata.categoryId : null,
          categoryName:
            typeof metric.metadata?.categoryName === "string"
              ? metric.metadata.categoryName
              : "Uncategorized",
          percentage: percentages[index] ?? 0,
          transactionCount:
            typeof metric.metadata?.transactionCount === "number"
              ? metric.metadata.transactionCount
              : 0,
        })),
        generatedAt: getGeneratedAt(metrics),
        period,
        total,
      };
    },

    async getVendorSpendReport(organizationId, period, limit) {
      const metrics = await repository.listMetricAggregatesForOrganizationPeriod(
        organizationId,
        period
      );
      const vendorMetrics = metrics
        .filter((metric) => metric.metricKey.startsWith("vendor_spend:"))
        .sort((left, right) => right.value - left.value)
        .slice(0, limit);

      return {
        generatedAt: getGeneratedAt(metrics),
        period,
        vendors: vendorMetrics.map((metric) => ({
          amount: metric.value,
          merchantName:
            typeof metric.metadata?.merchantName === "string"
              ? metric.metadata.merchantName
              : "Unknown merchant",
          transactionCount:
            typeof metric.metadata?.transactionCount === "number"
              ? metric.metadata.transactionCount
              : 0,
        })),
      };
    },
  };
}
