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

export type DashboardSummary = {
  period: string;
  cashOnHand: number;
  monthlyRevenue: number;
  monthlyExpenses: number;
  unreviewedTransactions: number;
  receiptBacklog: number;
  generatedAt: string;
};
