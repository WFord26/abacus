import type { ReportingExportStorage } from "../lib/storage";
import type { ReportingMetricsRepository } from "../repositories/reporting.repo";

function escapeCsvValue(value: string | number) {
  const stringValue = String(value);

  if (!/[",\n]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replaceAll('"', '""')}"`;
}

function buildCsvRow(columns: Array<string | number>) {
  return columns.map(escapeCsvValue).join(",");
}

export function buildTransactionsCsv(
  rows: Array<{
    accountName: string;
    amount: number;
    categoryName: string | null;
    date: string;
    description: string | null;
    merchantRaw: string | null;
    reviewStatus: string;
  }>
) {
  const lines = [
    buildCsvRow(["Date", "Description", "Merchant", "Account", "Category", "Amount", "Status"]),
    ...rows.map((row) =>
      buildCsvRow([
        row.date,
        row.description ?? "",
        row.merchantRaw ?? "",
        row.accountName,
        row.categoryName ?? "",
        row.amount.toFixed(2),
        row.reviewStatus,
      ])
    ),
  ];

  return `${lines.join("\n")}\n`;
}

export function createReportingCsvExportProcessor(
  repository: ReportingMetricsRepository,
  storage: ReportingExportStorage
) {
  return {
    async run(input: {
      jobId: string;
      organizationId: string;
      userId: string;
    }): Promise<{ filename: string; key: string }> {
      const rows = await repository.listTransactionsForExport(input.organizationId);
      const csv = buildTransactionsCsv(rows);
      const generatedAt = new Date().toISOString().replaceAll(":", "-");
      const key = `reports/${input.organizationId}/exports/${input.jobId}.csv`;
      const filename = `transactions-export-${generatedAt}.csv`;

      await storage.putObject({
        body: Buffer.from(csv, "utf8"),
        contentType: "text/csv; charset=utf-8",
        key,
      });

      return {
        filename,
        key,
      };
    },
  };
}
