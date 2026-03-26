"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@wford26/ui";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useAuth } from "../../contexts/auth-context";
import { ApiClientError, apiClient } from "../../lib/api-client";

import type {
  Account,
  CategoryTreeNode,
  ExpenseByCategoryReport,
  PnLReport,
  ReportExportJobResponse,
  ReportExportJobStartResponse,
  Transaction,
  TransactionListResponse,
  VendorSpendReport,
} from "@wford26/shared-types";

type ToastState = {
  description: string;
  title: string;
};

type TrendPoint = {
  amount: number;
  label: string;
  period: string;
};

const chartColors = [
  "#1d4ed8",
  "#0f766e",
  "#ea580c",
  "#b45309",
  "#0891b2",
  "#7c3aed",
  "#dc2626",
  "#65a30d",
];

function flattenCategories(categories: CategoryTreeNode[]): CategoryTreeNode[] {
  return categories.flatMap((category) => [category, ...flattenCategories(category.children)]);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value);
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 1,
    notation: "compact",
    style: "currency",
  }).format(value);
}

function formatMonthLabel(period: string) {
  const [year, month] = period.split("-").map(Number);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, 1)));
}

function formatMonthInputValue(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function buildPeriodRange(period: string) {
  const [year, month] = period.split("-").map(Number);
  const start = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, 1));
  const end = new Date(Date.UTC(year ?? 0, month ?? 1, 0));

  return {
    end: end.toISOString().slice(0, 10),
    start: start.toISOString().slice(0, 10),
  };
}

function getRecentPeriods(anchorPeriod: string, count: number) {
  const [anchorYear, anchorMonth] = anchorPeriod.split("-").map(Number);
  const anchorDate = new Date(Date.UTC(anchorYear ?? 0, (anchorMonth ?? 1) - 1, 1));

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(
      Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth() - (count - index - 1), 1)
    );

    return formatMonthInputValue(date);
  });
}

function getTransactionLabel(transaction: Transaction) {
  return transaction.merchantRaw ?? transaction.description ?? "Untitled transaction";
}

function getExpenseBadgeVariant(netIncome: number) {
  return netIncome >= 0 ? "success" : "warning";
}

function buildErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return fallback;
}

function downloadSignedUrl(url: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noreferrer";
  anchor.target = "_blank";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function ReportsSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <Card className="glass-panel border-0 xl:col-span-12">
        <CardHeader className="space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-10 w-56" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row">
          <Skeleton className="h-11 w-full md:w-48" />
          <Skeleton className="h-11 w-full md:w-36" />
        </CardContent>
      </Card>
      {Array.from({ length: 7 }).map((_, index) => (
        <Card
          key={index}
          className={`glass-panel border-0 ${
            index < 3 ? "xl:col-span-4" : index < 5 ? "xl:col-span-6" : "xl:col-span-12"
          }`}
        >
          <CardHeader className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-44" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyReportsState({ period }: Readonly<{ period: string }>) {
  return (
    <Card className="glass-panel panel-grid rise-in overflow-hidden border-0">
      <CardHeader className="space-y-3">
        <p className="text-xs uppercase tracking-[0.26em] text-primary-600">Insights</p>
        <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">
          No report activity yet for {formatMonthLabel(period)}
        </CardTitle>
        <CardDescription className="max-w-2xl text-base text-neutral-700 dark:text-neutral-300">
          Import a CSV, review the new rows, and categorize a few expenses. The charts here will
          fill in automatically once ledger activity lands for the selected month.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="h-24 w-24 rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(37,99,235,0.42),transparent_55%),linear-gradient(160deg,rgba(255,255,255,0.96),rgba(219,234,254,0.92))]" />
          <div className="h-20 w-20 rounded-[1.8rem] bg-[linear-gradient(180deg,rgba(14,165,233,0.18),rgba(249,115,22,0.16))]" />
        </div>
        <div className="flex flex-col gap-3 md:flex-row">
          <Button asChild>
            <Link href="/transactions">Import transactions</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/expenses">Open review queue</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ReportsPage() {
  const { organization } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState(() => formatMonthInputValue(new Date()));
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [handledExportJobId, setHandledExportJobId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const periodRange = useMemo(() => buildPeriodRange(selectedPeriod), [selectedPeriod]);
  const trendPeriods = useMemo(() => getRecentPeriods(selectedPeriod, 6), [selectedPeriod]);

  const pnlQuery = useQuery({
    enabled: Boolean(organization?.id),
    queryFn: () => apiClient<PnLReport>(`/reports/pnl?period=${selectedPeriod}`),
    queryKey: ["reports-pnl", organization?.id ?? "unknown", selectedPeriod],
  });
  const categoriesReportQuery = useQuery({
    enabled: Boolean(organization?.id),
    queryFn: () =>
      apiClient<ExpenseByCategoryReport>(
        `/reports/expenses-by-category?period=${selectedPeriod}&limit=8`
      ),
    queryKey: ["reports-categories", organization?.id ?? "unknown", selectedPeriod],
  });
  const vendorsReportQuery = useQuery({
    enabled: Boolean(organization?.id),
    queryFn: () =>
      apiClient<VendorSpendReport>(`/reports/vendor-spend?period=${selectedPeriod}&limit=8`),
    queryKey: ["reports-vendors", organization?.id ?? "unknown", selectedPeriod],
  });
  const trendQuery = useQuery({
    enabled: Boolean(organization?.id),
    queryFn: async () =>
      Promise.all(
        trendPeriods.map(async (period) => {
          const report = await apiClient<PnLReport>(`/reports/pnl?period=${period}`);

          return {
            amount: report.totalExpenses,
            label: formatMonthLabel(period).split(" ")[0] ?? period,
            period,
          } satisfies TrendPoint;
        })
      ),
    queryKey: ["reports-trend", organization?.id ?? "unknown", selectedPeriod],
  });
  const accountsQuery = useQuery({
    enabled: Boolean(organization?.id),
    queryFn: () => apiClient<Account[]>("/accounts"),
    queryKey: ["reports-accounts", organization?.id ?? "unknown"],
  });
  const categoriesTreeQuery = useQuery({
    enabled: Boolean(organization?.id),
    queryFn: () => apiClient<CategoryTreeNode[]>("/categories"),
    queryKey: ["reports-categories-tree", organization?.id ?? "unknown"],
  });
  const transactionsQuery = useQuery({
    enabled: Boolean(organization?.id),
    placeholderData: (previousData: TransactionListResponse | undefined) => previousData,
    queryFn: () =>
      apiClient<TransactionListResponse>(
        `/transactions?limit=25&page=1&dateFrom=${periodRange.start}&dateTo=${periodRange.end}${
          selectedCategoryId ? `&categoryId=${selectedCategoryId}` : ""
        }`
      ),
    queryKey: [
      "reports-transactions",
      organization?.id ?? "unknown",
      selectedPeriod,
      selectedCategoryId ?? "__all__",
    ],
  });

  const exportStartMutation = useMutation({
    mutationFn: () =>
      apiClient<ReportExportJobStartResponse>("/reports/export/csv", {
        method: "POST",
      }),
    onError: (error) => {
      setToast({
        description: buildErrorMessage(error, "Unable to start export"),
        title: "Export not started",
      });
    },
    onSuccess: (result) => {
      setHandledExportJobId(null);
      setExportJobId(result.jobId);
    },
  });
  const exportStatusQuery = useQuery({
    enabled: Boolean(exportJobId),
    queryFn: () => apiClient<ReportExportJobResponse>(`/reports/export/${exportJobId}`),
    queryKey: ["reports-export", exportJobId ?? "none"],
    refetchInterval: 1500,
  });

  const accountMap = useMemo(
    () => new Map((accountsQuery.data ?? []).map((account) => [account.id, account.name] as const)),
    [accountsQuery.data]
  );
  const categoryMap = useMemo(
    () =>
      new Map(
        flattenCategories(categoriesTreeQuery.data ?? []).map((category) => [
          category.id,
          category.name,
        ])
      ),
    [categoriesTreeQuery.data]
  );

  const categoryChartData = useMemo(
    () =>
      (categoriesReportQuery.data?.categories ?? []).map((category, index) => ({
        ...category,
        color: chartColors[index % chartColors.length] ?? "#1d4ed8",
      })),
    [categoriesReportQuery.data?.categories]
  );
  const transactionRows = useMemo(
    () =>
      (transactionsQuery.data?.data ?? []).map((transaction) => ({
        ...transaction,
        accountName: accountMap.get(transaction.accountId) ?? "Unknown account",
        categoryName: transaction.categoryId
          ? (categoryMap.get(transaction.categoryId) ?? "Unknown category")
          : "Uncategorized",
      })),
    [accountMap, categoryMap, transactionsQuery.data?.data]
  );
  const selectedCategory = useMemo(
    () => categoryChartData.find((category) => category.categoryId === selectedCategoryId) ?? null,
    [categoryChartData, selectedCategoryId]
  );

  useEffect(() => {
    if (!selectedCategoryId) {
      return;
    }

    const stillVisible = categoryChartData.some(
      (category) => category.categoryId === selectedCategoryId
    );

    if (!stillVisible) {
      setSelectedCategoryId(null);
    }
  }, [categoryChartData, selectedCategoryId]);

  useEffect(() => {
    if (!exportJobId || handledExportJobId === exportJobId || !exportStatusQuery.data) {
      return;
    }

    if (exportStatusQuery.data.status === "complete" && exportStatusQuery.data.downloadUrl) {
      downloadSignedUrl(exportStatusQuery.data.downloadUrl);
      setHandledExportJobId(exportJobId);
      setExportJobId(null);
      setToast({
        description: "Your export is ready and the download has been opened.",
        title: "Export complete",
      });
      return;
    }

    if (exportStatusQuery.data.status === "failed") {
      setHandledExportJobId(exportJobId);
      setExportJobId(null);
      setToast({
        description: exportStatusQuery.data.errorMessage ?? "CSV export failed",
        title: "Export failed",
      });
    }
  }, [exportJobId, exportStatusQuery.data, handledExportJobId]);

  const isLoading =
    pnlQuery.isLoading ||
    categoriesReportQuery.isLoading ||
    vendorsReportQuery.isLoading ||
    trendQuery.isLoading ||
    transactionsQuery.isLoading ||
    accountsQuery.isLoading ||
    categoriesTreeQuery.isLoading;
  const isError =
    pnlQuery.isError ||
    categoriesReportQuery.isError ||
    vendorsReportQuery.isError ||
    trendQuery.isError ||
    transactionsQuery.isError ||
    accountsQuery.isError ||
    categoriesTreeQuery.isError;
  const hasAnyData =
    (pnlQuery.data?.totalExpenses ?? 0) > 0 ||
    (pnlQuery.data?.totalIncome ?? 0) > 0 ||
    (categoriesReportQuery.data?.categories.length ?? 0) > 0 ||
    (vendorsReportQuery.data?.vendors.length ?? 0) > 0 ||
    transactionRows.length > 0;
  const isExporting = exportStartMutation.isPending || Boolean(exportJobId);

  if (isLoading) {
    return <ReportsSkeleton />;
  }

  if (isError) {
    return (
      <div className="rounded-[2rem] border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-700">
        Reporting data could not be loaded right now. Try refreshing once the reporting service is
        back online.
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="glass-panel panel-grid rise-in overflow-hidden border-0 xl:col-span-12">
          <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.26em] text-primary-600">Insights</p>
              <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">
                Reports
              </CardTitle>
              <CardDescription className="max-w-2xl text-base text-neutral-700 dark:text-neutral-300">
                Track monthly P&amp;L, category mix, vendor concentration, and export the ledger
                when you need an offline slice.
              </CardDescription>
            </div>
            <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
              <div className="space-y-1">
                <label
                  className="text-xs uppercase tracking-[0.2em] text-neutral-500"
                  htmlFor="reports-period"
                >
                  Period
                </label>
                <Input
                  id="reports-period"
                  className="min-w-[12rem]"
                  type="month"
                  value={selectedPeriod}
                  onChange={(event) => {
                    setSelectedPeriod(event.target.value);
                    setSelectedCategoryId(null);
                  }}
                />
              </div>
              <Button
                className="md:self-end"
                disabled={isExporting}
                onClick={() => void exportStartMutation.mutateAsync()}
              >
                {isExporting ? "Exporting..." : "Export CSV"}
              </Button>
            </div>
          </CardHeader>
        </Card>

        {!hasAnyData ? (
          <div className="xl:col-span-12">
            <EmptyReportsState period={selectedPeriod} />
          </div>
        ) : (
          <>
            <Card className="glass-panel border-0 xl:col-span-4">
              <CardHeader className="space-y-2">
                <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                  P&amp;L
                </p>
                <CardTitle className="text-2xl text-neutral-900 dark:text-neutral-50">
                  Income
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-4xl font-semibold text-emerald-700">
                  {formatCurrency(pnlQuery.data?.totalIncome ?? 0)}
                </p>
                <p className="text-sm text-neutral-700 dark:text-neutral-300">
                  Income-side reporting is still sparse until the invoicing paid-flow starts feeding
                  the ledger.
                </p>
              </CardContent>
            </Card>

            <Card className="glass-panel border-0 xl:col-span-4">
              <CardHeader className="space-y-2">
                <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                  P&amp;L
                </p>
                <CardTitle className="text-2xl text-neutral-900 dark:text-neutral-50">
                  Expenses
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-4xl font-semibold text-red-600">
                  {formatCurrency(pnlQuery.data?.totalExpenses ?? 0)}
                </p>
                <p className="text-sm text-neutral-700 dark:text-neutral-300">
                  {categoriesReportQuery.data?.categories.length
                    ? `${categoriesReportQuery.data.categories.length} active spend buckets this month`
                    : `No categorized spend yet for ${formatMonthLabel(selectedPeriod)}`}
                </p>
              </CardContent>
            </Card>

            <Card className="glass-panel border-0 xl:col-span-4">
              <CardHeader className="space-y-2">
                <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                  P&amp;L
                </p>
                <CardTitle className="text-2xl text-neutral-900 dark:text-neutral-50">
                  Net income
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p
                  className={`text-4xl font-semibold ${
                    (pnlQuery.data?.netIncome ?? 0) >= 0 ? "text-emerald-700" : "text-amber-700"
                  }`}
                >
                  {formatCurrency(pnlQuery.data?.netIncome ?? 0)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={getExpenseBadgeVariant(pnlQuery.data?.netIncome ?? 0)}>
                    {formatMonthLabel(selectedPeriod)}
                  </Badge>
                  <Badge variant="secondary">
                    {pnlQuery.data?.generatedAt
                      ? `Updated ${new Date(pnlQuery.data.generatedAt).toLocaleDateString("en-US")}`
                      : "Awaiting aggregates"}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-0 xl:col-span-6">
              <CardHeader className="space-y-2">
                <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                  Category mix
                </p>
                <CardTitle className="text-2xl text-neutral-900 dark:text-neutral-50">
                  Expense by category
                </CardTitle>
                <CardDescription className="text-sm text-neutral-700 dark:text-neutral-300">
                  Click a slice or row to filter the transaction list below.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="h-72">
                  {categoryChartData.length > 0 ? (
                    <ResponsiveContainer height="100%" width="100%">
                      <PieChart>
                        <Pie
                          data={categoryChartData}
                          dataKey="amount"
                          innerRadius={70}
                          outerRadius={108}
                          paddingAngle={2}
                          strokeWidth={0}
                          onClick={(entry) => {
                            const clickedCategoryId =
                              typeof entry.categoryId === "string" ? entry.categoryId : null;
                            setSelectedCategoryId((current) =>
                              current === clickedCategoryId ? null : clickedCategoryId
                            );
                          }}
                        >
                          {categoryChartData.map((category) => (
                            <Cell
                              key={category.categoryId ?? category.categoryName}
                              fill={category.color}
                              opacity={
                                selectedCategoryId &&
                                selectedCategoryId !== (category.categoryId ?? null)
                                  ? 0.45
                                  : 1
                              }
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => formatCurrency(Number(value))}
                          contentStyle={{
                            borderRadius: "18px",
                            border: "1px solid rgba(148, 163, 184, 0.25)",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-[1.8rem] border border-dashed border-neutral-300 bg-white/60 text-sm text-neutral-500">
                      No category breakdown yet
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {categoryChartData.map((category) => {
                    const isActive = selectedCategoryId === (category.categoryId ?? null);

                    return (
                      <button
                        key={category.categoryId ?? category.categoryName}
                        className={`flex w-full items-center justify-between rounded-[1.2rem] border px-4 py-3 text-left transition ${
                          isActive
                            ? "border-primary-300 bg-primary-50"
                            : "border-neutral-200 bg-white/75 hover:border-primary-200"
                        }`}
                        type="button"
                        onClick={() =>
                          setSelectedCategoryId((current) =>
                            current === (category.categoryId ?? null)
                              ? null
                              : (category.categoryId ?? null)
                          )
                        }
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: category.color }}
                            />
                            <span className="truncate font-medium text-neutral-900">
                              {category.categoryName}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-neutral-500">
                            {category.transactionCount} transactions •{" "}
                            {category.percentage.toFixed(2)}%
                          </p>
                        </div>
                        <span className="font-semibold text-neutral-900">
                          {formatCompactCurrency(category.amount)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-0 xl:col-span-6">
              <CardHeader className="space-y-2">
                <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                  Trend
                </p>
                <CardTitle className="text-2xl text-neutral-900 dark:text-neutral-50">
                  Six-month expense trend
                </CardTitle>
                <CardDescription className="text-sm text-neutral-700 dark:text-neutral-300">
                  Monthly expense totals ending in {formatMonthLabel(selectedPeriod)}.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer height="100%" width="100%">
                  <BarChart data={trendQuery.data ?? []}>
                    <XAxis axisLine={false} dataKey="label" tickLine={false} />
                    <YAxis
                      axisLine={false}
                      tickFormatter={(value) => formatCompactCurrency(Number(value))}
                      tickLine={false}
                      width={96}
                    />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(Number(value))}
                      labelFormatter={(label: string) => `${label}`}
                      contentStyle={{
                        borderRadius: "18px",
                        border: "1px solid rgba(148, 163, 184, 0.25)",
                      }}
                    />
                    <Bar dataKey="amount" fill="#1d4ed8" radius={[12, 12, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="glass-panel border-0 xl:col-span-5">
              <CardHeader className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                    Vendors
                  </p>
                  <CardTitle className="text-2xl text-neutral-900 dark:text-neutral-50">
                    Top vendors
                  </CardTitle>
                </div>
                <Badge variant="secondary">{formatMonthLabel(selectedPeriod)}</Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                {vendorsReportQuery.data?.vendors.length ? (
                  vendorsReportQuery.data.vendors.map((vendor, index) => (
                    <div
                      key={`${vendor.merchantName}-${index}`}
                      className="flex items-center justify-between rounded-[1.2rem] border border-neutral-200 bg-white/75 px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-neutral-900">{vendor.merchantName}</p>
                        <p className="text-xs text-neutral-500">
                          {vendor.transactionCount} transactions
                        </p>
                      </div>
                      <p className="font-semibold text-neutral-900">
                        {formatCompactCurrency(vendor.amount)}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.6rem] border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
                    No vendor concentration data yet for this period.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="glass-panel border-0 xl:col-span-7">
              <CardHeader className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                    Ledger slice
                  </p>
                  <CardTitle className="text-2xl text-neutral-900 dark:text-neutral-50">
                    {selectedCategory
                      ? selectedCategory.categoryName
                      : "Current-period transactions"}
                  </CardTitle>
                  <CardDescription className="text-sm text-neutral-700 dark:text-neutral-300">
                    {selectedCategory
                      ? "Filtered from the selected category segment."
                      : "Most recent transactions for the selected month."}
                  </CardDescription>
                </div>
                <div className="flex flex-col gap-2 md:flex-row">
                  {selectedCategory ? (
                    <Button size="sm" variant="outline" onClick={() => setSelectedCategoryId(null)}>
                      Clear category filter
                    </Button>
                  ) : null}
                  <Button asChild size="sm" variant="outline">
                    <Link
                      href={`/transactions?dateFrom=${periodRange.start}&dateTo=${periodRange.end}${
                        selectedCategoryId ? `&categoryId=${selectedCategoryId}` : ""
                      }`}
                    >
                      Open in transactions
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {transactionRows.length ? (
                  transactionRows.map((transaction) => (
                    <div
                      key={transaction.id}
                      className="flex flex-col gap-3 rounded-[1.3rem] border border-neutral-200 bg-white/75 px-4 py-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-neutral-900">
                          {getTransactionLabel(transaction)}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-neutral-500">
                          <span>{transaction.date}</span>
                          <span>{transaction.accountName}</span>
                          <span>{transaction.categoryName}</span>
                          <span>{transaction.reviewStatus}</span>
                        </div>
                      </div>
                      <p
                        className={`text-lg font-semibold ${
                          transaction.amount < 0 ? "text-red-600" : "text-emerald-700"
                        }`}
                      >
                        {formatCurrency(transaction.amount)}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.6rem] border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
                    No transactions match the current report filter.
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {toast ? (
          <Toast open onOpenChange={(open) => (!open ? setToast(null) : undefined)}>
            <ToastTitle>{toast.title}</ToastTitle>
            <ToastDescription>{toast.description}</ToastDescription>
          </Toast>
        ) : null}
        <ToastViewport />
      </div>
    </ToastProvider>
  );
}
