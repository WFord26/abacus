import type { ReportingMetricsRepository } from "../repositories/reporting.repo";
import type { PnLLineItem, PnLReport } from "@wford26/shared-types";

function getComparableTimestamp(value: string) {
  return new Date(value).getTime();
}

function toCategoryLineItem(metric: {
  computedAt: string;
  metadata?: Record<string, string | number | boolean | null> | null;
  value: number;
}): PnLLineItem {
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

export type ReportingReportsService = {
  getPnlReport(organizationId: string, period: string): Promise<PnLReport>;
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
      const generatedAt =
        metrics.length > 0
          ? metrics.reduce(
              (latest, metric) =>
                getComparableTimestamp(metric.computedAt) > getComparableTimestamp(latest)
                  ? metric.computedAt
                  : latest,
              metrics[0]?.computedAt ?? new Date().toISOString()
            )
          : new Date().toISOString();

      return {
        expenses: expenseMetrics.map(toCategoryLineItem),
        generatedAt,
        income: [],
        netIncome: -(totalExpensesMetric?.value ?? 0),
        period,
        totalExpenses: totalExpensesMetric?.value ?? 0,
        totalIncome: 0,
      };
    },
  };
}
