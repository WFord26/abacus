"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@wford26/ui";
import Link from "next/link";
import { useMemo } from "react";

import { useAuth } from "../../contexts/auth-context";
import { apiClient } from "../../lib/api-client";

import type {
  Account,
  CategoryTreeNode,
  Transaction,
  TransactionListResponse,
} from "@wford26/shared-types";

type AccountBalanceResponse = {
  accountId: string;
  asOf: string;
  balance: number;
  currency: "USD";
};

type DashboardAccountRow = {
  balance: number;
  id: string;
  name: string;
  type: Account["type"];
};

type DashboardCategorySummary = {
  amount: number;
  name: string;
};

type DashboardSnapshot = {
  accountBalances: DashboardAccountRow[];
  currentMonthExpenses: number;
  previousMonthExpenses: number;
  recentTransactions: Transaction[];
  topSpendingCategory: DashboardCategorySummary | null;
  uncategorizedCount: number;
  unreviewedCount: number;
};

const DASHBOARD_REFRESH_MS = 5 * 60 * 1000;

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

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
  }).format(date);
}

function formatTransactionDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function isBetween(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

function flattenCategories(categories: CategoryTreeNode[]): CategoryTreeNode[] {
  return categories.flatMap((category) => [category, ...flattenCategories(category.children)]);
}

function getTransactionLabel(transaction: Transaction) {
  return transaction.merchantRaw ?? transaction.description ?? "Untitled transaction";
}

function buildTrendCopy(current: number, previous: number) {
  if (previous === 0 && current === 0) {
    return "No expense activity yet";
  }

  if (previous === 0) {
    return "First month with tracked expenses";
  }

  const delta = ((current - previous) / previous) * 100;
  const formatted = `${delta > 0 ? "+" : ""}${delta.toFixed(0)}%`;
  return `${formatted} vs last month`;
}

async function fetchAllTransactions() {
  const transactions: Transaction[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await apiClient<TransactionListResponse>(
      `/transactions?limit=100&page=${page}`
    );

    transactions.push(...response.data);
    hasMore = response.meta.hasMore;
    page += 1;
  }

  return transactions;
}

async function fetchDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [accounts, categories, transactions] = await Promise.all([
    apiClient<Account[]>("/accounts"),
    apiClient<CategoryTreeNode[]>("/categories"),
    fetchAllTransactions(),
  ]);

  const balances = await Promise.all(
    accounts.map(async (account) => {
      const balance = await apiClient<AccountBalanceResponse>(`/accounts/${account.id}/balance`);
      return [account.id, balance.balance] as const;
    })
  );

  const balanceMap = new Map(balances);
  const categoryMap = new Map(
    flattenCategories(categories).map((category) => [category.id, category.name] as const)
  );

  const now = new Date();
  const currentMonth = startOfMonth(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
  const previousMonth = startOfMonth(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  );
  const currentStart = toDateKey(currentMonth);
  const currentEnd = toDateKey(endOfMonth(currentMonth));
  const previousStart = toDateKey(previousMonth);
  const previousEnd = toDateKey(endOfMonth(previousMonth));

  const currentMonthTransactions = transactions.filter((transaction) =>
    isBetween(transaction.date, currentStart, currentEnd)
  );
  const previousMonthTransactions = transactions.filter((transaction) =>
    isBetween(transaction.date, previousStart, previousEnd)
  );

  const currentMonthExpenses = currentMonthTransactions.reduce(
    (sum, transaction) => sum + (transaction.amount < 0 ? Math.abs(transaction.amount) : 0),
    0
  );
  const previousMonthExpenses = previousMonthTransactions.reduce(
    (sum, transaction) => sum + (transaction.amount < 0 ? Math.abs(transaction.amount) : 0),
    0
  );

  const topCategoryTotals = new Map<string, number>();

  for (const transaction of currentMonthTransactions) {
    if (transaction.amount >= 0) {
      continue;
    }

    const categoryKey = transaction.categoryId ?? "__uncategorized__";
    topCategoryTotals.set(
      categoryKey,
      (topCategoryTotals.get(categoryKey) ?? 0) + Math.abs(transaction.amount)
    );
  }

  let topSpendingCategory: DashboardCategorySummary | null = null;

  for (const [categoryId, amount] of topCategoryTotals.entries()) {
    if (!topSpendingCategory || amount > topSpendingCategory.amount) {
      topSpendingCategory = {
        amount,
        name:
          categoryId === "__uncategorized__"
            ? "Uncategorized"
            : (categoryMap.get(categoryId) ?? "Unknown category"),
      };
    }
  }

  const recentTransactions = [...transactions]
    .sort((left, right) => {
      if (left.date !== right.date) {
        return right.date.localeCompare(left.date);
      }

      return right.createdAt.localeCompare(left.createdAt);
    })
    .slice(0, 5);

  const accountBalances = accounts
    .map((account) => ({
      balance: balanceMap.get(account.id) ?? 0,
      id: account.id,
      name: account.name,
      type: account.type,
    }))
    .sort((left, right) => Math.abs(right.balance) - Math.abs(left.balance));

  return {
    accountBalances,
    currentMonthExpenses,
    previousMonthExpenses,
    recentTransactions,
    topSpendingCategory,
    uncategorizedCount: transactions.filter((transaction) => !transaction.categoryId).length,
    unreviewedCount: transactions.filter((transaction) => transaction.reviewStatus === "unreviewed")
      .length,
  };
}

function MetricCard({
  body,
  eyebrow,
  title,
}: Readonly<{
  body: React.ReactNode;
  eyebrow: string;
  title: string;
}>) {
  return (
    <Card className="glass-panel rise-in border-0">
      <CardHeader className="space-y-2">
        <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
          {eyebrow}
        </p>
        <CardTitle className="text-xl text-neutral-900 dark:text-neutral-50">{title}</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {Array.from({ length: 5 }).map((_, index) => (
        <Card
          key={index}
          className={index === 4 ? "glass-panel border-0 xl:col-span-2" : "glass-panel border-0"}
        >
          <CardHeader className="space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-44" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { organization } = useAuth();
  const dashboardQueryKey = useMemo(
    () => ["dashboard-summary", organization?.id ?? "unknown"],
    [organization?.id]
  );
  const dashboardQuery = useQuery({
    enabled: Boolean(organization?.id),
    queryFn: fetchDashboardSnapshot,
    queryKey: dashboardQueryKey,
    refetchInterval: DASHBOARD_REFRESH_MS,
    staleTime: DASHBOARD_REFRESH_MS,
  });

  if (dashboardQuery.isLoading) {
    return <DashboardSkeleton />;
  }

  if (dashboardQuery.isError) {
    return (
      <div className="rounded-[2rem] border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-700">
        Unable to load the dashboard summary right now. Try refreshing once the ledger services are
        back online.
      </div>
    );
  }

  const snapshot = dashboardQuery.data;

  if (!snapshot || snapshot.recentTransactions.length === 0) {
    return (
      <Card className="glass-panel panel-grid rise-in overflow-hidden border-0">
        <CardHeader className="space-y-2">
          <p className="text-xs uppercase tracking-[0.26em] text-primary-600">Overview</p>
          <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">
            Your dashboard is ready
          </CardTitle>
          <CardDescription className="max-w-2xl text-base text-neutral-700 dark:text-neutral-300">
            This workspace does not have any transactions yet, so the summary cards will fill in as
            soon as you import a CSV or add the first ledger entry.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row">
          <Button asChild>
            <Link href="/transactions">Add or import transactions</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/receipts">Upload receipts</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const currentMonthLabel = formatMonthLabel(new Date());

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <MetricCard
        eyebrow="This month"
        title="Total expenses"
        body={
          <div className="space-y-3">
            <p className="text-4xl font-semibold text-neutral-900 dark:text-neutral-50">
              {formatCurrency(snapshot.currentMonthExpenses)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{currentMonthLabel}</Badge>
              <Badge
                variant={
                  snapshot.currentMonthExpenses > snapshot.previousMonthExpenses
                    ? "warning"
                    : "success"
                }
              >
                {buildTrendCopy(snapshot.currentMonthExpenses, snapshot.previousMonthExpenses)}
              </Badge>
            </div>
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              Last month closed at {formatCurrency(snapshot.previousMonthExpenses)} in tracked
              outflows.
            </p>
          </div>
        }
      />

      <MetricCard
        eyebrow="Review queue"
        title="Unreviewed transactions"
        body={
          <div className="space-y-3">
            <p className="text-4xl font-semibold text-neutral-900 dark:text-neutral-50">
              {snapshot.unreviewedCount}
            </p>
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              Keep review moving so imported activity is confirmed before reporting rolls up.
            </p>
            <Button asChild size="sm">
              <Link href="/transactions?status=unreviewed">Review transactions</Link>
            </Button>
          </div>
        }
      />

      <MetricCard
        eyebrow="Categorization"
        title="Uncategorized transactions"
        body={
          <div className="space-y-3">
            <p className="text-4xl font-semibold text-neutral-900 dark:text-neutral-50">
              {snapshot.uncategorizedCount}
            </p>
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              These rows still need a category before month-end reporting can fully settle.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href="/transactions">Categorize now</Link>
            </Button>
          </div>
        }
      />

      <MetricCard
        eyebrow="Spending mix"
        title="Top spending category"
        body={
          snapshot.topSpendingCategory ? (
            <div className="space-y-3">
              <p className="text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
                {snapshot.topSpendingCategory.name}
              </p>
              <p className="text-lg text-neutral-700 dark:text-neutral-300">
                {formatCurrency(snapshot.topSpendingCategory.amount)} this month
              </p>
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                Largest outflow category based on current-month transactions already in the ledger.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                No categorized spend yet
              </p>
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                As expense transactions land this month, the dashboard will surface the category
                that is carrying the most spend.
              </p>
            </div>
          )
        }
      />

      <MetricCard
        eyebrow="Cash position"
        title="Account balances"
        body={
          <div className="space-y-3">
            <div className="space-y-2">
              {snapshot.accountBalances.slice(0, 5).map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded-[1.2rem] border border-neutral-200 bg-white/80 px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900/50"
                >
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-neutral-50">
                      {account.name}
                    </p>
                    <p className="text-xs uppercase tracking-[0.16em] text-neutral-500">
                      {account.type}
                    </p>
                  </div>
                  <p className="font-semibold text-neutral-900 dark:text-neutral-50">
                    {formatCompactCurrency(account.balance)}
                  </p>
                </div>
              ))}
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/settings/accounts">View all accounts</Link>
            </Button>
          </div>
        }
      />

      <Card className="glass-panel rise-in border-0 xl:col-span-2">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
              Activity
            </p>
            <CardTitle className="text-2xl text-neutral-900 dark:text-neutral-50">
              Recent transactions
            </CardTitle>
            <CardDescription className="text-sm text-neutral-700 dark:text-neutral-300">
              The last five ledger entries in the current workspace.
            </CardDescription>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/transactions">Open transactions</Link>
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3">
          {snapshot.recentTransactions.map((transaction) => (
            <div
              key={transaction.id}
              className="flex flex-col gap-2 rounded-[1.4rem] border border-neutral-200 bg-white/80 px-4 py-4 md:flex-row md:items-center md:justify-between dark:border-neutral-700 dark:bg-neutral-900/50"
            >
              <div>
                <p className="font-medium text-neutral-900 dark:text-neutral-50">
                  {getTransactionLabel(transaction)}
                </p>
                <div className="mt-1 flex flex-wrap gap-2 text-sm text-neutral-600 dark:text-neutral-400">
                  <span>{formatTransactionDate(transaction.date)}</span>
                  <span>{transaction.reviewStatus}</span>
                  <span>{transaction.categoryId ? "Categorized" : "Needs category"}</span>
                </div>
              </div>
              <p
                className={[
                  "text-lg font-semibold",
                  transaction.amount < 0 ? "text-red-600" : "text-emerald-700",
                ].join(" ")}
              >
                {formatCurrency(transaction.amount)}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
