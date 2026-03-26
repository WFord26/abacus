"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
  Skeleton,
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@wford26/ui";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../../contexts/auth-context";
import { ApiClientError, apiClient } from "../../lib/api-client";

import { InvoiceStatusBadge } from "./invoice-status-badge";
import {
  addUtcDays,
  buildInvoiceDateInputValue,
  formatCurrency,
  formatDisplayDate,
} from "./invoicing-utils";

import type { CustomerListItem, InvoiceDetail, InvoiceStatus, Role } from "@wford26/shared-types";

type ToastState = {
  description: string;
  title: string;
};

type InvoiceLineDraft = {
  description: string;
  key: string;
  quantity: string;
  unitPrice: string;
};

type InvoicePayload = {
  customerId: string;
  dueDate?: string | null;
  issueDate?: string | null;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
  notes?: string | null;
  taxRate: number;
};

const mutationRoles: Role[] = ["owner", "admin", "accountant"];

function buildErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return fallback;
}

function openSignedDownload(url: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.rel = "noreferrer";
  anchor.target = "_blank";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function buildEmptyLine(index: number): InvoiceLineDraft {
  return {
    description: "",
    key: `line-${index}-${Date.now()}`,
    quantity: "1",
    unitPrice: "0.00",
  };
}

function buildDefaultDraft(customerId?: string | null) {
  const issueDate = buildInvoiceDateInputValue(new Date());

  return {
    customerId: customerId ?? "",
    dueDate: addUtcDays(issueDate, 30),
    issueDate,
    lineItems: [buildEmptyLine(0)],
    notes: "",
    taxRate: "0",
  };
}

function toLineDrafts(invoice: InvoiceDetail): InvoiceLineDraft[] {
  return invoice.lineItems.map((line, index) => ({
    description: line.description,
    key: line.id || `line-${index}`,
    quantity: String(line.quantity),
    unitPrice: line.unitPrice.toFixed(2),
  }));
}

function formatNotes(notes?: string | null) {
  return notes ?? "";
}

function buildPayload(input: {
  customerId: string;
  dueDate: string;
  issueDate: string;
  lineItems: InvoiceLineDraft[];
  notes: string;
  taxRate: string;
}): InvoicePayload {
  return {
    customerId: input.customerId,
    dueDate: input.dueDate ? input.dueDate : null,
    issueDate: input.issueDate ? input.issueDate : null,
    lineItems: input.lineItems.map((line) => ({
      description: line.description.trim(),
      quantity: Number(line.quantity),
      unitPrice: Number(line.unitPrice),
    })),
    notes: input.notes.trim() ? input.notes.trim() : null,
    taxRate: Number(input.taxRate),
  };
}

function validatePayload(payload: InvoicePayload) {
  if (!payload.customerId) {
    return "Choose a customer before saving the invoice.";
  }

  if (payload.lineItems.length === 0) {
    return "Add at least one line item before saving.";
  }

  if (
    payload.lineItems.some(
      (line) =>
        !line.description.trim() ||
        !Number.isFinite(line.quantity) ||
        line.quantity <= 0 ||
        !Number.isFinite(line.unitPrice) ||
        line.unitPrice < 0
    )
  ) {
    return "Each line item needs a description, a positive quantity, and a valid unit price.";
  }

  if (!Number.isFinite(payload.taxRate) || payload.taxRate < 0 || payload.taxRate > 100) {
    return "Tax rate must be between 0 and 100.";
  }

  return null;
}

function InvoiceEditorSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
      <Card className="glass-panel border-0">
        <CardHeader className="space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-10 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
      <Card className="glass-panel border-0">
        <CardHeader className="space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-40" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export function InvoiceEditorPage({ invoiceId }: Readonly<{ invoiceId?: string }>) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { organization, organizations } = useAuth();
  const [customerId, setCustomerId] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<InvoiceLineDraft[]>(() => [buildEmptyLine(0)]);
  const [toast, setToast] = useState<ToastState | null>(null);

  const selectedCustomerFromUrl = searchParams.get("customerId");
  const invoiceQueryKey = useMemo(
    () => ["invoice-detail", organization?.id ?? "unknown", invoiceId ?? "new"],
    [invoiceId, organization?.id]
  );
  const invoicesListQueryKey = useMemo(
    () => ["invoices-page", organization?.id ?? "unknown"],
    [organization?.id]
  );
  const customersQueryKey = useMemo(
    () => ["invoices-customers", organization?.id ?? "unknown"],
    [organization?.id]
  );
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
    queryKey: customersQueryKey,
  });
  const invoiceQuery = useQuery({
    enabled: Boolean(organization?.id) && Boolean(invoiceId),
    queryFn: () => apiClient<InvoiceDetail>(`/invoices/${invoiceId}`),
    queryKey: invoiceQueryKey,
  });

  useEffect(() => {
    if (invoiceQuery.data) {
      setCustomerId(invoiceQuery.data.customerId);
      setIssueDate(invoiceQuery.data.issueDate ?? "");
      setDueDate(invoiceQuery.data.dueDate ?? "");
      setTaxRate(String(invoiceQuery.data.taxRate));
      setNotes(formatNotes(invoiceQuery.data.notes));
      setLineItems(toLineDrafts(invoiceQuery.data));
      return;
    }

    if (!invoiceId) {
      const draft = buildDefaultDraft(selectedCustomerFromUrl);
      setCustomerId(draft.customerId);
      setIssueDate(draft.issueDate);
      setDueDate(draft.dueDate);
      setTaxRate(draft.taxRate);
      setNotes(draft.notes);
      setLineItems(draft.lineItems);
    }
  }, [invoiceId, invoiceQuery.data, selectedCustomerFromUrl]);

  const createMutation = useMutation({
    mutationFn: (payload: InvoicePayload) =>
      apiClient<InvoiceDetail>("/invoices", {
        body: payload,
        method: "POST",
      }),
  });
  const updateMutation = useMutation({
    mutationFn: (payload: InvoicePayload) =>
      apiClient<InvoiceDetail>(`/invoices/${invoiceId ?? ""}`, {
        body: payload,
        method: "PATCH",
      }),
  });
  const sendMutation = useMutation({
    mutationFn: (targetInvoiceId: string) =>
      apiClient<InvoiceDetail>(`/invoices/${targetInvoiceId}/send`, {
        method: "POST",
      }),
  });
  const markPaidMutation = useMutation({
    mutationFn: (targetInvoiceId: string) =>
      apiClient<InvoiceDetail>(`/invoices/${targetInvoiceId}/mark-paid`, {
        method: "POST",
      }),
    onError: (error) => {
      setToast({
        description: buildErrorMessage(error, "Unable to mark invoice paid"),
        title: "Payment update failed",
      });
    },
  });
  const pdfMutation = useMutation({
    mutationFn: (targetInvoiceId: string) =>
      apiClient<{ downloadUrl: string; downloadUrlExpiresAt: string }>(
        `/invoices/${targetInvoiceId}/pdf`
      ),
    onError: (error) => {
      setToast({
        description: buildErrorMessage(error, "Unable to prepare invoice PDF"),
        title: "PDF unavailable",
      });
    },
  });
  const voidMutation = useMutation({
    mutationFn: (targetInvoiceId: string) =>
      apiClient<InvoiceDetail>(`/invoices/${targetInvoiceId}`, {
        body: {
          status: "void",
        },
        method: "PATCH",
      }),
    onError: (error) => {
      setToast({
        description: buildErrorMessage(error, "Unable to void invoice"),
        title: "Void failed",
      });
    },
  });

  const currentInvoice = invoiceQuery.data ?? null;
  const currentStatus: InvoiceStatus = currentInvoice?.status ?? "draft";
  const isReadOnly = Boolean(currentInvoice) && currentStatus !== "draft";
  const customerMap = useMemo(
    () => new Map((customersQuery.data ?? []).map((customer) => [customer.id, customer] as const)),
    [customersQuery.data]
  );
  const totals = useMemo(() => {
    const subtotal = lineItems.reduce((sum, line) => {
      const quantity = Number(line.quantity);
      const unitPrice = Number(line.unitPrice);

      if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
        return sum;
      }

      return sum + quantity * unitPrice;
    }, 0);
    const normalizedSubtotal = Number(subtotal.toFixed(2));
    const taxAmount = Number(((normalizedSubtotal * Number(taxRate || 0)) / 100).toFixed(2));

    return {
      subtotal: normalizedSubtotal,
      tax: taxAmount,
      total: Number((normalizedSubtotal + taxAmount).toFixed(2)),
    };
  }, [lineItems, taxRate]);

  const isBusy =
    createMutation.isPending ||
    updateMutation.isPending ||
    sendMutation.isPending ||
    markPaidMutation.isPending ||
    pdfMutation.isPending ||
    voidMutation.isPending;

  async function syncCaches(updatedInvoice?: InvoiceDetail) {
    if (updatedInvoice) {
      queryClient.setQueryData(invoiceQueryKey, updatedInvoice);
    }

    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: invoicesListQueryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: customersQueryKey,
      }),
      queryClient.invalidateQueries({
        queryKey: ["customers-page", organization?.id ?? "unknown"],
      }),
    ]);
  }

  function appendLineItem() {
    setLineItems((current) => [...current, buildEmptyLine(current.length)]);
  }

  function removeLineItem(key: string) {
    setLineItems((current) =>
      current.length > 1 ? current.filter((line) => line.key !== key) : current
    );
  }

  async function saveInvoice(mode: "draft" | "send") {
    const payload = buildPayload({
      customerId,
      dueDate,
      issueDate,
      lineItems,
      notes,
      taxRate,
    });
    const validationError = validatePayload(payload);

    if (validationError) {
      setToast({
        description: validationError,
        title: "Invoice not ready",
      });
      return;
    }

    try {
      let saved = invoiceId
        ? await updateMutation.mutateAsync(payload)
        : await createMutation.mutateAsync(payload);

      if (mode === "send") {
        saved = await sendMutation.mutateAsync(saved.id);
      }

      await syncCaches(saved);

      if (!invoiceId) {
        router.replace(`/invoices/${saved.id}`);
        return;
      }

      setToast({
        description:
          mode === "send"
            ? "The invoice is now marked sent and the editor has switched to read-only mode."
            : "Invoice changes saved.",
        title: mode === "send" ? "Invoice sent" : "Draft saved",
      });
    } catch (error) {
      setToast({
        description: buildErrorMessage(
          error,
          mode === "send" ? "Unable to send invoice" : "Unable to save invoice"
        ),
        title: mode === "send" ? "Send failed" : "Save failed",
      });
    }
  }

  async function handleMarkPaid() {
    if (!currentInvoice) {
      return;
    }

    const updated = await markPaidMutation.mutateAsync(currentInvoice.id);
    await syncCaches(updated);
    setToast({
      description: "The invoice was marked paid and can now flow into income-side reporting.",
      title: "Invoice paid",
    });
  }

  async function handleDownloadPdf() {
    if (!currentInvoice) {
      return;
    }

    const pdf = await pdfMutation.mutateAsync(currentInvoice.id);
    openSignedDownload(pdf.downloadUrl);
  }

  async function handleVoidInvoice() {
    if (!currentInvoice) {
      return;
    }

    const confirmed = window.confirm(
      `Void ${currentInvoice.invoiceNumber}? This keeps the record but removes it from active billing.`
    );

    if (!confirmed) {
      return;
    }

    const updated = await voidMutation.mutateAsync(currentInvoice.id);
    await syncCaches(updated);
    setToast({
      description: "The invoice was voided successfully.",
      title: "Invoice voided",
    });
  }

  if (customersQuery.isLoading || (invoiceId && invoiceQuery.isLoading)) {
    return <InvoiceEditorSkeleton />;
  }

  return (
    <ToastProvider>
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <Card className="glass-panel panel-grid rise-in overflow-hidden border-0">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.26em] text-primary-600">Billing</p>
                <CardTitle className="mt-2 text-3xl text-neutral-900 dark:text-neutral-50">
                  {currentInvoice?.invoiceNumber ?? "New invoice"}
                </CardTitle>
              </div>
              {currentInvoice ? <InvoiceStatusBadge status={currentStatus} /> : null}
            </div>
            <CardDescription className="max-w-3xl text-base text-neutral-700 dark:text-neutral-300">
              {isReadOnly
                ? `This ${currentStatus} invoice is read-only. You can still download the PDF and manage its lifecycle actions from the summary panel.`
                : "Build the invoice line items here. Totals update automatically as quantities, prices, and tax change."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2 md:col-span-3">
                <label className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  Customer
                </label>
                <Select
                  disabled={isReadOnly || !canManageInvoices}
                  value={customerId}
                  onValueChange={setCustomerId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {(customersQuery.data ?? []).map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(customersQuery.data ?? []).length === 0 ? (
                  <p className="text-sm text-neutral-600 dark:text-neutral-300">
                    You need a customer record before you can draft invoices.{" "}
                    <Link
                      className="font-medium text-primary-700 hover:text-primary-800"
                      href="/customers"
                    >
                      Create one here
                    </Link>
                    .
                  </p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  Issue date
                </label>
                <Input
                  disabled={isReadOnly || !canManageInvoices}
                  type="date"
                  value={issueDate}
                  onChange={(event) => setIssueDate(event.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  Due date
                </label>
                <Input
                  disabled={isReadOnly || !canManageInvoices}
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                  Tax rate %
                </label>
                <Input
                  disabled={isReadOnly || !canManageInvoices}
                  inputMode="decimal"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={taxRate}
                  onChange={(event) => setTaxRate(event.target.value)}
                />
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/70 bg-white/80 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/45">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                    Line items
                  </p>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
                    Description, quantity, rate, and amount all stay in sync automatically.
                  </p>
                </div>
                {!isReadOnly && canManageInvoices ? (
                  <Button size="sm" variant="outline" onClick={appendLineItem}>
                    Add line
                  </Button>
                ) : null}
              </div>

              <div className="mt-4 space-y-3">
                {lineItems.map((line, index) => {
                  const quantity = Number(line.quantity);
                  const unitPrice = Number(line.unitPrice);
                  const amount =
                    Number.isFinite(quantity) && Number.isFinite(unitPrice)
                      ? quantity * unitPrice
                      : 0;

                  return (
                    <div
                      key={line.key}
                      className="grid gap-3 rounded-2xl border border-white/70 bg-white/90 p-4 dark:border-neutral-800 dark:bg-neutral-950/50 lg:grid-cols-[1.7fr_0.7fr_0.7fr_0.7fr_auto]"
                    >
                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                          Description
                        </label>
                        <Input
                          disabled={isReadOnly || !canManageInvoices}
                          value={line.description}
                          onChange={(event) =>
                            setLineItems((current) =>
                              current.map((item) =>
                                item.key === line.key
                                  ? {
                                      ...item,
                                      description: event.target.value,
                                    }
                                  : item
                              )
                            )
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                          Qty
                        </label>
                        <Input
                          disabled={isReadOnly || !canManageInvoices}
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          type="number"
                          value={line.quantity}
                          onChange={(event) =>
                            setLineItems((current) =>
                              current.map((item) =>
                                item.key === line.key
                                  ? {
                                      ...item,
                                      quantity: event.target.value,
                                    }
                                  : item
                              )
                            )
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                          Unit price
                        </label>
                        <Input
                          disabled={isReadOnly || !canManageInvoices}
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          type="number"
                          value={line.unitPrice}
                          onChange={(event) =>
                            setLineItems((current) =>
                              current.map((item) =>
                                item.key === line.key
                                  ? {
                                      ...item,
                                      unitPrice: event.target.value,
                                    }
                                  : item
                              )
                            )
                          }
                        />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                          Amount
                        </label>
                        <div className="flex h-10 items-center rounded-md border border-neutral-200 bg-neutral-50 px-3 text-sm font-medium text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-50">
                          {formatCurrency(amount)}
                        </div>
                      </div>
                      <div className="flex items-end">
                        {!isReadOnly && canManageInvoices ? (
                          <Button
                            disabled={lineItems.length === 1}
                            size="sm"
                            type="button"
                            variant="outline"
                            onClick={() => removeLineItem(line.key)}
                          >
                            Remove
                          </Button>
                        ) : (
                          <div className="pb-2 text-sm text-neutral-500 dark:text-neutral-400">
                            #{index + 1}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                Notes
              </label>
              <textarea
                className="min-h-32 rounded-2xl border border-neutral-300 bg-white px-4 py-3 text-sm text-neutral-900 shadow-sm transition-colors placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-50"
                disabled={isReadOnly || !canManageInvoices}
                placeholder="Optional payment instructions or context for the customer."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel panel-grid rise-in overflow-hidden border-0">
          <CardHeader className="space-y-3">
            <p className="text-xs uppercase tracking-[0.26em] text-primary-600">Summary</p>
            <CardTitle className="text-2xl text-neutral-900 dark:text-neutral-50">
              {currentInvoice ? "Invoice lifecycle" : "Draft totals"}
            </CardTitle>
            <CardDescription className="text-base text-neutral-700 dark:text-neutral-300">
              Review totals, lifecycle actions, and PDF export from the same panel.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/45">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-neutral-600 dark:text-neutral-300">Customer</span>
                  <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {customerMap.get(customerId)?.name ?? "Not selected"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-neutral-600 dark:text-neutral-300">Issue date</span>
                  <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {formatDisplayDate(issueDate)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-neutral-600 dark:text-neutral-300">Due date</span>
                  <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {formatDisplayDate(dueDate)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/70 bg-white/75 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/45">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-neutral-600 dark:text-neutral-300">Subtotal</span>
                  <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {formatCurrency(totals.subtotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-neutral-600 dark:text-neutral-300">
                    Tax ({taxRate || "0"}%)
                  </span>
                  <span className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
                    {formatCurrency(totals.tax)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-3 dark:border-neutral-800">
                  <span className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
                    Total
                  </span>
                  <span className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
                    {formatCurrency(totals.total)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {!currentInvoice ? (
                canManageInvoices ? (
                  <>
                    <Button disabled={isBusy} onClick={() => void saveInvoice("draft")}>
                      {createMutation.isPending ? "Saving..." : "Save draft"}
                    </Button>
                    <Button
                      disabled={isBusy}
                      variant="outline"
                      onClick={() => void saveInvoice("send")}
                    >
                      {sendMutation.isPending || createMutation.isPending
                        ? "Sending..."
                        : "Save and send"}
                    </Button>
                  </>
                ) : null
              ) : (
                <>
                  {!isReadOnly && canManageInvoices ? (
                    <>
                      <Button disabled={isBusy} onClick={() => void saveInvoice("draft")}>
                        {updateMutation.isPending ? "Saving..." : "Save draft"}
                      </Button>
                      <Button
                        disabled={isBusy}
                        variant="outline"
                        onClick={() => void saveInvoice("send")}
                      >
                        {sendMutation.isPending || updateMutation.isPending ? "Sending..." : "Send"}
                      </Button>
                    </>
                  ) : null}

                  <Button
                    disabled={isBusy}
                    variant="outline"
                    onClick={() => void handleDownloadPdf()}
                  >
                    {pdfMutation.isPending ? "Preparing PDF..." : "Download PDF"}
                  </Button>

                  {currentStatus === "sent" && canManageInvoices ? (
                    <Button
                      disabled={isBusy}
                      variant="outline"
                      onClick={() => void handleMarkPaid()}
                    >
                      {markPaidMutation.isPending ? "Marking paid..." : "Mark paid"}
                    </Button>
                  ) : null}

                  {currentStatus !== "void" && canManageInvoices ? (
                    <Button
                      disabled={isBusy}
                      variant="destructive"
                      onClick={() => void handleVoidInvoice()}
                    >
                      {voidMutation.isPending ? "Voiding..." : "Void"}
                    </Button>
                  ) : null}
                </>
              )}

              <Button asChild variant="ghost">
                <Link href="/invoices">Back to invoices</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

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
