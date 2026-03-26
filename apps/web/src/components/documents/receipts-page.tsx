"use client";

import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wford26/ui";
import { useMemo, useState } from "react";

import { useAuth } from "../../contexts/auth-context";
import { apiClient } from "../../lib/api-client";

import { ReceiptUploadModal } from "./receipt-upload-modal";

import type {
  DocumentListResponse,
  DocumentWithDownloadUrl,
  Role,
  Transaction,
} from "@wford26/shared-types";

const mutationRoles: Role[] = ["owner", "admin", "accountant"];

function formatDocumentDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value);
}

function formatTransactionLabel(transaction: Transaction) {
  return transaction.merchantRaw ?? transaction.description ?? "Untitled transaction";
}

function isImageDocument(contentType: string) {
  return contentType.startsWith("image/");
}

export function ReceiptsPage() {
  const queryClient = useQueryClient();
  const { organization, organizations } = useAuth();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [showUnlinkedOnly, setShowUnlinkedOnly] = useState(false);

  const activeRole = useMemo(
    () =>
      organizations.find((membership) => membership.organization.id === organization?.id)?.role ??
      null,
    [organization?.id, organizations]
  );
  const canLinkTransactions = useMemo(
    () => (activeRole ? mutationRoles.includes(activeRole) : false),
    [activeRole]
  );

  const documentsQueryKey = useMemo(
    () => ["receipts-page", organization?.id ?? "unknown"],
    [organization?.id]
  );

  const documentsQuery = useQuery({
    enabled: Boolean(organization?.id),
    queryFn: () => apiClient<DocumentListResponse>("/documents?page=1&limit=36"),
    queryKey: documentsQueryKey,
  });

  const filteredDocuments = useMemo(() => {
    const items = documentsQuery.data?.data ?? [];

    return items.filter((document) =>
      showUnlinkedOnly ? document.linkedTransactionIds.length === 0 : true
    );
  }, [documentsQuery.data, showUnlinkedOnly]);

  const documentDetailQueries = useQueries({
    queries: filteredDocuments.map((document) => ({
      enabled: Boolean(organization?.id),
      queryFn: () => apiClient<DocumentWithDownloadUrl>(`/documents/${document.id}`),
      queryKey: ["receipt-document", document.id],
      staleTime: 60_000,
    })),
  });

  const documentDetailsById = useMemo(() => {
    const entries = filteredDocuments.flatMap((document, index) => {
      const detail = documentDetailQueries[index]?.data;
      return detail ? [[document.id, detail] as const] : [];
    });

    return new Map(entries);
  }, [documentDetailQueries, filteredDocuments]);

  const linkedTransactionIds = useMemo(
    () =>
      [...new Set(filteredDocuments.flatMap((document) => document.linkedTransactionIds))].slice(
        0,
        64
      ),
    [filteredDocuments]
  );

  const linkedTransactionQueries = useQueries({
    queries: linkedTransactionIds.map((transactionId) => ({
      enabled: Boolean(organization?.id),
      queryFn: () => apiClient<Transaction>(`/transactions/${transactionId}`),
      queryKey: ["receipt-linked-transaction", transactionId],
      staleTime: 60_000,
    })),
  });

  const transactionsById = useMemo(() => {
    const entries = linkedTransactionIds.flatMap((transactionId, index) => {
      const transaction = linkedTransactionQueries[index]?.data;
      return transaction ? [[transactionId, transaction] as const] : [];
    });

    return new Map(entries);
  }, [linkedTransactionIds, linkedTransactionQueries]);

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1.65fr_0.75fr]">
        <Card className="glass-panel panel-grid rise-in overflow-hidden border-0">
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.26em] text-primary-600">Documents</p>
              <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">
                Receipts
              </CardTitle>
              <CardDescription className="max-w-2xl text-base text-neutral-700 dark:text-neutral-300">
                Keep photo receipts, PDF exports, and linked proof close to the ledger entries they
                support.
              </CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
              <Button
                className="w-full md:w-auto"
                variant={showUnlinkedOnly ? "default" : "outline"}
                onClick={() => setShowUnlinkedOnly((current) => !current)}
              >
                {showUnlinkedOnly ? "Showing unlinked only" : "Filter unlinked"}
              </Button>
              <Button className="w-full md:w-auto" onClick={() => setIsUploadOpen(true)}>
                Upload receipt
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {documentsQuery.isError ? (
              <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                Unable to load receipts right now. Refresh the page and try again.
              </div>
            ) : null}

            {documentsQuery.isLoading ? (
              <div className="rounded-[1.8rem] border border-neutral-200/80 bg-white/75 p-8 text-sm text-neutral-600">
                Loading receipts...
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="rounded-[1.8rem] border border-dashed border-neutral-300 bg-white/75 p-10 text-center">
                <p className="text-lg font-semibold text-neutral-900">
                  {showUnlinkedOnly ? "No unlinked receipts" : "No receipts uploaded yet"}
                </p>
                <p className="mt-2 text-sm text-neutral-600">
                  {showUnlinkedOnly
                    ? "Every uploaded receipt in this workspace is already linked to a transaction."
                    : "Upload from desktop drag-and-drop or snap receipts from a phone camera to start building the archive."}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {filteredDocuments.map((document) => {
                  const detail = documentDetailsById.get(document.id);
                  const linkedTransactions = document.linkedTransactionIds
                    .map((transactionId) => transactionsById.get(transactionId))
                    .filter((transaction): transaction is Transaction => Boolean(transaction));

                  return (
                    <article
                      key={document.id}
                      className="overflow-hidden rounded-[1.9rem] border border-neutral-200/80 bg-white/85 shadow-sm"
                    >
                      <div className="border-b border-neutral-200/70 bg-neutral-100/80 p-3">
                        {detail && isImageDocument(detail.contentType) ? (
                          <a href={detail.downloadUrl} rel="noreferrer" target="_blank">
                            <div
                              aria-label={document.filename}
                              className="h-48 rounded-[1.3rem] border border-neutral-200 bg-cover bg-center"
                              role="img"
                              style={{ backgroundImage: `url(${detail.downloadUrl})` }}
                            />
                          </a>
                        ) : (
                          <div className="flex h-48 items-center justify-center rounded-[1.3rem] border border-neutral-200 bg-white text-center">
                            <div>
                              <p className="text-xs uppercase tracking-[0.22em] text-neutral-500">
                                {document.contentType === "application/pdf"
                                  ? "PDF receipt"
                                  : "Preview pending"}
                              </p>
                              <p className="mt-2 px-4 text-sm font-medium text-neutral-700">
                                {document.filename}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-4 px-4 py-4">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={
                                document.linkedTransactionIds.length > 0 ? "success" : "secondary"
                              }
                            >
                              {document.linkedTransactionIds.length > 0 ? "Linked" : "Unlinked"}
                            </Badge>
                            <Badge variant="secondary">
                              {formatDocumentDate(document.createdAt)}
                            </Badge>
                          </div>
                          <p className="text-base font-semibold text-neutral-900">
                            {document.filename}
                          </p>
                          <p className="text-sm text-neutral-600">
                            {document.linkedTransactionIds.length} linked transaction
                            {document.linkedTransactionIds.length === 1 ? "" : "s"}
                          </p>
                        </div>

                        <div className="space-y-2">
                          {linkedTransactions.length > 0 ? (
                            linkedTransactions.map((transaction) => (
                              <div
                                key={transaction.id}
                                className="rounded-[1.3rem] border border-neutral-200 bg-neutral-50/85 px-3 py-3"
                              >
                                <p className="text-sm font-medium text-neutral-900">
                                  {formatTransactionLabel(transaction)}
                                </p>
                                <div className="mt-1 flex flex-wrap gap-2 text-xs text-neutral-600">
                                  <span>{transaction.date}</span>
                                  <span>{formatCurrency(transaction.amount)}</span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-[1.3rem] border border-dashed border-neutral-300 bg-neutral-50/80 px-3 py-3 text-sm text-neutral-600">
                              This receipt is still unlinked.
                            </div>
                          )}
                        </div>

                        {detail ? (
                          <div className="flex gap-2">
                            <Button asChild className="flex-1" variant="outline">
                              <a href={detail.downloadUrl} rel="noreferrer" target="_blank">
                                Open file
                              </a>
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="glass-panel rise-in border-0">
            <CardHeader>
              <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                Upload flow
              </p>
              <CardTitle className="text-xl text-neutral-900 dark:text-neutral-50">
                Mobile and desktop ready
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
              <p>
                Receipts can be dropped from a desktop folder or captured directly from a phone
                camera.
              </p>
              <p>Uploads larger than 25 MB are rejected before any network transfer begins.</p>
              <p>
                Image receipts render thumbnails here, while PDFs stay accessible through signed
                download links.
              </p>
            </CardContent>
          </Card>

          <Card className="glass-panel rise-in border-0">
            <CardHeader>
              <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                Snapshot
              </p>
              <CardTitle className="text-xl text-neutral-900 dark:text-neutral-50">
                Archive status
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-neutral-700 dark:text-neutral-300">
              <div className="rounded-3xl border border-neutral-200 bg-white/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                  Total receipts
                </p>
                <p className="mt-2 text-2xl font-semibold text-neutral-900">
                  {documentsQuery.data?.meta.total ?? 0}
                </p>
              </div>
              <div className="rounded-3xl border border-neutral-200 bg-white/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                  Currently unlinked
                </p>
                <p className="mt-2 text-2xl font-semibold text-neutral-900">
                  {
                    (documentsQuery.data?.data ?? []).filter(
                      (document) => document.linkedTransactionIds.length === 0
                    ).length
                  }
                </p>
              </div>
              <div className="rounded-3xl border border-neutral-200 bg-white/80 px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                  Link permissions
                </p>
                <p className="mt-2 text-base font-semibold text-neutral-900">
                  {canLinkTransactions ? "Enabled for this role" : "Read only for this role"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ReceiptUploadModal
        canLinkTransactions={canLinkTransactions}
        isOpen={isUploadOpen}
        onCompleted={() => {
          void queryClient.invalidateQueries({
            queryKey: documentsQueryKey,
          });
        }}
        onOpenChange={setIsUploadOpen}
      />
    </>
  );
}
