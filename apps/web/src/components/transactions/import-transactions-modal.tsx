"use client";

import {
  Badge,
  Button,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@wford26/ui";
import { useEffect, useMemo, useState } from "react";

import type { ImportBatchDetail, ImportBatchRowResult } from "@wford26/shared-types";

type AccountOption = {
  id: string;
  label: string;
};

type ImportRowFilter = "all" | "duplicate" | "error" | "imported" | "skipped";

function splitCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let isInQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      const next = line[index + 1];

      if (isInQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }

      isInQuotes = !isInQuotes;
      continue;
    }

    if (char === "," && !isInQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function detectCsvFormat(headers: string[]) {
  const normalizedHeaders = headers.map((header) => header.toLowerCase());

  if (
    normalizedHeaders.includes("date") &&
    normalizedHeaders.includes("amount") &&
    normalizedHeaders.includes("description")
  ) {
    return {
      columns: ["Date", "Amount", "Description"],
      label: "Generic transaction CSV",
    };
  }

  if (
    normalizedHeaders.includes("posting date") &&
    normalizedHeaders.includes("debit") &&
    normalizedHeaders.includes("credit")
  ) {
    return {
      columns: ["Posting Date", "Description", "Debit", "Credit"],
      label: "Bank debit/credit export",
    };
  }

  return {
    columns: headers,
    label: "Custom header layout",
  };
}

function getStatusVariant(status: ImportBatchRowResult["status"]) {
  if (status === "imported") {
    return "success";
  }

  if (status === "duplicate") {
    return "warning";
  }

  if (status === "error") {
    return "destructive";
  }

  return "secondary";
}

export function ImportTransactionsModal({
  accounts,
  isOpen,
  onImport,
  onOpenChange,
}: Readonly<{
  accounts: AccountOption[];
  isOpen: boolean;
  onImport: (input: { accountId: string; file: File }) => Promise<ImportBatchDetail>;
  onOpenChange: (open: boolean) => void;
}>) {
  const [accountId, setAccountId] = useState<string>("");
  const [detectedFormat, setDetectedFormat] = useState<{
    columns: string[];
    label: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<ImportBatchDetail | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setAccountId("");
      setDetectedFormat(null);
      setError(null);
      setFile(null);
      setIsSubmitting(false);
      setResult(null);
    }
  }, [isOpen]);

  async function handleFileSelection(nextFile: File | null) {
    setFile(nextFile);
    setError(null);
    setResult(null);

    if (!nextFile) {
      setDetectedFormat(null);
      return;
    }

    try {
      const content = await nextFile.text();
      const [headerLine = ""] = content.split(/\r?\n/, 1);
      const headers = splitCsvLine(headerLine).filter(Boolean);

      setDetectedFormat(headers.length > 0 ? detectCsvFormat(headers) : null);
    } catch {
      setDetectedFormat(null);
    }
  }

  async function handleImport() {
    if (!accountId) {
      setError("Choose the destination account before importing.");
      return;
    }

    if (!file) {
      setError("Choose a CSV file to import.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const batch = await onImport({
        accountId,
        file,
      });

      setResult(batch);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to import the CSV");
    } finally {
      setIsSubmitting(false);
    }
  }

  const importedRows = result?.rows.filter((row) => row.status === "imported").length ?? 0;
  const duplicateRows = result?.rows.filter((row) => row.status === "duplicate").length ?? 0;
  const errorRows = result?.rows.filter((row) => row.status === "error").length ?? 0;

  const rowBuckets = useMemo<Record<ImportRowFilter, ImportBatchRowResult[]>>(
    () => ({
      all: result?.rows ?? [],
      duplicate: result?.rows.filter((row) => row.status === "duplicate") ?? [],
      error: result?.rows.filter((row) => row.status === "error") ?? [],
      imported: result?.rows.filter((row) => row.status === "imported") ?? [],
      skipped: result?.rows.filter((row) => row.status === "skipped") ?? [],
    }),
    [result]
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
          <DialogDescription>
            Upload a bank export or generic transaction CSV and route it into the chosen account.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-3xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Imported</p>
                <p className="mt-2 text-2xl font-semibold text-neutral-900">{importedRows}</p>
              </div>
              <div className="rounded-3xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Duplicates</p>
                <p className="mt-2 text-2xl font-semibold text-neutral-900">{duplicateRows}</p>
              </div>
              <div className="rounded-3xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">Errors</p>
                <p className="mt-2 text-2xl font-semibold text-neutral-900">{errorRows}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-neutral-200 bg-white px-4 py-4">
              <p className="text-sm text-neutral-700">
                Imported from{" "}
                <span className="font-semibold">{result.filename ?? "uploaded file"}</span> into{" "}
                {accounts.find((account) => account.id === result.accountId)?.label ??
                  "the selected account"}
                .
              </p>
            </div>

            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">All rows</TabsTrigger>
                <TabsTrigger value="imported">Imported</TabsTrigger>
                <TabsTrigger value="duplicate">Duplicates</TabsTrigger>
                <TabsTrigger value="error">Errors</TabsTrigger>
                <TabsTrigger value="skipped">Skipped</TabsTrigger>
              </TabsList>

              {(["all", "imported", "duplicate", "error", "skipped"] as const).map((tab) => (
                <TabsContent key={tab} value={tab}>
                  <div className="max-h-[360px] overflow-auto rounded-3xl border border-neutral-200">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Row</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Message</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rowBuckets[tab].length === 0 ? (
                          <TableRow>
                            <TableCell className="text-neutral-500" colSpan={6}>
                              No rows in this bucket.
                            </TableCell>
                          </TableRow>
                        ) : (
                          rowBuckets[tab].map((row) => (
                            <TableRow key={`${row.rowNumber}-${row.status}`}>
                              <TableCell className="font-medium text-neutral-900">
                                {row.rowNumber}
                              </TableCell>
                              <TableCell>
                                <Badge variant={getStatusVariant(row.status)}>{row.status}</Badge>
                              </TableCell>
                              <TableCell>{row.date ?? "—"}</TableCell>
                              <TableCell className="max-w-[240px] truncate">
                                {row.description ?? "—"}
                              </TableCell>
                              <TableCell className="text-right font-medium text-neutral-900">
                                {row.amount === null ? "—" : row.amount.toFixed(2)}
                              </TableCell>
                              <TableCell className="max-w-[280px] text-neutral-600">
                                {row.message ?? "—"}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              ))}
            </Tabs>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setFile(null);
                  setResult(null);
                  setDetectedFormat(null);
                  setError(null);
                }}
              >
                Import another file
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="import-account">Destination account</Label>
              <Select
                value={accountId || "__none__"}
                onValueChange={(value) => setAccountId(value === "__none__" ? "" : value)}
              >
                <SelectTrigger id="import-account">
                  <SelectValue placeholder="Choose an account" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Choose an account</SelectItem>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label htmlFor="transactions-csv-upload">CSV file</Label>
              <label
                className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-8 text-center transition hover:border-neutral-500 hover:bg-white"
                htmlFor="transactions-csv-upload"
              >
                <span className="text-lg font-semibold text-neutral-900">
                  {file ? file.name : "Drop a CSV here or click to choose one"}
                </span>
                <span className="mt-2 max-w-md text-sm text-neutral-600">
                  Supported formats: generic Date/Amount/Description exports and bank-style Posting
                  Date with Debit/Credit columns.
                </span>
              </label>
              <Input
                id="transactions-csv-upload"
                accept=".csv,text/csv"
                className="hidden"
                type="file"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  void handleFileSelection(nextFile);
                }}
              />
            </div>

            {detectedFormat ? (
              <div className="rounded-3xl border border-neutral-200 bg-white px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                  Detected layout
                </p>
                <p className="mt-2 text-lg font-semibold text-neutral-900">
                  {detectedFormat.label}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {detectedFormat.columns.map((column) => (
                    <Badge key={column} variant="secondary">
                      {column}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={isSubmitting} type="button" onClick={() => void handleImport()}>
                {isSubmitting ? "Importing..." : "Import CSV"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
