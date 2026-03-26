import type { ReportingDashboardCache } from "../lib/cache";
import type { ReportingExportJobQueue } from "../lib/export-queue";
import type { ReportingMetricsRepository } from "../repositories/reporting.repo";
import type {
  DashboardSummary,
  ExpenseByCategoryReport,
  MetricAggregate,
  PnLLineItem,
  PnLReport,
  ReportExportJobResponse,
  ReportExportJobStartResponse,
  VendorSpendReport,
} from "@wford26/shared-types";

const DASHBOARD_CACHE_TTL_SECONDS = 60;
const DASHBOARD_RECENT_TRANSACTIONS_LIMIT = 5;

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

function toPeriod(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function addUtcMonths(date: Date, offset: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
}

function getMetricValue(metrics: MetricAggregate[], key: string) {
  return metrics.find((metric) => metric.metricKey === key)?.value ?? 0;
}

function getExpenseTrend(currentMonthTotal: number, previousMonthTotal: number) {
  if (previousMonthTotal === 0) {
    return 0;
  }

  return Number((((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100).toFixed(2));
}

export type ReportingReportsService = {
  createCsvExportJob(organizationId: string, userId: string): Promise<ReportExportJobStartResponse>;
  getDashboardSummary(organizationId: string): Promise<DashboardSummary>;
  getExpenseByCategoryReport(
    organizationId: string,
    period: string,
    limit: number
  ): Promise<ExpenseByCategoryReport>;
  getCsvExportJob(jobId: string, organizationId: string): Promise<ReportExportJobResponse | null>;
  getPnlReport(organizationId: string, period: string): Promise<PnLReport>;
  getVendorSpendReport(
    organizationId: string,
    period: string,
    limit: number
  ): Promise<VendorSpendReport>;
};

export function createReportingReportsService(
  repository: ReportingMetricsRepository,
  options: {
    dashboardCache?: ReportingDashboardCache;
    exportQueue: ReportingExportJobQueue;
    now?: () => Date;
  }
): ReportingReportsService {
  return {
    async createCsvExportJob(organizationId, userId) {
      return options.exportQueue.enqueueCsvExport({
        organizationId,
        userId,
      });
    },

    async getDashboardSummary(organizationId) {
      const cached = await options.dashboardCache?.get(organizationId);

      if (cached) {
        return cached;
      }

      const now = options.now?.() ?? new Date();
      const currentPeriod = toPeriod(now);
      const previousPeriod = toPeriod(addUtcMonths(now, -1));
      const [currentMetrics, previousMetrics, ledgerSnapshot] = await Promise.all([
        repository.listMetricAggregatesForOrganizationPeriod(organizationId, currentPeriod),
        repository.listMetricAggregatesForOrganizationPeriod(organizationId, previousPeriod),
        repository.getDashboardLedgerSnapshot(organizationId, DASHBOARD_RECENT_TRANSACTIONS_LIMIT),
      ]);
      const currentTotalExpenses = getMetricValue(
        currentMetrics,
        `total_expenses:${currentPeriod}`
      );
      const previousTotalExpenses = getMetricValue(
        previousMetrics,
        `total_expenses:${previousPeriod}`
      );
      const topCategoryMetric =
        currentMetrics
          .filter((metric) => metric.metricKey.startsWith("category_spend:"))
          .sort((left, right) => right.value - left.value)[0] ?? null;
      const generatedAt = getGeneratedAt([
        ...currentMetrics,
        ...previousMetrics,
        ...ledgerSnapshot.accountBalances.map((account) => ({
          computedAt: account.asOf,
          id: `dashboard-balance:${account.accountId}`,
          metricKey: `dashboard-balance:${account.accountId}`,
          organizationId,
          period: currentPeriod,
          value: account.balance,
        })),
      ]);
      const summary: DashboardSummary = {
        accountBalances: ledgerSnapshot.accountBalances,
        currentMonth: {
          expenseTrend: getExpenseTrend(currentTotalExpenses, previousTotalExpenses),
          period: currentPeriod,
          topCategory: topCategoryMetric
            ? {
                amount: topCategoryMetric.value,
                categoryId:
                  typeof topCategoryMetric.metadata?.categoryId === "string"
                    ? topCategoryMetric.metadata.categoryId
                    : null,
                name:
                  typeof topCategoryMetric.metadata?.categoryName === "string"
                    ? topCategoryMetric.metadata.categoryName
                    : "Uncategorized",
              }
            : null,
          totalExpenses: currentTotalExpenses,
        },
        generatedAt,
        recentTransactions: ledgerSnapshot.recentTransactions,
        uncategorizedCount: ledgerSnapshot.uncategorizedCount,
        unreviewedCount: ledgerSnapshot.unreviewedCount,
      };

      await options.dashboardCache?.set(organizationId, summary, DASHBOARD_CACHE_TTL_SECONDS);

      return summary;
    },

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

    async getCsvExportJob(jobId, organizationId) {
      return options.exportQueue.getCsvExportJob(jobId, organizationId);
    },
  };
}
