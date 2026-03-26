import { describe, expect, it } from "vitest";

import { buildTransactionsCsv } from "../../src/services/report-exports.service";

describe("reporting csv export builder", () => {
  it("renders the expected headers and escapes commas and quotes", () => {
    const csv = buildTransactionsCsv([
      {
        accountName: "Checking Account",
        amount: -42.5,
        categoryName: "Meals, Travel",
        date: "2026-03-25",
        description: 'Team "coffee"',
        merchantRaw: "Coffee Shop",
        reviewStatus: "reviewed",
      },
    ]);

    expect(csv).toBe(
      [
        "Date,Description,Merchant,Account,Category,Amount,Status",
        '2026-03-25,"Team ""coffee""",Coffee Shop,Checking Account,"Meals, Travel",-42.50,reviewed',
        "",
      ].join("\n")
    );
  });
});
