"use client";

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@wford26/ui";
import { useMemo, useRef } from "react";

import type { ReviewStatus } from "@wford26/shared-types";

export type TransactionTableCategoryOption = {
  color: string | null;
  id: string;
  label: string;
};

export type TransactionTableRow = {
  accountName: string;
  amount: number;
  categoryColor: string | null;
  categoryId: string | null;
  categoryName: string | null;
  date: string;
  description: string | null;
  id: string;
  importBatchId: string | null;
  merchantLabel: string;
  merchantRaw: string | null;
  reviewStatus: ReviewStatus;
};

const gridTemplateColumns =
  "44px minmax(108px,0.8fr) minmax(220px,1.7fr) minmax(150px,1fr) minmax(170px,1fr) minmax(118px,0.8fr) minmax(132px,0.95fr) 88px";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  style: "currency",
});

function formatLedgerDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

function getStatusVariant(status: ReviewStatus) {
  if (status === "reviewed") {
    return "success";
  }

  if (status === "flagged") {
    return "warning";
  }

  return "secondary";
}

function SortHeader({
  canSort,
  children,
  isSorted,
  onClick,
}: Readonly<{
  canSort: boolean;
  children: React.ReactNode;
  isSorted: false | "asc" | "desc";
  onClick: () => void;
}>) {
  if (!canSort) {
    return <span>{children}</span>;
  }

  return (
    <button
      className="inline-flex items-center gap-2 font-medium text-neutral-500 transition hover:text-neutral-900"
      type="button"
      onClick={onClick}
    >
      <span>{children}</span>
      <span className="text-xs text-neutral-400">
        {isSorted === "asc" ? "↑" : isSorted === "desc" ? "↓" : "↕"}
      </span>
    </button>
  );
}

export function TransactionsTable({
  canManageTransactions,
  categories,
  isLoading,
  onAssignCategory,
  onDelete,
  onReviewStatusChange,
  rowSelection,
  sorting,
  transactions,
  onRowSelectionChange,
  onSortingChange,
}: Readonly<{
  canManageTransactions: boolean;
  categories: TransactionTableCategoryOption[];
  isLoading: boolean;
  onAssignCategory: (transactionId: string, categoryId: string | null) => Promise<void> | void;
  onDelete: (transactionId: string) => void;
  onReviewStatusChange: (transactionId: string, status: ReviewStatus) => Promise<void> | void;
  rowSelection: RowSelectionState;
  sorting: SortingState;
  transactions: TransactionTableRow[];
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  onSortingChange: OnChangeFn<SortingState>;
}>) {
  const columns = useMemo<ColumnDef<TransactionTableRow>[]>(
    () => [
      {
        cell: ({ row }) => (
          <input
            aria-label={`Select ${row.original.merchantLabel}`}
            checked={row.getIsSelected()}
            className="h-4 w-4 rounded border-neutral-300"
            type="checkbox"
            onChange={row.getToggleSelectedHandler()}
          />
        ),
        enableSorting: false,
        header: ({ table }) => (
          <input
            aria-label="Select current page"
            checked={table.getIsAllPageRowsSelected()}
            className="h-4 w-4 rounded border-neutral-300"
            type="checkbox"
            onChange={table.getToggleAllPageRowsSelectedHandler()}
          />
        ),
        id: "select",
      },
      {
        accessorKey: "date",
        header: "Date",
      },
      {
        accessorFn: (row) => row.merchantLabel,
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-neutral-900">{row.original.merchantLabel}</p>
            <p className="mt-1 truncate text-xs text-neutral-500">
              {row.original.description ?? "No note"}
            </p>
          </div>
        ),
        header: "Merchant / Description",
        id: "merchant",
      },
      {
        accessorKey: "accountName",
        header: "Account",
      },
      {
        accessorFn: (row) => row.categoryName ?? "",
        cell: ({ row }) =>
          canManageTransactions ? (
            <Select
              value={row.original.categoryId ?? "__none__"}
              onValueChange={(value) =>
                void onAssignCategory(row.original.id, value === "__none__" ? null : value)
              }
            >
              <SelectTrigger className="h-9 rounded-xl border-neutral-200 bg-white/90 text-xs">
                <SelectValue placeholder="Assign category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No category</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: category.color ?? "#cbd5e1" }}
                      />
                      <span>{category.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : row.original.categoryName ? (
            <div className="flex items-center gap-2 text-sm text-neutral-700">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: row.original.categoryColor ?? "#cbd5e1" }}
              />
              <span>{row.original.categoryName}</span>
            </div>
          ) : (
            <span className="text-sm text-neutral-400">Uncategorized</span>
          ),
        header: "Category",
        id: "category",
      },
      {
        accessorKey: "amount",
        cell: ({ row }) => (
          <span
            className={cn(
              "font-semibold",
              row.original.amount < 0 ? "text-red-600" : "text-emerald-700"
            )}
          >
            {currencyFormatter.format(row.original.amount)}
          </span>
        ),
        header: "Amount",
      },
      {
        accessorKey: "reviewStatus",
        cell: ({ row }) =>
          canManageTransactions ? (
            <Select
              value={row.original.reviewStatus}
              onValueChange={(value) =>
                void onReviewStatusChange(row.original.id, value as ReviewStatus)
              }
            >
              <SelectTrigger className="h-9 rounded-xl border-neutral-200 bg-white/90 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unreviewed">Unreviewed</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="flagged">Flagged</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <Badge variant={getStatusVariant(row.original.reviewStatus)}>
              {row.original.reviewStatus}
            </Badge>
          ),
        header: "Status",
      },
      {
        cell: ({ row }) =>
          canManageTransactions ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-9 rounded-xl px-3 text-xs" size="sm" variant="outline">
                  Actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => void onReviewStatusChange(row.original.id, "reviewed")}
                >
                  Mark reviewed
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void onReviewStatusChange(row.original.id, "flagged")}
                >
                  Flag for follow-up
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void onReviewStatusChange(row.original.id, "unreviewed")}
                >
                  Move back to unreviewed
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-600"
                  onClick={() => onDelete(row.original.id)}
                >
                  Delete transaction
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="text-xs text-neutral-400">Read only</span>
          ),
        enableSorting: false,
        header: "Actions",
        id: "actions",
      },
    ],
    [canManageTransactions, categories, onAssignCategory, onDelete, onReviewStatusChange]
  );

  const table = useReactTable({
    columns,
    data: transactions,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    getSortedRowModel: getSortedRowModel(),
    onRowSelectionChange,
    onSortingChange,
    state: {
      rowSelection,
      sorting,
    },
  });

  const rows = table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => 86,
    getScrollElement: () => scrollRef.current,
    overscan: 8,
  });

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-neutral-200/70 bg-white/80 p-6 text-sm text-neutral-600">
        Loading transactions...
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-neutral-300 bg-white/75 p-10 text-center">
        <p className="text-lg font-semibold text-neutral-900">No transactions found</p>
        <p className="mt-2 text-sm text-neutral-600">
          Adjust the filters, import a CSV, or create a transaction to start filling the ledger.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[2rem] border border-neutral-200/80 bg-white/85 shadow-sm">
      <div
        className="grid items-center gap-3 border-b border-neutral-200/80 bg-neutral-50/90 px-4 py-3 text-xs uppercase tracking-[0.18em] text-neutral-500"
        style={{ gridTemplateColumns }}
      >
        {table.getFlatHeaders().map((header) => {
          const isSorted = header.column.getIsSorted();

          return (
            <div key={header.id} className={header.id === "actions" ? "text-right" : ""}>
              {header.isPlaceholder ? null : (
                <SortHeader
                  canSort={header.column.getCanSort()}
                  isSorted={isSorted}
                  onClick={header.column.getToggleSortingHandler() as () => void}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </SortHeader>
              )}
            </div>
          );
        })}
      </div>

      <div ref={scrollRef} className="max-h-[620px] overflow-auto">
        <div
          className="relative"
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];

            if (!row) {
              return null;
            }

            return (
              <div
                key={row.id}
                className="absolute left-0 top-0 w-full px-3"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div
                  className={cn(
                    "grid items-center gap-3 rounded-[1.4rem] border border-transparent px-1 py-2",
                    row.getIsSelected() ? "bg-primary-50/75" : "bg-transparent"
                  )}
                  style={{ gridTemplateColumns }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <div
                      key={cell.id}
                      className={cell.column.id === "actions" ? "flex justify-end" : ""}
                    >
                      {cell.column.id === "date" ? (
                        <span className="text-sm font-medium text-neutral-800">
                          {formatLedgerDate(row.original.date)}
                        </span>
                      ) : (
                        flexRender(cell.column.columnDef.cell, cell.getContext())
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
