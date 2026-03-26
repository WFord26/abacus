"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from "@wford26/ui";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { apiClient, ApiClientError } from "../../lib/api-client";

import type {
  DocumentContentType,
  DocumentListItem,
  Transaction,
  TransactionListResponse,
  UploadUrlResponse,
} from "@wford26/shared-types";

export type ReceiptUploadModalTransaction = {
  amount: number;
  date: string;
  description: string | null;
  id: string;
  merchantRaw: string | null;
};

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

function formatBytes(value: number) {
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (value >= 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${value} B`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value);
}

function formatTransactionLabel(transaction: ReceiptUploadModalTransaction | Transaction) {
  return transaction.merchantRaw ?? transaction.description ?? "Untitled transaction";
}

function resolveDocumentContentType(file: File): DocumentContentType | null {
  const normalizedType = file.type.toLowerCase();

  if (normalizedType === "image/jpeg" || normalizedType === "image/jpg") {
    return "image/jpeg";
  }

  if (normalizedType === "image/png") {
    return "image/png";
  }

  if (normalizedType === "image/heic") {
    return "image/heic";
  }

  if (normalizedType === "application/pdf") {
    return "application/pdf";
  }

  const normalizedName = file.name.toLowerCase();

  if (normalizedName.endsWith(".jpg") || normalizedName.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (normalizedName.endsWith(".png")) {
    return "image/png";
  }

  if (normalizedName.endsWith(".heic")) {
    return "image/heic";
  }

  if (normalizedName.endsWith(".pdf")) {
    return "application/pdf";
  }

  return null;
}

function buildProgressLabel(progress: number) {
  if (progress >= 100) {
    return "Upload complete";
  }

  if (progress <= 0) {
    return "Preparing upload";
  }

  return `Uploading ${Math.round(progress)}%`;
}

async function uploadFileWithProgress(input: {
  contentType: DocumentContentType;
  file: File;
  onProgress: (progress: number) => void;
  uploadUrl: string;
}) {
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open("PUT", input.uploadUrl);
    request.setRequestHeader("Content-Type", input.contentType);

    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total <= 0) {
        return;
      }

      input.onProgress((event.loaded / event.total) * 100);
    });

    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        input.onProgress(100);
        resolve();
        return;
      }

      reject(new Error("Upload storage rejected the file"));
    });

    request.addEventListener("error", () => {
      reject(new Error("Upload failed before the file reached storage"));
    });

    request.send(input.file);
  });
}

export function ReceiptUploadModal({
  canLinkTransactions,
  initialTransaction = null,
  isOpen,
  onCompleted,
  onOpenChange,
}: Readonly<{
  canLinkTransactions: boolean;
  initialTransaction?: ReceiptUploadModalTransaction | null;
  isOpen: boolean;
  onCompleted?: () => void;
  onOpenChange: (open: boolean) => void;
}>) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedTransaction, setSelectedTransaction] = useState<
    ReceiptUploadModalTransaction | Transaction | null
  >(initialTransaction);
  const [uploadedDocument, setUploadedDocument] = useState<DocumentListItem | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const deferredSearch = useDeferredValue(search.trim());

  useEffect(() => {
    if (isOpen) {
      setSelectedTransaction(initialTransaction);
      return;
    }

    setDragActive(false);
    setError(null);
    setFile(null);
    setIsSubmitting(false);
    setProgress(0);
    setSearch("");
    setSelectedTransaction(initialTransaction);
    setUploadedDocument(null);
    setIsLinking(false);
  }, [initialTransaction, isOpen]);

  const transactionsQuery = useQuery({
    enabled: isOpen && canLinkTransactions && Boolean(uploadedDocument),
    placeholderData: (previousData) => previousData,
    queryFn: () =>
      apiClient<TransactionListResponse>(
        `/transactions?limit=8&page=1${deferredSearch ? `&q=${encodeURIComponent(deferredSearch)}` : ""}`
      ),
    queryKey: [
      "receipt-link-search",
      uploadedDocument?.id ?? "none",
      deferredSearch || "__recent__",
    ],
  });

  const transactionOptions = useMemo(
    () => transactionsQuery.data?.data ?? [],
    [transactionsQuery.data]
  );

  function setValidatedFile(nextFile: File | null) {
    setError(null);
    setUploadedDocument(null);
    setProgress(0);

    if (!nextFile) {
      setFile(null);
      return;
    }

    if (nextFile.size > MAX_FILE_SIZE_BYTES) {
      setFile(null);
      setError("Files larger than 25 MB cannot be uploaded.");
      return;
    }

    if (!resolveDocumentContentType(nextFile)) {
      setFile(null);
      setError("Only JPG, PNG, HEIC, and PDF files are supported right now.");
      return;
    }

    setFile(nextFile);
  }

  async function handleUpload() {
    if (!file) {
      setError("Choose a receipt before starting the upload.");
      return;
    }

    const contentType = resolveDocumentContentType(file);

    if (!contentType) {
      setError("Only JPG, PNG, HEIC, and PDF files are supported right now.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setProgress(0);

    try {
      const uploadTarget = await apiClient<UploadUrlResponse>("/documents/upload-url", {
        body: {
          contentType,
          filename: file.name,
          size: file.size,
        },
        method: "POST",
      });

      await uploadFileWithProgress({
        contentType,
        file,
        onProgress: setProgress,
        uploadUrl: uploadTarget.uploadUrl,
      });

      const document = await apiClient<DocumentListItem>("/documents", {
        body: {
          documentId: uploadTarget.documentId,
          s3Key: uploadTarget.s3Key,
        },
        method: "POST",
      });

      setUploadedDocument(document);
      onCompleted?.();
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiClientError
          ? caughtError.message
          : caughtError instanceof Error
            ? caughtError.message
            : "Unable to upload the receipt right now"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLinkTransaction() {
    if (!uploadedDocument) {
      setError("Upload the receipt before linking it.");
      return;
    }

    if (!selectedTransaction) {
      setError("Choose a transaction before linking the receipt.");
      return;
    }

    setIsLinking(true);
    setError(null);

    try {
      await apiClient(`/documents/${uploadedDocument.id}/link-transaction`, {
        body: {
          transactionId: selectedTransaction.id,
        },
        method: "POST",
      });

      onCompleted?.();
      onOpenChange(false);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiClientError
          ? caughtError.message
          : "Unable to link the receipt to the selected transaction"
      );
    } finally {
      setIsLinking(false);
    }
  }

  const selectedSummary = selectedTransaction ? (
    <div className="rounded-[1.6rem] border border-primary-200 bg-primary-50/85 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.2em] text-primary-700">Selected transaction</p>
      <p className="mt-2 text-base font-semibold text-primary-950">
        {formatTransactionLabel(selectedTransaction)}
      </p>
      <div className="mt-2 flex flex-wrap gap-2 text-sm text-primary-800">
        <span>{selectedTransaction.date}</span>
        <span>{formatCurrency(selectedTransaction.amount)}</span>
      </div>
    </div>
  ) : null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Upload receipt</DialogTitle>
          <DialogDescription>
            Drop a receipt, browse from desktop, or capture one from your phone camera before
            linking it to the right transaction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div
            className={[
              "rounded-[1.8rem] border border-dashed px-5 py-6 transition",
              dragActive
                ? "border-primary-500 bg-primary-50"
                : "border-neutral-300 bg-neutral-50/80",
            ].join(" ")}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragActive(false);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              setValidatedFile(event.dataTransfer.files.item(0));
            }}
          >
            <div className="space-y-3 text-center">
              <p className="text-lg font-semibold text-neutral-900">
                {file ? file.name : "Drop a receipt here"}
              </p>
              <p className="text-sm text-neutral-600">
                JPG, PNG, HEIC, or PDF up to 25 MB. Mobile capture is enabled for quick receipt
                snaps.
              </p>
              <div className="flex flex-col justify-center gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose file
                </Button>
                <Button type="button" onClick={() => fileInputRef.current?.click()}>
                  Use camera or photo library
                </Button>
              </div>
              {file ? (
                <div className="flex flex-wrap justify-center gap-2 text-sm text-neutral-700">
                  <Badge variant="secondary">{formatBytes(file.size)}</Badge>
                  <Badge variant="secondary">
                    {resolveDocumentContentType(file) ?? "Unknown type"}
                  </Badge>
                </div>
              ) : null}
            </div>
            <Input
              ref={fileInputRef}
              accept="image/*,application/pdf"
              capture="environment"
              className="hidden"
              type="file"
              onChange={(event) => {
                setValidatedFile(event.target.files?.item(0) ?? null);
                event.target.value = "";
              }}
            />
          </div>

          {progress > 0 || isSubmitting ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-neutral-700">
                <span>{buildProgressLabel(progress)}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-neutral-200">
                <div
                  className="h-full rounded-full bg-primary-600 transition-[width]"
                  style={{ width: `${Math.max(progress, isSubmitting ? 6 : 0)}%` }}
                />
              </div>
            </div>
          ) : null}

          {uploadedDocument ? (
            <div className="rounded-[1.8rem] border border-emerald-200 bg-emerald-50/80 px-4 py-4">
              <p className="text-sm font-semibold text-emerald-900">Receipt uploaded</p>
              <p className="mt-1 text-sm text-emerald-800">
                {uploadedDocument.filename} is ready. Link it now or close and come back from the
                receipts page later.
              </p>
            </div>
          ) : null}

          {canLinkTransactions && uploadedDocument ? (
            <div className="space-y-4 rounded-[1.8rem] border border-neutral-200 bg-white/85 px-4 py-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-neutral-900">Link to a transaction</p>
                <p className="text-sm text-neutral-600">
                  Search by merchant, memo text, or amount and confirm the match before linking.
                </p>
              </div>

              {selectedSummary}

              <div className="space-y-2">
                <Input
                  placeholder="Search transactions"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <div className="grid gap-2">
                  {transactionOptions.map((transaction) => {
                    const isSelected = selectedTransaction?.id === transaction.id;

                    return (
                      <button
                        key={transaction.id}
                        className={[
                          "rounded-[1.4rem] border px-4 py-3 text-left transition",
                          isSelected
                            ? "border-primary-500 bg-primary-50"
                            : "border-neutral-200 bg-neutral-50 hover:border-primary-300 hover:bg-primary-50/45",
                        ].join(" ")}
                        type="button"
                        onClick={() => setSelectedTransaction(transaction)}
                      >
                        <p className="font-medium text-neutral-900">
                          {formatTransactionLabel(transaction)}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-2 text-sm text-neutral-600">
                          <span>{transaction.date}</span>
                          <span>{formatCurrency(transaction.amount)}</span>
                        </div>
                      </button>
                    );
                  })}
                  {transactionsQuery.isLoading ? (
                    <p className="text-sm text-neutral-500">Loading transactions...</p>
                  ) : null}
                  {transactionsQuery.isError ? (
                    <p className="text-sm text-red-600">
                      Unable to load transactions for linking right now.
                    </p>
                  ) : null}
                  {!transactionsQuery.isLoading && transactionOptions.length === 0 ? (
                    <p className="text-sm text-neutral-500">
                      No matching transactions yet. Try a broader search or close and link later.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-[1.4rem] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {uploadedDocument ? "Close" : "Cancel"}
            </Button>
            {uploadedDocument && canLinkTransactions ? (
              <>
                <Button
                  disabled={isLinking || !selectedTransaction}
                  type="button"
                  onClick={() => void handleLinkTransaction()}
                >
                  {isLinking ? "Linking..." : "Link transaction"}
                </Button>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Link later
                </Button>
              </>
            ) : uploadedDocument ? null : (
              <Button
                disabled={!file || isSubmitting}
                type="button"
                onClick={() => void handleUpload()}
              >
                {isSubmitting ? "Uploading..." : "Start upload"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
