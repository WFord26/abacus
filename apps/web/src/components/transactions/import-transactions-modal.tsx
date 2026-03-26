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
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ImportBatchDetail, ImportBatchRowResult } from "@wford26/shared-types";

type AccountOption = {
  id: string;
  label: string;
};

type CsvMapping = {
  amount: string | null;
  credit: string | null;
  date: string | null;
  debit: string | null;
  description: string | null;
};

type CsvDraft = {
  dateFormatLabel: string | null;
  detectedLayoutLabel: string;
  file: File;
  headers: string[];
  rows: string[][];
  signature: string;
};

type ImportRowFilter = "all" | "duplicate" | "error" | "imported" | "skipped";
type WizardStep = "done" | "importing" | "preview" | "upload";

const MAPPING_STORAGE_PREFIX = "abacus.csv-mapping.";

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
    return "Generic transaction CSV";
  }

  if (
    normalizedHeaders.includes("posting date") &&
    normalizedHeaders.includes("debit") &&
    normalizedHeaders.includes("credit")
  ) {
    return "Bank debit/credit export";
  }

  return "Custom header layout";
}

function guessHeader(headers: string[], candidates: string[]) {
  return (
    headers.find((header) => {
      const normalized = header.trim().toLowerCase();
      return candidates.includes(normalized);
    }) ?? null
  );
}

function buildDefaultMapping(headers: string[]): CsvMapping {
  return {
    amount: guessHeader(headers, ["amount", "amt", "transaction amount"]),
    credit: guessHeader(headers, ["credit", "deposit", "credits"]),
    date: guessHeader(headers, ["date", "posting date", "transaction date", "posted date"]),
    debit: guessHeader(headers, ["debit", "withdrawal", "debits"]),
    description: guessHeader(headers, [
      "description",
      "details",
      "memo",
      "merchant",
      "payee",
      "name",
    ]),
  };
}

function normalizeMapping(mapping: CsvMapping, headers: string[]): CsvMapping {
  const allowed = new Set(headers);

  return {
    amount: mapping.amount && allowed.has(mapping.amount) ? mapping.amount : null,
    credit: mapping.credit && allowed.has(mapping.credit) ? mapping.credit : null,
    date: mapping.date && allowed.has(mapping.date) ? mapping.date : null,
    debit: mapping.debit && allowed.has(mapping.debit) ? mapping.debit : null,
    description:
      mapping.description && allowed.has(mapping.description) ? mapping.description : null,
  };
}

function getMappingStorageKey(signature: string) {
  return `${MAPPING_STORAGE_PREFIX}${signature}`;
}

function readStoredMapping(signature: string, headers: string[]) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getMappingStorageKey(signature));

    if (!raw) {
      return null;
    }

    return normalizeMapping(JSON.parse(raw) as CsvMapping, headers);
  } catch {
    return null;
  }
}

function writeStoredMapping(signature: string, mapping: CsvMapping) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getMappingStorageKey(signature), JSON.stringify(mapping));
  } catch {
    // Ignore storage failures so the wizard still works in private contexts.
  }
}

function buildSignature(headers: string[]) {
  return headers.map((header) => header.trim().toLowerCase()).join("|");
}

function detectDateFormatLabel(rows: string[][], headers: string[], mapping: CsvMapping) {
  if (!mapping.date) {
    return null;
  }

  const dateIndex = headers.indexOf(mapping.date);

  if (dateIndex === -1) {
    return null;
  }

  const sampleValues = rows
    .map((row) => row[dateIndex]?.trim() ?? "")
    .filter(Boolean)
    .slice(0, 5);

  if (sampleValues.length === 0) {
    return null;
  }

  if (sampleValues.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))) {
    return "YYYY-MM-DD";
  }

  if (sampleValues.every((value) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value))) {
    return "MM/DD/YYYY";
  }

  return "Mixed or custom format";
}

function escapeCsvValue(value: string) {
  if (value.includes('"')) {
    value = value.replaceAll('"', '""');
  }

  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value}"`;
  }

  return value;
}

function parseNumber(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const isNegative = trimmed.startsWith("(") && trimmed.endsWith(")");
  const cleaned = trimmed.replace(/[$,()\s]/g, "");

  if (!cleaned) {
    return null;
  }

  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return isNegative ? -parsed : parsed;
}

function buildAmountValue(row: Record<string, string>, mapping: CsvMapping) {
  if (mapping.amount) {
    const raw = row[mapping.amount] ?? "";
    const parsed = parseNumber(raw);
    return parsed === null ? raw.trim() : parsed.toFixed(2);
  }

  const debitValue = mapping.debit ? parseNumber(row[mapping.debit] ?? "") : null;
  const creditValue = mapping.credit ? parseNumber(row[mapping.credit] ?? "") : null;
  const computed = (creditValue ?? 0) - Math.abs(debitValue ?? 0);

  return computed.toFixed(2);
}

function isMappingValid(mapping: CsvMapping) {
  if (!mapping.date || !mapping.description) {
    return false;
  }

  if (!mapping.amount && !mapping.debit && !mapping.credit) {
    return false;
  }

  const chosen = [
    mapping.date,
    mapping.description,
    mapping.amount,
    mapping.debit,
    mapping.credit,
  ].filter(Boolean);

  return new Set(chosen).size === chosen.length;
}

function createTransformedCsvFile(draft: CsvDraft, mapping: CsvMapping) {
  const headerIndexMap = new Map(draft.headers.map((header, index) => [header, index]));
  const transformedRows = draft.rows
    .filter((row) => row.some((value) => value.trim().length > 0))
    .map((row) => {
      const rowRecord = Object.fromEntries(
        draft.headers.map((header) => [header, row[headerIndexMap.get(header) ?? -1] ?? ""])
      );

      return [
        rowRecord[mapping.date ?? ""]?.trim() ?? "",
        buildAmountValue(rowRecord, mapping),
        rowRecord[mapping.description ?? ""]?.trim() ?? "",
      ];
    });

  const lines = [
    ["Date", "Amount", "Description"].join(","),
    ...transformedRows.map((row) => row.map((value) => escapeCsvValue(value)).join(",")),
  ];

  return new File([lines.join("\n")], draft.file.name.replace(/\.csv$/i, "") + ".mapped.csv", {
    type: "text/csv",
  });
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

function getStepIndex(step: WizardStep) {
  if (step === "upload") {
    return 1;
  }

  if (step === "preview") {
    return 2;
  }

  if (step === "importing") {
    return 3;
  }

  return 4;
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
  const router = useRouter();
  const progressIntervalRef = useRef<number | null>(null);
  const [accountId, setAccountId] = useState<string>("");
  const [draft, setDraft] = useState<CsvDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mapping, setMapping] = useState<CsvMapping>(buildDefaultMapping([]));
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportBatchDetail | null>(null);
  const [step, setStep] = useState<WizardStep>("upload");

  useEffect(() => {
    if (!isOpen) {
      setAccountId("");
      setDraft(null);
      setError(null);
      setFile(null);
      setIsDragging(false);
      setIsSubmitting(false);
      setMapping(buildDefaultMapping([]));
      setProgress(0);
      setResult(null);
      setStep("upload");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isSubmitting) {
      if (progressIntervalRef.current) {
        window.clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }

      return;
    }

    progressIntervalRef.current = window.setInterval(() => {
      setProgress((current) => (current >= 88 ? current : current + 7));
    }, 220);

    return () => {
      if (progressIntervalRef.current) {
        window.clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [isSubmitting]);

  useEffect(() => {
    if (!draft) {
      return;
    }

    writeStoredMapping(draft.signature, mapping);
  }, [draft, mapping]);

  const previewRows = useMemo(() => draft?.rows.slice(0, 5) ?? [], [draft]);
  const isPreviewReady = Boolean(accountId && draft);
  const mappingIsValid = useMemo(() => isMappingValid(mapping), [mapping]);

  async function handleFileSelection(nextFile: File | null) {
    setError(null);
    setFile(nextFile);
    setResult(null);

    if (!nextFile) {
      setDraft(null);
      setMapping(buildDefaultMapping([]));
      return;
    }

    try {
      const content = await nextFile.text();
      const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

      if (lines.length < 2) {
        setDraft(null);
        setError("Choose a CSV with a header row and at least one data row.");
        return;
      }

      const headers = splitCsvLine(lines[0] ?? "").filter(Boolean);

      if (headers.length === 0) {
        setDraft(null);
        setError("The CSV header row is empty.");
        return;
      }

      const rows = lines.slice(1).map((line) => splitCsvLine(line));
      const signature = buildSignature(headers);
      const defaultMapping = buildDefaultMapping(headers);
      const storedMapping = readStoredMapping(signature, headers);
      const initialMapping = storedMapping ?? defaultMapping;

      setDraft({
        dateFormatLabel: detectDateFormatLabel(rows, headers, initialMapping),
        detectedLayoutLabel: detectCsvFormat(headers),
        file: nextFile,
        headers,
        rows,
        signature,
      });
      setMapping(initialMapping);
    } catch {
      setDraft(null);
      setError("Unable to read that CSV file.");
    }
  }

  function updateMapping(field: keyof CsvMapping, value: string) {
    const normalizedValue = value === "__none__" ? null : value;

    setMapping((current) => {
      const next = {
        ...current,
        [field]: normalizedValue,
      };

      if (field === "amount" && normalizedValue) {
        next.debit = null;
        next.credit = null;
      }

      if ((field === "debit" || field === "credit") && normalizedValue) {
        next.amount = null;
      }

      if (draft) {
        return normalizeMapping(next, draft.headers);
      }

      return next;
    });
  }

  async function handleImport() {
    if (!accountId) {
      setError("Choose the destination account before importing.");
      return;
    }

    if (!draft) {
      setError("Choose a CSV file to import.");
      return;
    }

    if (!mappingIsValid) {
      setError("Finish the column mapping before importing.");
      return;
    }

    setIsSubmitting(true);
    setProgress(12);
    setError(null);
    setStep("importing");

    try {
      const transformedFile = createTransformedCsvFile(draft, mapping);
      const batch = await onImport({
        accountId,
        file: transformedFile,
      });

      setProgress(100);
      setResult(batch);
      setStep("done");
    } catch (caughtError) {
      setStep("preview");
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
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV, confirm the mapping, and then import the cleaned rows into the selected
            account.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {(["upload", "preview", "importing", "done"] as const).map((value) => {
            const isActive = step === value;
            const isComplete = getStepIndex(step) > getStepIndex(value);

            return (
              <div
                key={value}
                className={[
                  "rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em]",
                  isActive
                    ? "border-primary-500 bg-primary-50 text-primary-700"
                    : isComplete
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-neutral-200 bg-neutral-50 text-neutral-500",
                ].join(" ")}
              >
                {value}
              </div>
            );
          })}
        </div>

        {step === "upload" ? (
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
                className={[
                  "flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed px-6 py-8 text-center transition",
                  isDragging
                    ? "border-primary-500 bg-primary-50"
                    : "border-neutral-300 bg-neutral-50 hover:border-neutral-500 hover:bg-white",
                ].join(" ")}
                htmlFor="transactions-csv-upload"
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragging(true);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  void handleFileSelection(event.dataTransfer.files[0] ?? null);
                }}
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
                  event.target.value = "";
                }}
              />
            </div>

            {draft ? (
              <div className="rounded-3xl border border-neutral-200 bg-white px-4 py-4">
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                  Detected layout
                </p>
                <p className="mt-2 text-lg font-semibold text-neutral-900">
                  {draft.detectedLayoutLabel}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {draft.headers.map((header) => (
                    <Badge key={header} variant="secondary">
                      {header}
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
              <Button
                disabled={!isPreviewReady}
                type="button"
                onClick={() => {
                  setError(null);
                  setStep("preview");
                }}
              >
                Continue to preview
              </Button>
            </div>
          </div>
        ) : null}

        {step === "preview" ? (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {(
                [
                  ["date", "Date"],
                  ["description", "Description"],
                  ["amount", "Amount"],
                  ["debit", "Debit"],
                  ["credit", "Credit"],
                ] as const
              ).map(([field, label]) => (
                <div key={field} className="space-y-2">
                  <Label htmlFor={`mapping-${field}`}>{label}</Label>
                  <Select
                    value={mapping[field] ?? "__none__"}
                    onValueChange={(value) => updateMapping(field, value)}
                  >
                    <SelectTrigger id={`mapping-${field}`}>
                      <SelectValue placeholder={label} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">
                        {field === "amount" || field === "debit" || field === "credit"
                          ? "Not used"
                          : `Choose ${label.toLowerCase()}`}
                      </SelectItem>
                      {(draft?.headers ?? []).map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant={mappingIsValid ? "success" : "warning"}>
                {mappingIsValid ? "Mapping ready" : "Finish required mapping"}
              </Badge>
              {draft?.dateFormatLabel ? (
                <Badge variant="secondary">Date format: {draft.dateFormatLabel}</Badge>
              ) : null}
            </div>

            <div className="rounded-3xl border border-neutral-200">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    {(draft?.headers ?? []).map((header) => (
                      <TableHead key={header}>{header}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, index) => (
                    <TableRow key={`${draft?.signature ?? "draft"}-${index}`}>
                      {(draft?.headers ?? []).map((header, headerIndex) => (
                        <TableCell key={header}>{row[headerIndex] ?? "—"}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <p className="text-sm text-neutral-600">
              Previewing the first 5 rows. The wizard will transform this file into the generic
              import layout before submitting it to the ledger service.
            </p>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="flex justify-between gap-2">
              <Button type="button" variant="ghost" onClick={() => setStep("upload")}>
                Back
              </Button>
              <Button disabled={!mappingIsValid} type="button" onClick={() => void handleImport()}>
                Import CSV
              </Button>
            </div>
          </div>
        ) : null}

        {step === "importing" ? (
          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-neutral-700">
                <span>Importing and validating rows</span>
                <span>{progress}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-neutral-200">
                <div
                  className="h-full rounded-full bg-primary-600 transition-[width]"
                  style={{ width: `${Math.max(progress, 8)}%` }}
                />
              </div>
            </div>
            <div className="rounded-3xl border border-neutral-200 bg-neutral-50 px-4 py-4 text-sm text-neutral-700">
              The CSV is being transformed, uploaded, and checked for duplicates before it lands in
              the selected account.
            </div>
          </div>
        ) : null}

        {step === "done" && result ? (
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
                <span className="font-semibold">
                  {result.filename ?? file?.name ?? "uploaded file"}
                </span>{" "}
                into{" "}
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
                  <div className="max-h-[320px] overflow-auto rounded-3xl border border-neutral-200">
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

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDraft(null);
                  setError(null);
                  setFile(null);
                  setMapping(buildDefaultMapping([]));
                  setProgress(0);
                  setResult(null);
                  setStep("upload");
                }}
              >
                Import another file
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  router.push("/transactions");
                }}
              >
                View transactions
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
