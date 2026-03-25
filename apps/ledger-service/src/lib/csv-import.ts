type CsvFormat = {
  amountIndex?: number;
  creditIndex?: number;
  dateIndex: number;
  debitIndex?: number;
  descriptionIndex: number;
};

export type ParsedCsvTransactionRow =
  | {
      amount: number;
      date: string;
      description: string | null;
      rowNumber: number;
      status: "ready";
    }
  | {
      amount: null;
      date: null;
      description: string | null;
      message: string;
      rowNumber: number;
      status: "error";
    }
  | {
      amount: 0;
      date: string;
      description: string | null;
      message: string;
      rowNumber: number;
      status: "skipped";
    };

function normalizeHeader(value: string) {
  return value
    .trim()
    .replace(/^\uFEFF/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseCsv(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentField += '"';
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentField);
      currentField = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentField = "";
      currentRow = [];
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0));
}

function findHeaderIndex(headers: string[], candidates: readonly string[]) {
  return headers.findIndex((header) => candidates.includes(header));
}

function detectFormat(headerRow: string[]): CsvFormat | null {
  const headers = headerRow.map(normalizeHeader);
  const dateIndex = findHeaderIndex(headers, [
    "date",
    "posted date",
    "posting date",
    "transaction date",
  ]);
  const descriptionIndex = findHeaderIndex(headers, [
    "description",
    "details",
    "detail",
    "memo",
    "name",
    "transaction description",
    "original description",
  ]);

  if (dateIndex === -1 || descriptionIndex === -1) {
    return null;
  }

  const amountIndex = findHeaderIndex(headers, ["amount", "amt"]);

  if (amountIndex !== -1) {
    return {
      amountIndex,
      dateIndex,
      descriptionIndex,
    };
  }

  const debitIndex = findHeaderIndex(headers, ["debit", "debits", "withdrawal", "withdrawals"]);
  const creditIndex = findHeaderIndex(headers, ["credit", "credits", "deposit", "deposits"]);

  if (debitIndex !== -1 || creditIndex !== -1) {
    return {
      ...(creditIndex !== -1 ? { creditIndex } : {}),
      dateIndex,
      ...(debitIndex !== -1 ? { debitIndex } : {}),
      descriptionIndex,
    };
  }

  return null;
}

function parseDate(rawValue: string): string | null {
  const value = rawValue.trim();

  if (!value) {
    return null;
  }

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${month}-${day}`;
  }

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!slashMatch) {
    return null;
  }

  const month = slashMatch[1]!;
  const day = slashMatch[2]!;
  const year = slashMatch[3]!;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseAmount(rawValue: string): number | null {
  const value = rawValue.trim();

  if (!value) {
    return null;
  }

  const isNegativeByParens = value.startsWith("(") && value.endsWith(")");
  const normalized = value.replace(/[$,\s()]/g, "");
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return isNegativeByParens ? -Math.abs(parsed) : parsed;
}

function parseRow(format: CsvFormat, row: string[], rowNumber: number): ParsedCsvTransactionRow {
  const description = row[format.descriptionIndex]?.trim() || null;
  const date = parseDate(row[format.dateIndex] ?? "");

  if (!date) {
    return {
      amount: null,
      date: null,
      description,
      message: "Date must use YYYY-MM-DD or M/D/YYYY format",
      rowNumber,
      status: "error",
    };
  }

  let amount: number | null = null;

  if (format.amountIndex !== undefined) {
    amount = parseAmount(row[format.amountIndex] ?? "");
  } else {
    const debit =
      format.debitIndex !== undefined ? parseAmount(row[format.debitIndex] ?? "") : null;
    const credit =
      format.creditIndex !== undefined ? parseAmount(row[format.creditIndex] ?? "") : null;

    if (debit !== null && credit !== null) {
      amount = credit - Math.abs(debit);
    } else if (credit !== null) {
      amount = credit;
    } else if (debit !== null) {
      amount = -Math.abs(debit);
    }
  }

  if (amount === null) {
    return {
      amount: null,
      date: null,
      description,
      message: "Amount is required",
      rowNumber,
      status: "error",
    };
  }

  if (amount === 0) {
    return {
      amount: 0,
      date,
      description,
      message: "Skipped zero-amount row",
      rowNumber,
      status: "skipped",
    };
  }

  return {
    amount: Math.round(amount * 100) / 100,
    date,
    description,
    rowNumber,
    status: "ready",
  };
}

export function parseTransactionCsv(text: string): ParsedCsvTransactionRow[] {
  const rows = parseCsv(text);

  if (rows.length < 2) {
    throw new Error("CSV must include a header row and at least one data row");
  }

  const format = detectFormat(rows[0]!);

  if (!format) {
    throw new Error("Unsupported CSV format");
  }

  return rows.slice(1).map((row, index) => parseRow(format, row, index + 2));
}
