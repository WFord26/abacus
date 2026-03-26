"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@wford26/ui";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../../contexts/auth-context";
import { ApiClientError, apiClient } from "../../lib/api-client";

import { CustomerDialog, type CustomerPayload } from "./customer-dialog";
import { InvoiceStatusBadge } from "./invoice-status-badge";
import { formatCurrency, formatDisplayDate } from "./invoicing-utils";

import type { Customer, CustomerListItem, Invoice, Role } from "@wford26/shared-types";

type ToastState = {
  description: string;
  title: string;
};

const mutationRoles: Role[] = ["owner", "admin", "accountant"];

function buildErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return fallback;
}

function formatAddress(customer: Customer | CustomerListItem) {
  const address = customer.address;

  if (!address) {
    return "No billing address";
  }

  const lines = [
    address.line1,
    [address.city, address.region].filter(Boolean).join(", "),
    [address.postalCode, address.country].filter(Boolean).join(" "),
  ];
  const normalized = lines.map((line) => line?.trim()).filter(Boolean);

  return normalized.length > 0 ? normalized.join(" • ") : "No billing address";
}

function CustomersPageSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.35fr_0.85fr]">
      <Card className="glass-panel border-0">
        <CardHeader className="space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-10 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
      <Card className="glass-panel border-0">
        <CardHeader className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-44" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export function CustomersPage() {
  const queryClient = useQueryClient();
  const { organization, organizations } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerListItem | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const activeRole = useMemo(
    () =>
      organizations.find((membership) => membership.organization.id === organization?.id)?.role ??
      null,
    [organization?.id, organizations]
  );
  const canManageCustomers = useMemo(
    () => (activeRole ? mutationRoles.includes(activeRole) : false),
    [activeRole]
  );
  const customersQueryKey = useMemo(
    () => ["customers-page", organization?.id ?? "unknown"],
    [organization?.id]
  );

  const customersQuery = useQuery({
    enabled: Boolean(organization?.id),
    queryFn: () => apiClient<CustomerListItem[]>("/customers"),
    queryKey: customersQueryKey,
  });
  const customerHistoryQuery = useQuery({
    enabled: Boolean(organization?.id) && Boolean(selectedCustomerId),
    queryFn: () => apiClient<Invoice[]>(`/invoices?customerId=${selectedCustomerId}`),
    queryKey: ["customer-invoices", organization?.id ?? "unknown", selectedCustomerId ?? "none"],
  });

  useEffect(() => {
    const customers = customersQuery.data ?? [];

    if (customers.length === 0) {
      setSelectedCustomerId(null);
      return;
    }

    if (!selectedCustomerId || !customers.some((customer) => customer.id === selectedCustomerId)) {
      setSelectedCustomerId(customers[0]?.id ?? null);
    }
  }, [customersQuery.data, selectedCustomerId]);

  const selectedCustomer = useMemo(
    () =>
      (customersQuery.data ?? []).find((customer) => customer.id === selectedCustomerId) ?? null,
    [customersQuery.data, selectedCustomerId]
  );

  const createMutation = useMutation({
    mutationFn: (payload: CustomerPayload) =>
      apiClient<Customer>("/customers", {
        body: payload,
        method: "POST",
      }),
    onError: (error) => {
      setToast({
        description: buildErrorMessage(error, "Unable to create customer"),
        title: "Customer not created",
      });
    },
    onSuccess: async (customer) => {
      setDialogOpen(false);
      setSelectedCustomerId(customer.id);
      await queryClient.invalidateQueries({
        queryKey: customersQueryKey,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: CustomerPayload) =>
      apiClient<Customer>(`/customers/${editingCustomer?.id ?? ""}`, {
        body: payload,
        method: "PATCH",
      }),
    onError: (error) => {
      setToast({
        description: buildErrorMessage(error, "Unable to update customer"),
        title: "Customer not updated",
      });
    },
    onSuccess: async () => {
      setDialogOpen(false);
      setEditingCustomer(null);
      await queryClient.invalidateQueries({
        queryKey: customersQueryKey,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (customerId: string) =>
      apiClient<{ deleted: true }>(`/customers/${customerId}`, {
        method: "DELETE",
      }),
    onError: (error) => {
      setToast({
        description: buildErrorMessage(
          error,
          "Unable to delete this customer because invoice history already exists."
        ),
        title: "Delete failed",
      });
    },
    onSuccess: async () => {
      const nextCustomer = (customersQuery.data ?? []).find(
        (customer) => customer.id !== selectedCustomerId
      );
      setSelectedCustomerId(nextCustomer?.id ?? null);
      await queryClient.invalidateQueries({
        queryKey: customersQueryKey,
      });
      await queryClient.invalidateQueries({
        queryKey: ["customer-invoices", organization?.id ?? "unknown"],
      });
    },
  });

  async function handleSubmit(payload: CustomerPayload) {
    if (editingCustomer) {
      await updateMutation.mutateAsync(payload);
      return;
    }

    await createMutation.mutateAsync(payload);
  }

  async function handleDeleteSelected() {
    if (!selectedCustomer || !canManageCustomers) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedCustomer.name}? Customers with invoice history cannot be removed.`
    );

    if (!confirmed) {
      return;
    }

    await deleteMutation.mutateAsync(selectedCustomer.id);
  }

  const customers = customersQuery.data ?? [];
  const outstandingBalance = customers.reduce(
    (sum, customer) => sum + customer.outstandingBalance,
    0
  );

  return (
    <ToastProvider>
      {customersQuery.isLoading ? (
        <CustomersPageSkeleton />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.85fr]">
          <Card className="glass-panel panel-grid rise-in overflow-hidden border-0">
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.26em] text-primary-600">Billing</p>
                <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">
                  Customers
                </CardTitle>
                <CardDescription className="max-w-2xl text-base text-neutral-700 dark:text-neutral-300">
                  Keep customer records tidy, review who still has open invoices, and jump straight
                  into invoice history from one place.
                </CardDescription>
              </div>
              {canManageCustomers ? (
                <Button
                  className="w-full md:w-auto"
                  onClick={() => {
                    setEditingCustomer(null);
                    setDialogOpen(true);
                  }}
                >
                  Add customer
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/45">
                  <p className="text-xs uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                    Customer count
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
                    {customers.length}
                  </p>
                </div>
                <div className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/45">
                  <p className="text-xs uppercase tracking-[0.24em] text-neutral-500 dark:text-neutral-400">
                    Outstanding sent invoices
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-neutral-900 dark:text-neutral-50">
                    {formatCurrency(outstandingBalance)}
                  </p>
                </div>
              </div>

              {customers.length > 0 ? (
                <div className="rounded-[1.75rem] border border-white/70 bg-white/80 p-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/45">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                        <TableHead className="text-right">Invoices</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customers.map((customer) => {
                        const isSelected = customer.id === selectedCustomerId;

                        return (
                          <TableRow
                            key={customer.id}
                            className={`cursor-pointer ${isSelected ? "bg-primary-50/80 dark:bg-primary-950/20" : ""}`}
                            onClick={() => setSelectedCustomerId(customer.id)}
                          >
                            <TableCell>
                              <div className="font-medium text-neutral-900 dark:text-neutral-50">
                                {customer.name}
                              </div>
                            </TableCell>
                            <TableCell className="text-neutral-600 dark:text-neutral-300">
                              {customer.email ?? "No email"}
                            </TableCell>
                            <TableCell className="text-right font-medium text-neutral-900 dark:text-neutral-50">
                              {formatCurrency(customer.outstandingBalance)}
                            </TableCell>
                            <TableCell className="text-right text-neutral-600 dark:text-neutral-300">
                              {customer.invoiceCount}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="rounded-[1.75rem] border border-dashed border-primary-200 bg-white/70 p-8 text-center dark:border-primary-900 dark:bg-neutral-950/35">
                  <p className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                    No customers yet
                  </p>
                  <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
                    Add your first customer so invoice drafting has a real billing target.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel panel-grid rise-in overflow-hidden border-0">
            <CardHeader className="space-y-2">
              <p className="text-xs uppercase tracking-[0.26em] text-primary-600">
                Customer detail
              </p>
              <CardTitle className="text-2xl text-neutral-900 dark:text-neutral-50">
                {selectedCustomer?.name ?? "Pick a customer"}
              </CardTitle>
              <CardDescription className="text-base text-neutral-700 dark:text-neutral-300">
                {selectedCustomer
                  ? "Review contact info and recent invoice activity for the selected customer."
                  : "Select a customer from the table to inspect billing details and invoice history."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedCustomer ? (
                <>
                  <div className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/45">
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {selectedCustomer.email ?? "No email on file"}
                      </p>
                      <p className="text-sm text-neutral-600 dark:text-neutral-300">
                        {selectedCustomer.phone ?? "No phone on file"}
                      </p>
                      <p className="text-sm text-neutral-600 dark:text-neutral-300">
                        {formatAddress(selectedCustomer)}
                      </p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/invoices/new?customerId=${selectedCustomer.id}`}>
                          Create invoice
                        </Link>
                      </Button>
                      {canManageCustomers ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingCustomer(selectedCustomer);
                            setDialogOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                      ) : null}
                      {canManageCustomers ? (
                        <Button
                          disabled={deleteMutation.isPending}
                          size="sm"
                          variant="destructive"
                          onClick={() => void handleDeleteSelected()}
                        >
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/45">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                          Invoice history
                        </p>
                        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                          {selectedCustomer.invoiceCount} invoice
                          {selectedCustomer.invoiceCount === 1 ? "" : "s"} on record
                        </p>
                      </div>
                      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                        {formatCurrency(selectedCustomer.outstandingBalance)} open
                      </p>
                    </div>

                    <div className="mt-4 space-y-3">
                      {customerHistoryQuery.isLoading ? (
                        <>
                          <Skeleton className="h-16 w-full" />
                          <Skeleton className="h-16 w-full" />
                        </>
                      ) : (customerHistoryQuery.data ?? []).length > 0 ? (
                        (customerHistoryQuery.data ?? []).map((invoice) => (
                          <Link
                            key={invoice.id}
                            className="block rounded-2xl border border-white/60 bg-white/85 p-4 transition-colors hover:border-primary-300 hover:bg-primary-50/70 dark:border-neutral-800 dark:bg-neutral-950/50 dark:hover:border-primary-800 dark:hover:bg-primary-950/15"
                            href={`/invoices/${invoice.id}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-semibold text-neutral-900 dark:text-neutral-50">
                                  {invoice.invoiceNumber}
                                </p>
                                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                                  Issued {formatDisplayDate(invoice.issueDate)} • Due{" "}
                                  {formatDisplayDate(invoice.dueDate)}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                <InvoiceStatusBadge status={invoice.status} />
                                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                                  {formatCurrency(invoice.total)}
                                </p>
                              </div>
                            </div>
                          </Link>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/70 p-4 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-950/35 dark:text-neutral-300">
                          No invoice history yet for this customer.
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-[1.75rem] border border-dashed border-primary-200 bg-white/70 p-8 text-center dark:border-primary-900 dark:bg-neutral-950/35">
                  <p className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                    No selected customer
                  </p>
                  <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
                    Choose a customer from the table to open billing detail and invoice history.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <CustomerDialog
        customer={editingCustomer}
        open={dialogOpen}
        pending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingCustomer(null);
          }
        }}
        onSubmit={handleSubmit}
      />

      <Toast open={Boolean(toast)} onOpenChange={(open) => (!open ? setToast(null) : null)}>
        {toast ? (
          <>
            <ToastTitle>{toast.title}</ToastTitle>
            <ToastDescription>{toast.description}</ToastDescription>
          </>
        ) : null}
      </Toast>
      <ToastViewport />
    </ToastProvider>
  );
}
