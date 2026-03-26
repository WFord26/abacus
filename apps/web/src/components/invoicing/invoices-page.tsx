"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wford26/ui";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useAuth } from "../../contexts/auth-context";
import { apiClient } from "../../lib/api-client";

import { InvoiceStatusBadge } from "./invoice-status-badge";
import { formatCurrency, formatDisplayDate } from "./invoicing-utils";

import type { CustomerListItem, Invoice, InvoiceStatus, Role } from "@wford26/shared-types";

const mutationRoles: Role[] = ["owner", "admin", "accountant"];

function InvoicesPageSkeleton() {
  return (
    <Card className="glass-panel border-0">
      <CardHeader className="space-y-3">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-10 w-56" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </CardContent>
    </Card>
  );
}

export function InvoicesPage() {
  const { organization, organizations } = useAuth();
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");

  const activeRole = useMemo(
    () =>
      organizations.find((membership) => membership.organization.id === organization?.id)?.role ??
      null,
    [organization?.id, organizations]
  );
  const canManageInvoices = useMemo(
    () => (activeRole ? mutationRoles.includes(activeRole) : false),
    [activeRole]
  );
  const customersQuery = useQuery({
    enabled: Boolean(organization?.id),
    queryFn: () => apiClient<CustomerListItem[]>("/customers"),
    queryKey: ["invoices-customers", organization?.id ?? "unknown"],
  });
  const invoicesQuery = useQuery({
    enabled: Boolean(organization?.id),
    queryFn: () =>
      apiClient<Invoice[]>(
        `/invoices${
          statusFilter !== "all" || customerFilter !== "all"
            ? `?${new URLSearchParams({
                ...(statusFilter !== "all" ? { status: statusFilter } : {}),
                ...(customerFilter !== "all" ? { customerId: customerFilter } : {}),
              }).toString()}`
            : ""
        }`
      ),
    queryKey: ["invoices-page", organization?.id ?? "unknown", statusFilter, customerFilter],
  });

  const customerMap = useMemo(
    () =>
      new Map((customersQuery.data ?? []).map((customer) => [customer.id, customer.name] as const)),
    [customersQuery.data]
  );

  const totals = useMemo(() => {
    const invoices = invoicesQuery.data ?? [];

    return {
      draft: invoices.filter((invoice) => invoice.status === "draft").length,
      openAmount: invoices
        .filter((invoice) => invoice.status === "sent")
        .reduce((sum, invoice) => sum + invoice.total, 0),
      paidAmount: invoices
        .filter((invoice) => invoice.status === "paid")
        .reduce((sum, invoice) => sum + invoice.total, 0),
    };
  }, [invoicesQuery.data]);

  if (invoicesQuery.isLoading && customersQuery.isLoading) {
    return <InvoicesPageSkeleton />;
  }

  const invoices = invoicesQuery.data ?? [];

  return (
    <div className="grid gap-4">
      <Card className="glass-panel panel-grid rise-in overflow-hidden border-0">
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.26em] text-primary-600">Billing</p>
            <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">
              Invoices
            </CardTitle>
            <CardDescription className="max-w-2xl text-base text-neutral-700 dark:text-neutral-300">
              Track invoice status across draft, sent, paid, and voided states without leaving the
              authenticated shell.
            </CardDescription>
          </div>
          {canManageInvoices ? (
            <Button asChild className="w-full md:w-auto">
              <Link href="/invoices/new">New invoice</Link>
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/45">
            <p className="text-xs uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
              Draft invoices
            </p>
            <p className="mt-3 text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
              {totals.draft}
            </p>
          </div>
          <div className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/45">
            <p className="text-xs uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
              Awaiting payment
            </p>
            <p className="mt-3 text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
              {formatCurrency(totals.openAmount)}
            </p>
          </div>
          <div className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/45">
            <p className="text-xs uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
              Paid volume
            </p>
            <p className="mt-3 text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
              {formatCurrency(totals.paidAmount)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel panel-grid rise-in overflow-hidden border-0">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-2xl text-neutral-900 dark:text-neutral-50">
              Invoice register
            </CardTitle>
            <CardDescription className="text-base text-neutral-700 dark:text-neutral-300">
              Filter by customer or status, then open any invoice into the full editor view.
            </CardDescription>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                Status
              </label>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as InvoiceStatus | "all")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="void">Void</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                Customer
              </label>
              <Select value={customerFilter} onValueChange={setCustomerFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All customers</SelectItem>
                  {(customersQuery.data ?? []).map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {invoicesQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : invoices.length > 0 ? (
            <div className="rounded-[1.75rem] border border-white/70 bg-white/80 p-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/45">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <Link
                          className="font-semibold text-primary-700 hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-200"
                          href={`/invoices/${invoice.id}`}
                        >
                          {invoice.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="text-neutral-700 dark:text-neutral-300">
                        {customerMap.get(invoice.customerId) ?? "Unknown customer"}
                      </TableCell>
                      <TableCell className="text-neutral-700 dark:text-neutral-300">
                        {formatDisplayDate(invoice.issueDate)}
                      </TableCell>
                      <TableCell className="text-neutral-700 dark:text-neutral-300">
                        {formatDisplayDate(invoice.dueDate)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-neutral-900 dark:text-neutral-50">
                        {formatCurrency(invoice.total)}
                      </TableCell>
                      <TableCell>
                        <InvoiceStatusBadge status={invoice.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="rounded-[1.75rem] border border-dashed border-primary-200 bg-white/70 p-8 text-center dark:border-primary-900 dark:bg-neutral-950/35">
              <p className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                No invoices match this view
              </p>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
                Adjust the filters or create a fresh invoice to start the billing pipeline.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
