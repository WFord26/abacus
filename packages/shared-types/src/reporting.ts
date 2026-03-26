import type { AccountType, ReviewStatus } from "./ledger";

export type MetricAggregate = {
  id: string;
  organizationId: string;
  metricKey: string;
  period: string;
  value: number;
  metadata?: Record<string, string | number | boolean | null> | null;
  computedAt: string;
};

export type PnLLineItem = {
  categoryId?: string | null;
  categoryName: string;
  amount: number;
};

export type PnLReport = {
  period: string;
  income: PnLLineItem[];
  expenses: PnLLineItem[];
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  generatedAt: string;
};

export type ExpenseByCategoryReport = {
  period: string;
  categories: Array<{
    categoryId?: string | null;
    categoryName: string;
    amount: number;
    percentage: number;
    transactionCount: number;
  }>;
  total: number;
  generatedAt: string;
};

export type VendorSpendReport = {
  period: string;
  vendors: Array<{
    merchantName: string;
    amount: number;
    transactionCount: number;
  }>;
  generatedAt: string;
};

export type DashboardTopCategory = {
  categoryId?: string | null;
  name: string;
  amount: number;
};

export type DashboardCurrentMonthSummary = {
  period: string;
  totalExpenses: number;
  expenseTrend: number;
  topCategory: DashboardTopCategory | null;
};

export type DashboardAccountBalance = {
  accountId: string;
  accountName: string;
  accountType: AccountType;
  balance: number;
  asOf: string;
};

export type DashboardRecentTransaction = {
  id: string;
  accountId: string;
  accountName: string;
  amount: number;
  categoryId?: string | null;
  categoryName?: string | null;
  createdAt: string;
  date: string;
  description?: string | null;
  merchantRaw?: string | null;
  reviewStatus: ReviewStatus;
};

export type DashboardSummary = {
  currentMonth: DashboardCurrentMonthSummary;
  unreviewedCount: number;
  uncategorizedCount: number;
  accountBalances: DashboardAccountBalance[];
  recentTransactions: DashboardRecentTransaction[];
  generatedAt: string;
};

export type ReportExportJobStatus = "pending" | "processing" | "complete" | "failed";

export type ReportExportJobStartResponse = {
  jobId: string;
  status: ReportExportJobStatus;
};

export type ReportExportJobResponse = {
  jobId: string;
  status: ReportExportJobStatus;
  createdAt: string;
  completedAt?: string | null;
  downloadUrl?: string | null;
  downloadUrlExpiresAt?: string | null;
  errorMessage?: string | null;
};
