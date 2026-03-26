"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@wford26/ui";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import { useAuth } from "../../contexts/auth-context";
import { ApiClientError, apiClient } from "../../lib/api-client";
import {
  ReceiptUploadModal,
  type ReceiptUploadModalTransaction,
} from "../documents/receipt-upload-modal";

import type {
  Account,
  CategoryTreeNode,
  ReviewStatus,
  Role,
  Transaction,
  TransactionListResponse,
} from "@wford26/shared-types";

type FlatCategoryOption = {
  color: string | null;
  id: string;
  label: string;
  name: string;
};

type ToastState = {
  description: string;
  title: string;
};

const mutationRoles: Role[] = ["owner", "admin", "accountant"];

function flattenCategories(categories: CategoryTreeNode[], level = 0): FlatCategoryOption[] {
  return categories.flatMap((category) => [
    {
      color: category.color ?? null,
      id: category.id,
      label: `${"· ".repeat(level)}${category.name}`,
      name: category.name,
    },
    ...flattenCategories(category.children, level + 1),
  ]);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value);
}

function formatLedgerDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function getTransactionLabel(transaction: Transaction) {
  return transaction.merchantRaw ?? transaction.description ?? "Untitled transaction";
}

function buildErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return fallback;
}

function ExpensesReviewSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
      <Card className="glass-panel border-0">
        <CardHeader className="space-y-3">
          <div className="h-4 w-24 animate-pulse rounded bg-neutral-200" />
          <div className="h-9 w-52 animate-pulse rounded bg-neutral-200" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-36 animate-pulse rounded-[1.6rem] border border-neutral-200 bg-white/70"
            />
          ))}
        </CardContent>
      </Card>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <Card key={index} className="glass-panel border-0">
            <CardHeader className="space-y-2">
              <div className="h-4 w-24 animate-pulse rounded bg-neutral-200" />
              <div className="h-8 w-28 animate-pulse rounded bg-neutral-200" />
            </CardHeader>
            <CardContent>
              <div className="h-20 animate-pulse rounded bg-neutral-100" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function ExpensesReviewPage() {
  const queryClient = useQueryClient();
  const { organization, organizations } = useAuth();
  const [search, setSearch] = useState("");
  const [showUncategorizedOnly, setShowUncategorizedOnly] = useState(false);
  const [receiptTarget, setReceiptTarget] = useState<ReceiptUploadModalTransaction | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  const activeRole = useMemo(
    () =>
      organizations.find((membership) => membership.organization.id === organization?.id)?.role ??
      null,
    [organization?.id, organizations]
  );
  const canManageTransactions = useMemo(
    () => (activeRole ? mutationRoles.includes(activeRole) : false),
    [activeRole]
  );

  const reviewQueueQuery = useQuery({
    enabled: Boolean(organization?.id),
    queryFn: () => apiClient<TransactionListResponse>("/transactions/review-queue"),
    queryKey: ["expenses-review-queue", organization?.id ?? "unknown"],
  });
  const flaggedQuery = useQuery({
    enabled: Boolean(organization?.id),
    queryFn: () =>
      apiClient<TransactionListResponse>("/transactions?status=flagged&limit=8&page=1"),
    queryKey: ["expenses-flagged", organization?.id ?? "unknown"],
  });
  const accountsQuery = useQuery({
    enabled: Boolean(organization?.id),
    queryFn: () => apiClient<Account[]>("/accounts"),
    queryKey: ["expenses-accounts", organization?.id ?? "unknown"],
  });
  const categoriesQuery = useQuery({
    enabled: Boolean(organization?.id),
    queryFn: () => apiClient<CategoryTreeNode[]>("/categories"),
    queryKey: ["expenses-categories", organization?.id ?? "unknown"],
  });

  const accountMap = useMemo(
    () => new Map((accountsQuery.data ?? []).map((account) => [account.id, account.name] as const)),
    [accountsQuery.data]
  );
  const flatCategories = useMemo(
    () => flattenCategories(categoriesQuery.data ?? []),
    [categoriesQuery.data]
  );
  const categoryMap = useMemo(
    () => new Map(flatCategories.map((category) => [category.id, category] as const)),
    [flatCategories]
  );

  const updateMutation = useMutation({
    mutationFn: async (input: { categoryId: string | null; transactionId: string }) =>
      apiClient<Transaction>(`/transactions/${input.transactionId}`, {
        body: {
          categoryId: input.categoryId,
        },
        method: "PATCH",
      }),
    onError: (error) => {
      setToast({
        description: buildErrorMessage(error, "Unable to update category"),
        title: "Category not updated",
      });
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["expenses-review-queue", organization?.id ?? "unknown"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["expenses-flagged", organization?.id ?? "unknown"],
        }),
      ]);
    },
  });
  const reviewMutation = useMutation({
    mutationFn: async (input: { status: ReviewStatus; transactionId: string }) =>
      apiClient<Transaction>(`/transactions/${input.transactionId}/review`, {
        body: {
          status: input.status,
        },
        method: "POST",
      }),
    onError: (error) => {
      setToast({
        description: buildErrorMessage(error, "Unable to update review status"),
        title: "Review status not updated",
      });
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["expenses-review-queue", organization?.id ?? "unknown"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["expenses-flagged", organization?.id ?? "unknown"],
        }),
      ]);
    },
  });

  const queueTransactions = useMemo(
    () =>
      (reviewQueueQuery.data?.data ?? [])
        .filter((transaction) => transaction.amount < 0)
        .filter((transaction) => {
          if (showUncategorizedOnly && transaction.categoryId) {
            return false;
          }

          if (!deferredSearch) {
            return true;
          }

          const haystack = [
            transaction.merchantRaw,
            transaction.description,
            accountMap.get(transaction.accountId),
            transaction.categoryId ? categoryMap.get(transaction.categoryId)?.name : null,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return haystack.includes(deferredSearch);
        }),
    [accountMap, categoryMap, deferredSearch, reviewQueueQuery.data?.data, showUncategorizedOnly]
  );
  const flaggedTransactions = useMemo(
    () => (flaggedQuery.data?.data ?? []).filter((transaction) => transaction.amount < 0),
    [flaggedQuery.data?.data]
  );

  const uncategorizedCount = queueTransactions.filter(
    (transaction) => !transaction.categoryId
  ).length;
  const importedCount = queueTransactions.filter((transaction) => transaction.importBatchId).length;

  if (
    reviewQueueQuery.isLoading ||
    flaggedQuery.isLoading ||
    accountsQuery.isLoading ||
    categoriesQuery.isLoading
  ) {
    return <ExpensesReviewSkeleton />;
  }

  if (
    reviewQueueQuery.isError ||
    flaggedQuery.isError ||
    accountsQuery.isError ||
    categoriesQuery.isError
  ) {
    return (
      <div className="rounded-[2rem] border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-700">
        The review queue could not be loaded right now. Try refreshing once the ledger service is
        back online.
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
        <Card className="glass-panel panel-grid rise-in overflow-hidden border-0">
          <CardHeader className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.26em] text-primary-600">Spend</p>
              <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">
                Expense review queue
              </CardTitle>
              <CardDescription className="max-w-2xl text-base text-neutral-700 dark:text-neutral-300">
                Work through imported expenses, assign categories, flag the tricky rows, and attach
                receipts without leaving the queue.
              </CardDescription>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <Input
                className="lg:max-w-sm"
                placeholder="Search merchant, description, account, or category"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Button
                variant={showUncategorizedOnly ? "default" : "outline"}
                onClick={() => setShowUncategorizedOnly((current) => !current)}
              >
                {showUncategorizedOnly ? "Showing uncategorized only" : "Filter uncategorized"}
              </Button>
              <Button asChild variant="outline">
                <Link href="/transactions?status=unreviewed">Open full transactions workspace</Link>
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {queueTransactions.length ? (
              queueTransactions.map((transaction) => {
                const category = transaction.categoryId
                  ? (categoryMap.get(transaction.categoryId) ?? null)
                  : null;

                return (
                  <div
                    key={transaction.id}
                    className="rounded-[1.6rem] border border-neutral-200 bg-white/75 px-5 py-5"
                  >
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-lg font-semibold text-neutral-900">
                            {getTransactionLabel(transaction)}
                          </p>
                          {transaction.importBatchId ? (
                            <Badge variant="secondary">Imported</Badge>
                          ) : null}
                          {!transaction.categoryId ? (
                            <Badge variant="warning">Needs category</Badge>
                          ) : null}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-sm text-neutral-500">
                          <span>{formatLedgerDate(transaction.date)}</span>
                          <span>{accountMap.get(transaction.accountId) ?? "Unknown account"}</span>
                          <span>{transaction.reviewStatus}</span>
                        </div>
                        {transaction.description ? (
                          <p className="mt-3 text-sm text-neutral-600">{transaction.description}</p>
                        ) : null}
                      </div>
                      <p className="text-2xl font-semibold text-red-600">
                        {formatCurrency(transaction.amount)}
                      </p>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
                          Category
                        </p>
                        {canManageTransactions ? (
                          <Select
                            value={transaction.categoryId ?? "__none__"}
                            onValueChange={(value) =>
                              void updateMutation.mutateAsync({
                                categoryId: value === "__none__" ? null : value,
                                transactionId: transaction.id,
                              })
                            }
                          >
                            <SelectTrigger className="rounded-xl border-neutral-200 bg-white/90">
                              <SelectValue placeholder="Assign category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">No category</SelectItem>
                              {flatCategories.map((option) => (
                                <SelectItem key={option.id} value={option.id}>
                                  <span className="flex items-center gap-2">
                                    <span
                                      className="h-2.5 w-2.5 rounded-full"
                                      style={{ backgroundColor: option.color ?? "#cbd5e1" }}
                                    />
                                    <span>{option.label}</span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="flex min-h-11 items-center rounded-xl border border-neutral-200 bg-white/80 px-3 text-sm text-neutral-700">
                            {category ? category.name : "Uncategorized"}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {canManageTransactions ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                void reviewMutation.mutateAsync({
                                  status: "flagged",
                                  transactionId: transaction.id,
                                })
                              }
                            >
                              Flag
                            </Button>
                            <Button
                              size="sm"
                              onClick={() =>
                                void reviewMutation.mutateAsync({
                                  status: "reviewed",
                                  transactionId: transaction.id,
                                })
                              }
                            >
                              Mark reviewed
                            </Button>
                          </>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setReceiptTarget({
                              amount: transaction.amount,
                              date: transaction.date,
                              description: transaction.description ?? null,
                              id: transaction.id,
                              merchantRaw: transaction.merchantRaw ?? null,
                            })
                          }
                        >
                          Attach receipt
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-[1.8rem] border border-dashed border-neutral-300 bg-white/70 px-6 py-10 text-center">
                <p className="text-xl font-semibold text-neutral-900">Queue is clear</p>
                <p className="mt-2 text-sm text-neutral-600">
                  No unreviewed expense transactions match the current filter.
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <Button asChild>
                    <Link href="/transactions">Import or add transactions</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/reports">Open reports</Link>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="glass-panel border-0">
            <CardHeader className="space-y-2">
              <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                Queue
              </p>
              <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">
                {queueTransactions.length}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-neutral-700 dark:text-neutral-300">
              Unreviewed expense rows still waiting on a decision.
            </CardContent>
          </Card>

          <Card className="glass-panel border-0">
            <CardHeader className="space-y-2">
              <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                Needs category
              </p>
              <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">
                {uncategorizedCount}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-neutral-700 dark:text-neutral-300">
              Remaining uncategorized expenses in the active queue.
            </CardContent>
          </Card>

          <Card className="glass-panel border-0">
            <CardHeader className="space-y-2">
              <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                Imported
              </p>
              <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">
                {importedCount}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-neutral-700 dark:text-neutral-300">
              Queue items created by CSV imports and ready for cleanup.
            </CardContent>
          </Card>

          <Card className="glass-panel border-0">
            <CardHeader className="space-y-2">
              <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                Follow-up
              </p>
              <CardTitle className="text-2xl text-neutral-900 dark:text-neutral-50">
                Flagged items
              </CardTitle>
              <CardDescription className="text-sm text-neutral-700 dark:text-neutral-300">
                Deferred rows that need a second pass.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {flaggedTransactions.length ? (
                flaggedTransactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="rounded-[1.2rem] border border-neutral-200 bg-white/75 px-4 py-3"
                  >
                    <p className="font-medium text-neutral-900">
                      {getTransactionLabel(transaction)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-neutral-500">
                      <span>{formatLedgerDate(transaction.date)}</span>
                      <span>{formatCurrency(transaction.amount)}</span>
                    </div>
                    {canManageTransactions ? (
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void reviewMutation.mutateAsync({
                            status: "unreviewed",
                            transactionId: transaction.id,
                          })
                        }
                      >
                        Return to queue
                      </Button>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-[1.4rem] border border-dashed border-neutral-300 px-4 py-6 text-sm text-neutral-500">
                  No flagged expense rows right now.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <ReceiptUploadModal
          canLinkTransactions={canManageTransactions}
          initialTransaction={receiptTarget}
          isOpen={Boolean(receiptTarget)}
          onCompleted={() => {
            setToast({
              description: "The receipt was uploaded and linked to the transaction.",
              title: "Receipt attached",
            });
          }}
          onOpenChange={(open) => {
            if (!open) {
              setReceiptTarget(null);
            }
          }}
        />

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
