"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type RowSelectionState, type SortingState } from "@tanstack/react-table";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
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
import {
  usePathname,
  useRouter,
  useSearchParams,
  type ReadonlyURLSearchParams,
} from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../../contexts/auth-context";
import { ApiClientError, apiClient } from "../../lib/api-client";
import {
  ReceiptUploadModal,
  type ReceiptUploadModalTransaction,
} from "../documents/receipt-upload-modal";

import { ImportTransactionsModal } from "./import-transactions-modal";
import { TransactionForm } from "./transaction-form";
import { TransactionsTable, type TransactionTableRow } from "./transactions-table";

import type {
  Account,
  CategoryTreeNode,
  ImportBatchDetail,
  ReviewStatus,
  Role,
  Transaction,
  TransactionListResponse,
} from "@wford26/shared-types";

type ToastState = {
  description: string;
  title: string;
};

type TransactionSearchState = {
  accountId: string;
  amountMax: string;
  amountMin: string;
  categoryId: string;
  dateFrom: string;
  dateTo: string;
  limit: number;
  page: number;
  q: string;
  sort: string;
  status: "all" | ReviewStatus;
};

type TransactionFilterDraft = Omit<TransactionSearchState, "page" | "sort">;

type FlatCategoryOption = {
  color: string | null;
  id: string;
  label: string;
  name: string;
};

const mutationRoles: Role[] = ["owner", "admin", "accountant"];
const defaultSearchState: TransactionSearchState = {
  accountId: "",
  amountMax: "",
  amountMin: "",
  categoryId: "",
  dateFrom: "",
  dateTo: "",
  limit: 50,
  page: 1,
  q: "",
  sort: "date:desc",
  status: "all",
};

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

function parsePositiveInteger(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
}

function parseSearchState(searchParams: ReadonlyURLSearchParams): TransactionSearchState {
  const status = searchParams.get("status");
  const normalizedStatus =
    status === "reviewed" || status === "flagged" || status === "unreviewed" ? status : "all";

  return {
    accountId: searchParams.get("accountId") ?? "",
    amountMax: searchParams.get("amountMax") ?? "",
    amountMin: searchParams.get("amountMin") ?? "",
    categoryId: searchParams.get("categoryId") ?? "",
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
    limit: parsePositiveInteger(searchParams.get("limit"), 50),
    page: parsePositiveInteger(searchParams.get("page"), 1),
    q: searchParams.get("q") ?? "",
    sort: searchParams.get("sort") ?? "date:desc",
    status: normalizedStatus,
  };
}

function buildUrlSearchParams(state: TransactionSearchState) {
  const params = new URLSearchParams();

  if (state.accountId) {
    params.set("accountId", state.accountId);
  }

  if (state.amountMax) {
    params.set("amountMax", state.amountMax);
  }

  if (state.amountMin) {
    params.set("amountMin", state.amountMin);
  }

  if (state.categoryId) {
    params.set("categoryId", state.categoryId);
  }

  if (state.dateFrom) {
    params.set("dateFrom", state.dateFrom);
  }

  if (state.dateTo) {
    params.set("dateTo", state.dateTo);
  }

  if (state.limit !== 50) {
    params.set("limit", String(state.limit));
  }

  if (state.page !== 1) {
    params.set("page", String(state.page));
  }

  if (state.q) {
    params.set("q", state.q);
  }

  if (state.sort !== "date:desc") {
    params.set("sort", state.sort);
  }

  if (state.status !== "all") {
    params.set("status", state.status);
  }

  return params;
}

function buildTransactionsQueryString(state: TransactionSearchState) {
  const params = new URLSearchParams();

  params.set("limit", String(Math.min(state.limit, 100)));
  params.set("page", String(state.page));

  if (state.accountId) {
    params.set("accountId", state.accountId);
  }

  if (state.amountMax) {
    params.set("amountMax", state.amountMax);
  }

  if (state.amountMin) {
    params.set("amountMin", state.amountMin);
  }

  if (state.categoryId) {
    params.set("categoryId", state.categoryId);
  }

  if (state.dateFrom) {
    params.set("dateFrom", state.dateFrom);
  }

  if (state.dateTo) {
    params.set("dateTo", state.dateTo);
  }

  if (state.q) {
    params.set("q", state.q);
  }

  if (state.status !== "all") {
    params.set("status", state.status);
  }

  return params.toString();
}

function parseSorting(sortValue: string): SortingState {
  const [id, direction] = sortValue.split(":");

  if (!id) {
    return [{ desc: true, id: "date" }];
  }

  return [{ desc: direction !== "asc", id }];
}

function stringifySorting(sorting: SortingState) {
  const first = sorting[0];

  if (!first) {
    return "date:desc";
  }

  return `${first.id}:${first.desc ? "desc" : "asc"}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value);
}

function buildMutationErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return fallback;
}

function buildRecentCategoriesKey(organizationId: string) {
  return `abacus.recent-categories.${organizationId}`;
}

export function TransactionsPage() {
  const queryClient = useQueryClient();
  const { organization, organizations } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const currentSearchState = useMemo(() => parseSearchState(searchParams), [searchParams]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteTransactionId, setDeleteTransactionId] = useState<string | null>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [receiptTarget, setReceiptTarget] = useState<ReceiptUploadModalTransaction | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [toast, setToast] = useState<ToastState | null>(null);
  const [recentCategoryIds, setRecentCategoryIds] = useState<string[]>([]);
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("");
  const [sorting, setSorting] = useState<SortingState>(() => parseSorting(currentSearchState.sort));
  const [filterDraft, setFilterDraft] = useState<TransactionFilterDraft>({
    accountId: currentSearchState.accountId,
    amountMax: currentSearchState.amountMax,
    amountMin: currentSearchState.amountMin,
    categoryId: currentSearchState.categoryId,
    dateFrom: currentSearchState.dateFrom,
    dateTo: currentSearchState.dateTo,
    limit: currentSearchState.limit,
    q: currentSearchState.q,
    status: currentSearchState.status,
  });

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

  useEffect(() => {
    setFilterDraft({
      accountId: currentSearchState.accountId,
      amountMax: currentSearchState.amountMax,
      amountMin: currentSearchState.amountMin,
      categoryId: currentSearchState.categoryId,
      dateFrom: currentSearchState.dateFrom,
      dateTo: currentSearchState.dateTo,
      limit: currentSearchState.limit,
      q: currentSearchState.q,
      status: currentSearchState.status,
    });
    setSorting(parseSorting(currentSearchState.sort));
  }, [searchKey, currentSearchState]);

  useEffect(() => {
    if (!organization?.id || typeof window === "undefined") {
      setRecentCategoryIds([]);
      return;
    }

    try {
      const stored = window.localStorage.getItem(buildRecentCategoriesKey(organization.id));
      const parsed = stored ? (JSON.parse(stored) as string[]) : [];
      setRecentCategoryIds(Array.isArray(parsed) ? parsed : []);
    } catch {
      setRecentCategoryIds([]);
    }
  }, [organization?.id]);

  const accountsQueryKey = useMemo(
    () => ["transactions-accounts", organization?.id ?? "unknown"],
    [organization?.id]
  );
  const categoriesQueryKey = useMemo(
    () => ["transactions-categories", organization?.id ?? "unknown"],
    [organization?.id]
  );
  const transactionsQueryKey = useMemo(
    () => [
      "transactions-page",
      organization?.id ?? "unknown",
      buildTransactionsQueryString(currentSearchState),
    ],
    [currentSearchState, organization?.id]
  );

  const accountsQuery = useQuery({
    enabled: Boolean(organization?.id),
    queryFn: () => apiClient<Account[]>("/accounts"),
    queryKey: accountsQueryKey,
  });
  const categoriesQuery = useQuery({
    enabled: Boolean(organization?.id),
    queryFn: () => apiClient<CategoryTreeNode[]>("/categories"),
    queryKey: categoriesQueryKey,
  });
  const transactionsQuery = useQuery({
    enabled: Boolean(organization?.id),
    placeholderData: (previousData) => previousData,
    queryFn: () =>
      apiClient<TransactionListResponse>(
        `/transactions?${buildTransactionsQueryString(currentSearchState)}`
      ),
    queryKey: transactionsQueryKey,
  });

  const accounts = accountsQuery.data ?? [];
  const flatCategories = useMemo(
    () => flattenCategories(categoriesQuery.data ?? []),
    [categoriesQuery.data]
  );

  const orderedCategories = useMemo(() => {
    const indexMap = new Map(recentCategoryIds.map((categoryId, index) => [categoryId, index]));

    return [...flatCategories].sort((left, right) => {
      const leftIndex = indexMap.get(left.id);
      const rightIndex = indexMap.get(right.id);

      if (leftIndex !== undefined || rightIndex !== undefined) {
        if (leftIndex === undefined) {
          return 1;
        }

        if (rightIndex === undefined) {
          return -1;
        }

        if (leftIndex !== rightIndex) {
          return leftIndex - rightIndex;
        }
      }

      return left.name.localeCompare(right.name);
    });
  }, [flatCategories, recentCategoryIds]);

  const accountOptions = useMemo(
    () =>
      accounts.map((account) => ({
        id: account.id,
        label: account.name,
      })),
    [accounts]
  );
  const categoryOptions = useMemo(
    () =>
      orderedCategories.map((category) => ({
        color: category.color,
        id: category.id,
        label: category.label,
      })),
    [orderedCategories]
  );

  const accountMap = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts]
  );
  const categoryMap = useMemo(
    () => new Map(flatCategories.map((category) => [category.id, category])),
    [flatCategories]
  );

  const transactions = transactionsQuery.data?.data ?? [];
  const transactionRows = useMemo<TransactionTableRow[]>(
    () =>
      transactions.map((transaction) => {
        const category = transaction.categoryId
          ? (categoryMap.get(transaction.categoryId) ?? null)
          : null;

        return {
          accountName: accountMap.get(transaction.accountId)?.name ?? "Unknown account",
          amount: transaction.amount,
          categoryColor: category?.color ?? null,
          categoryId: transaction.categoryId ?? null,
          categoryName: category?.name ?? null,
          date: transaction.date,
          description: transaction.description ?? null,
          id: transaction.id,
          importBatchId: transaction.importBatchId ?? null,
          merchantLabel:
            transaction.merchantRaw ?? transaction.description ?? "Untitled transaction",
          merchantRaw: transaction.merchantRaw ?? null,
          reviewStatus: transaction.reviewStatus,
        };
      }),
    [accountMap, categoryMap, transactions]
  );

  useEffect(() => {
    const visibleIds = new Set(transactionRows.map((transaction) => transaction.id));

    setRowSelection((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([transactionId]) => visibleIds.has(transactionId))
      )
    );
  }, [transactionRows]);

  const selectedTransactionIds = useMemo(
    () =>
      Object.entries(rowSelection)
        .filter(([, selected]) => selected)
        .map(([transactionId]) => transactionId),
    [rowSelection]
  );

  function rememberRecentCategory(categoryId: string | null) {
    if (!categoryId || !organization?.id || typeof window === "undefined") {
      return;
    }

    setRecentCategoryIds((current) => {
      const next = [categoryId, ...current.filter((id) => id !== categoryId)].slice(0, 8);
      window.localStorage.setItem(buildRecentCategoriesKey(organization.id), JSON.stringify(next));
      return next;
    });
  }

  function pushSearchState(nextState: TransactionSearchState, replace = false) {
    const nextParams = buildUrlSearchParams(nextState);
    const nextUrl = nextParams.toString() ? `${pathname}?${nextParams.toString()}` : pathname;

    if (replace) {
      router.replace(nextUrl);
      return;
    }

    router.push(nextUrl);
  }

  const createMutation = useMutation({
    mutationFn: async (values: {
      accountId: string;
      amount: number;
      categoryId: string | null;
      date: string;
      description: string | null;
      merchantRaw: string | null;
    }) =>
      apiClient<Transaction>("/transactions", {
        body: values,
        method: "POST",
      }),
    onError: (error) => {
      setToast({
        description: buildMutationErrorMessage(error, "Unable to create transaction"),
        title: "Transaction not created",
      });
    },
    onSuccess: (_transaction, variables) => {
      setCreateDialogOpen(false);
      rememberRecentCategory(variables.categoryId);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: transactionsQueryKey,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: { transactionId: string; categoryId?: string | null }) =>
      apiClient<Transaction>(`/transactions/${input.transactionId}`, {
        body: {
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        },
        method: "PATCH",
      }),
    onError: (error) => {
      setToast({
        description: buildMutationErrorMessage(error, "Unable to update transaction"),
        title: "Transaction not updated",
      });
    },
    onSuccess: (_transaction, variables) => {
      rememberRecentCategory(variables.categoryId ?? null);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: transactionsQueryKey,
      });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async (input: { transactionId: string; status: ReviewStatus }) =>
      apiClient<Transaction>(`/transactions/${input.transactionId}/review`, {
        body: {
          status: input.status,
        },
        method: "POST",
      }),
    onError: (error) => {
      setToast({
        description: buildMutationErrorMessage(error, "Unable to update review status"),
        title: "Review status not updated",
      });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: transactionsQueryKey,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (transactionId: string) =>
      apiClient<{ deleted: true }>(`/transactions/${transactionId}`, {
        method: "DELETE",
      }),
    onError: (error) => {
      setToast({
        description: buildMutationErrorMessage(error, "Unable to delete transaction"),
        title: "Delete failed",
      });
    },
    onSuccess: () => {
      setDeleteTransactionId(null);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: transactionsQueryKey,
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (input: { accountId: string; file: File }) => {
      const body = new FormData();
      body.set("accountId", input.accountId);
      body.set("file", input.file);

      return apiClient<ImportBatchDetail>("/transactions/import/csv", {
        body,
        method: "POST",
      });
    },
    onError: (error) => {
      setToast({
        description: buildMutationErrorMessage(error, "Unable to import CSV"),
        title: "Import failed",
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: transactionsQueryKey,
      });
    },
  });

  const bulkCategorizeMutation = useMutation({
    mutationFn: async (input: { categoryId: string | null; transactionIds: string[] }) => {
      await Promise.all(
        input.transactionIds.map((transactionId) =>
          apiClient<Transaction>(`/transactions/${transactionId}`, {
            body: {
              categoryId: input.categoryId,
            },
            method: "PATCH",
          })
        )
      );
    },
    onError: (error) => {
      setToast({
        description: buildMutationErrorMessage(error, "Unable to bulk categorize transactions"),
        title: "Bulk update failed",
      });
    },
    onSuccess: (_result, variables) => {
      setRowSelection({});
      setBulkCategoryId("");
      rememberRecentCategory(variables.categoryId);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: transactionsQueryKey,
      });
    },
  });

  const pageMeta = transactionsQuery.data?.meta ?? {
    hasMore: false,
    limit: currentSearchState.limit,
    page: currentSearchState.page,
    total: transactionRows.length,
  };
  const unreviewedCount = transactionRows.filter(
    (transaction) => transaction.reviewStatus === "unreviewed"
  ).length;
  const flaggedCount = transactionRows.filter(
    (transaction) => transaction.reviewStatus === "flagged"
  ).length;
  const currentPageTotal = transactionRows.reduce(
    (sum, transaction) => sum + transaction.amount,
    0
  );

  function applyFilters() {
    pushSearchState(
      {
        ...currentSearchState,
        ...filterDraft,
        page: 1,
      },
      false
    );
  }

  function resetFilters() {
    setFilterDraft({
      accountId: "",
      amountMax: "",
      amountMin: "",
      categoryId: "",
      dateFrom: "",
      dateTo: "",
      limit: 50,
      q: "",
      status: "all",
    });

    pushSearchState(defaultSearchState, false);
  }

  async function handleAssignCategory(transactionId: string, categoryId: string | null) {
    await updateMutation.mutateAsync({
      categoryId,
      transactionId,
    });
  }

  async function handleReviewStatusChange(transactionId: string, status: ReviewStatus) {
    await reviewMutation.mutateAsync({
      status,
      transactionId,
    });
  }

  return (
    <ToastProvider>
      <div className="grid gap-4 xl:grid-cols-[1.68fr_0.72fr]">
        <Card className="glass-panel panel-grid rise-in overflow-hidden border-0">
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.26em] text-primary-600">Ledger</p>
              <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">
                Transactions
              </CardTitle>
              <CardDescription className="max-w-2xl text-base text-neutral-700 dark:text-neutral-300">
                Review ledger activity, route categories inline, and keep import cleanup moving from
                one primary workspace.
              </CardDescription>
            </div>
            {canManageTransactions ? (
              <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
                <Button
                  className="w-full md:w-auto"
                  variant="outline"
                  onClick={() => setImportDialogOpen(true)}
                >
                  Import CSV
                </Button>
                <Button className="w-full md:w-auto" onClick={() => setCreateDialogOpen(true)}>
                  Add transaction
                </Button>
              </div>
            ) : null}
          </CardHeader>

          <CardContent className="space-y-4">
            <details
              className="rounded-[1.8rem] border border-neutral-200/80 bg-white/70 px-5 py-4"
              open
            >
              <summary className="cursor-pointer list-none text-sm font-semibold text-neutral-900">
                Filters
              </summary>
              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <div className="space-y-2 lg:col-span-3">
                  <Label htmlFor="transaction-search">Search</Label>
                  <Input
                    id="transaction-search"
                    placeholder="Search merchant or description"
                    value={filterDraft.q}
                    onChange={(event) =>
                      setFilterDraft((current) => ({
                        ...current,
                        q: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transaction-filter-account">Account</Label>
                  <Select
                    value={filterDraft.accountId || "__all__"}
                    onValueChange={(value) =>
                      setFilterDraft((current) => ({
                        ...current,
                        accountId: value === "__all__" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger id="transaction-filter-account">
                      <SelectValue placeholder="All accounts" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All accounts</SelectItem>
                      {accountOptions.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transaction-filter-category">Category</Label>
                  <Select
                    value={filterDraft.categoryId || "__all__"}
                    onValueChange={(value) =>
                      setFilterDraft((current) => ({
                        ...current,
                        categoryId: value === "__all__" ? "" : value,
                      }))
                    }
                  >
                    <SelectTrigger id="transaction-filter-category">
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All categories</SelectItem>
                      {categoryOptions.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transaction-filter-status">Review status</Label>
                  <Select
                    value={filterDraft.status}
                    onValueChange={(value) =>
                      setFilterDraft((current) => ({
                        ...current,
                        status: value as TransactionFilterDraft["status"],
                      }))
                    }
                  >
                    <SelectTrigger id="transaction-filter-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="unreviewed">Unreviewed</SelectItem>
                      <SelectItem value="reviewed">Reviewed</SelectItem>
                      <SelectItem value="flagged">Flagged</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transaction-filter-date-from">Date from</Label>
                  <Input
                    id="transaction-filter-date-from"
                    type="date"
                    value={filterDraft.dateFrom}
                    onChange={(event) =>
                      setFilterDraft((current) => ({
                        ...current,
                        dateFrom: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transaction-filter-date-to">Date to</Label>
                  <Input
                    id="transaction-filter-date-to"
                    type="date"
                    value={filterDraft.dateTo}
                    onChange={(event) =>
                      setFilterDraft((current) => ({
                        ...current,
                        dateTo: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transaction-filter-limit">Rows per page</Label>
                  <Select
                    value={String(filterDraft.limit)}
                    onValueChange={(value) =>
                      setFilterDraft((current) => ({
                        ...current,
                        limit: Number(value),
                      }))
                    }
                  >
                    <SelectTrigger id="transaction-filter-limit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transaction-filter-amount-min">Amount min</Label>
                  <Input
                    id="transaction-filter-amount-min"
                    inputMode="decimal"
                    placeholder="-500.00"
                    value={filterDraft.amountMin}
                    onChange={(event) =>
                      setFilterDraft((current) => ({
                        ...current,
                        amountMin: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="transaction-filter-amount-max">Amount max</Label>
                  <Input
                    id="transaction-filter-amount-max"
                    inputMode="decimal"
                    placeholder="500.00"
                    value={filterDraft.amountMax}
                    onChange={(event) =>
                      setFilterDraft((current) => ({
                        ...current,
                        amountMax: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      pushSearchState(
                        {
                          ...currentSearchState,
                          ...filterDraft,
                          limit: 100,
                          page: 1,
                          status: "unreviewed",
                        },
                        false
                      )
                    }
                  >
                    Review queue
                  </Button>
                  <Button type="button" variant="ghost" onClick={resetFilters}>
                    Reset
                  </Button>
                </div>

                <Button type="button" onClick={applyFilters}>
                  Apply filters
                </Button>
              </div>
            </details>

            {selectedTransactionIds.length > 0 && canManageTransactions ? (
              <div className="flex flex-col gap-3 rounded-[1.8rem] border border-primary-200 bg-primary-50/80 px-4 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-primary-900">
                    {selectedTransactionIds.length} row
                    {selectedTransactionIds.length === 1 ? "" : "s"} selected
                  </p>
                  <p className="text-sm text-primary-700">
                    Assign one category to the current selection in a single pass.
                  </p>
                </div>

                <div className="flex flex-col gap-2 md:flex-row md:items-center">
                  <Select
                    value={bulkCategoryId || "__none__"}
                    onValueChange={(value) => setBulkCategoryId(value === "__none__" ? "" : value)}
                  >
                    <SelectTrigger className="min-w-[240px] bg-white">
                      <SelectValue placeholder="Choose a bulk category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Clear category</SelectItem>
                      {categoryOptions.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    disabled={bulkCategorizeMutation.isPending}
                    onClick={() =>
                      void bulkCategorizeMutation.mutateAsync({
                        categoryId: bulkCategoryId || null,
                        transactionIds: selectedTransactionIds,
                      })
                    }
                  >
                    {bulkCategorizeMutation.isPending ? "Applying..." : "Apply to selected"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setRowSelection({})}>
                    Clear selection
                  </Button>
                </div>
              </div>
            ) : null}

            {transactionsQuery.isError ? (
              <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                Unable to load transactions right now. Double-check the selected filters and try
                again.
              </div>
            ) : null}

            <TransactionsTable
              canManageTransactions={canManageTransactions}
              categories={categoryOptions}
              isLoading={
                transactionsQuery.isLoading || accountsQuery.isLoading || categoriesQuery.isLoading
              }
              rowSelection={rowSelection}
              sorting={sorting}
              transactions={transactionRows}
              onAssignCategory={handleAssignCategory}
              onAttachReceipt={(transaction) =>
                setReceiptTarget({
                  amount: transaction.amount,
                  date: transaction.date,
                  description: transaction.description,
                  id: transaction.id,
                  merchantRaw: transaction.merchantRaw,
                })
              }
              onDelete={(transactionId) => setDeleteTransactionId(transactionId)}
              onReviewStatusChange={handleReviewStatusChange}
              onRowSelectionChange={setRowSelection}
              onSortingChange={(updater) => {
                const nextSorting = typeof updater === "function" ? updater(sorting) : updater;
                const normalized = nextSorting.slice(0, 1);
                setSorting(normalized);
                pushSearchState(
                  {
                    ...currentSearchState,
                    sort: stringifySorting(normalized),
                  },
                  true
                );
              }}
            />

            <div className="flex flex-col gap-3 rounded-[1.8rem] border border-neutral-200/80 bg-white/70 px-4 py-4 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-neutral-700">
                Page {pageMeta.page} of {Math.max(1, Math.ceil(pageMeta.total / pageMeta.limit))}{" "}
                with <span className="font-semibold text-neutral-900">{pageMeta.total}</span> total
                transactions.
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={pageMeta.page <= 1}
                  variant="outline"
                  onClick={() =>
                    pushSearchState(
                      {
                        ...currentSearchState,
                        page: Math.max(1, currentSearchState.page - 1),
                      },
                      false
                    )
                  }
                >
                  Previous
                </Button>
                <Button
                  disabled={!pageMeta.hasMore}
                  variant="outline"
                  onClick={() =>
                    pushSearchState(
                      {
                        ...currentSearchState,
                        page: currentSearchState.page + 1,
                      },
                      false
                    )
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="glass-panel rise-in border-0">
            <CardHeader>
              <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                Snapshot
              </p>
              <CardTitle className="text-xl text-neutral-900 dark:text-neutral-50">
                Current page health
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-neutral-700 dark:text-neutral-300">
              <div className="rounded-3xl border border-neutral-200 bg-white/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Visible total</p>
                <p className="mt-2 text-2xl font-semibold text-neutral-900">
                  {formatCurrency(currentPageTotal)}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-3xl border border-neutral-200 bg-white/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Unreviewed</p>
                  <p className="mt-2 text-2xl font-semibold text-neutral-900">{unreviewedCount}</p>
                </div>
                <div className="rounded-3xl border border-neutral-200 bg-white/80 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Flagged</p>
                  <p className="mt-2 text-2xl font-semibold text-neutral-900">{flaggedCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel rise-in border-0">
            <CardHeader>
              <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                Workflow
              </p>
              <CardTitle className="text-xl text-neutral-900 dark:text-neutral-50">
                Routing patterns
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
              <p>
                Recently used categories float to the top of inline assignment lists so repetitive
                cleanup gets faster as you review a batch.
              </p>
              <p>
                Filter state stays in the URL, which makes paging, reloads, and direct links to a
                review queue much less fragile.
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{currentSearchState.status}</Badge>
                <Badge variant="secondary">{currentSearchState.limit} rows / page</Badge>
                <Badge variant="secondary">{stringifySorting(sorting)}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add transaction</DialogTitle>
            <DialogDescription>
              Capture a transaction directly when it does not arrive through CSV import.
            </DialogDescription>
          </DialogHeader>
          <TransactionForm
            accounts={accountOptions}
            categories={categoryOptions.map((category) => ({
              id: category.id,
              label: category.label,
            }))}
            isSubmitting={createMutation.isPending}
            onCancel={() => setCreateDialogOpen(false)}
            onSubmit={async (values) => {
              await createMutation.mutateAsync(values);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTransactionId)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTransactionId(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete transaction</DialogTitle>
            <DialogDescription>
              Remove this transaction from the active ledger view. The underlying record will be
              soft-deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteTransactionId(null)}>
              Cancel
            </Button>
            <Button
              disabled={deleteMutation.isPending || !deleteTransactionId}
              variant="destructive"
              onClick={() => {
                if (!deleteTransactionId) {
                  return;
                }

                void deleteMutation.mutateAsync(deleteTransactionId);
              }}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete transaction"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ImportTransactionsModal
        accounts={accountOptions}
        isOpen={importDialogOpen}
        onImport={(input) => importMutation.mutateAsync(input)}
        onOpenChange={setImportDialogOpen}
      />

      <ReceiptUploadModal
        canLinkTransactions={canManageTransactions}
        initialTransaction={receiptTarget}
        isOpen={Boolean(receiptTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setReceiptTarget(null);
          }
        }}
      />

      {toast ? (
        <Toast
          duration={4000}
          open={Boolean(toast)}
          onOpenChange={(open) => {
            if (!open) {
              setToast(null);
            }
          }}
        >
          <div>
            <ToastTitle>{toast.title}</ToastTitle>
            <ToastDescription>{toast.description}</ToastDescription>
          </div>
        </Toast>
      ) : null}
      <ToastViewport />
    </ToastProvider>
  );
}
