import { randomUUID } from "node:crypto";

import { createEvent } from "@wford26/event-contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createReportingEventProcessor } from "../../src/services/event-processor";

import type {
  LedgerExpenseTransactionRow,
  ReportingMetricAggregateInput,
  ReportingMetricsRepository,
} from "../../src/repositories/reporting.repo";

const organizationId = randomUUID();
const userId = randomUUID();

type TestState = {
  aggregates: ReportingMetricAggregateInput[];
  rows: LedgerExpenseTransactionRow[];
};

function createRepository(state: TestState): ReportingMetricsRepository {
  return {
    async listLedgerExpenseTransactionsForOrganization(requestedOrganizationId) {
      expect(requestedOrganizationId).toBe(organizationId);
      return state.rows;
    },
    async listMetricAggregatesForOrganizationPeriod() {
      return [];
    },
    async replaceMetricAggregatesForOrganization(requestedOrganizationId, aggregates) {
      expect(requestedOrganizationId).toBe(organizationId);
      state.aggregates = aggregates;
    },
  };
}

function findAggregate(state: TestState, metricKey: string) {
  return state.aggregates.find((aggregate) => aggregate.metricKey === metricKey) ?? null;
}

describe("reporting event processor", () => {
  let state: TestState;

  beforeEach(() => {
    state = {
      aggregates: [],
      rows: [
        {
          amount: -42.5,
          categoryId: "category-food",
          categoryName: "Food & Dining",
          date: "2026-03-10",
          merchantRaw: "Coffee Shop",
        },
        {
          amount: -9.75,
          categoryId: null,
          categoryName: null,
          date: "2026-03-11",
          merchantRaw: null,
        },
        {
          amount: 1800,
          categoryId: "category-income",
          categoryName: "Revenue",
          date: "2026-03-15",
          merchantRaw: "Invoice Payment",
        },
      ],
    };
  });

  it("rebuilds expense metrics on transaction.created", async () => {
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    };
    const processor = createReportingEventProcessor(createRepository(state), logger);

    await processor.process(
      createEvent("transaction.created", organizationId, userId, {
        accountId: randomUUID(),
        amount: -42.5,
        categoryId: "category-food",
        date: "2026-03-10",
        description: "Morning coffee",
        merchantRaw: "Coffee Shop",
        transactionId: randomUUID(),
      })
    );

    expect(findAggregate(state, "total_expenses:2026-03")?.value).toBe(52.25);
    expect(findAggregate(state, "category_spend:category-food:2026-03")?.value).toBe(42.5);
    expect(findAggregate(state, "category_spend:uncategorized:2026-03")?.value).toBe(9.75);
    expect(findAggregate(state, "vendor_spend:coffee-shop:2026-03")?.value).toBe(42.5);
    expect(findAggregate(state, "vendor_spend:unknown-merchant:2026-03")?.value).toBe(9.75);
    expect(findAggregate(state, "category_spend:category-food:2026-03")?.metadata).toMatchObject({
      transactionCount: 1,
    });
    expect(findAggregate(state, "vendor_spend:coffee-shop:2026-03")?.metadata).toMatchObject({
      transactionCount: 1,
    });
  });

  it("stays idempotent when transaction.updated is replayed", async () => {
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    };
    const processor = createReportingEventProcessor(createRepository(state), logger);

    state.rows = [
      {
        amount: -100,
        categoryId: "category-software",
        categoryName: "Software",
        date: "2026-03-18",
        merchantRaw: "Linear",
      },
    ];

    const event = createEvent("transaction.updated", organizationId, userId, {
      changes: {
        amount: -100,
        categoryId: "category-software",
        merchantRaw: "Linear",
      },
      transactionId: randomUUID(),
    });

    await processor.process(event);
    await processor.process(event);

    expect(findAggregate(state, "total_expenses:2026-03")?.value).toBe(100);
    expect(findAggregate(state, "category_spend:category-software:2026-03")?.value).toBe(100);
    expect(findAggregate(state, "vendor_spend:linear:2026-03")?.value).toBe(100);
    expect(
      findAggregate(state, "category_spend:category-software:2026-03")?.metadata
    ).toMatchObject({
      transactionCount: 1,
    });
    expect(state.aggregates).toHaveLength(3);
  });

  it("rebuilds metrics after expense.categorized", async () => {
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    };
    const processor = createReportingEventProcessor(createRepository(state), logger);

    state.rows = [
      {
        amount: -18.25,
        categoryId: "category-travel",
        categoryName: "Travel",
        date: "2026-04-01",
        merchantRaw: "Uber",
      },
    ];

    await processor.process(
      createEvent("expense.categorized", organizationId, userId, {
        categoryId: "category-travel",
        ruleApplied: false,
        transactionId: randomUUID(),
      })
    );

    expect(findAggregate(state, "category_spend:category-travel:2026-04")?.value).toBe(18.25);
    expect(findAggregate(state, "vendor_spend:uber:2026-04")?.value).toBe(18.25);
  });

  it("accepts account.reconciled without mutating aggregates yet", async () => {
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    };
    const processor = createReportingEventProcessor(createRepository(state), logger);

    await processor.process(
      createEvent("account.reconciled", organizationId, userId, {
        accountId: randomUUID(),
        period: "2026-03",
        reconciliationSessionId: randomUUID(),
      })
    );

    expect(state.aggregates).toEqual([]);
    expect(logger.info).toHaveBeenCalled();
  });

  it("accepts invoice.paid without mutating aggregates yet", async () => {
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    };
    const processor = createReportingEventProcessor(createRepository(state), logger);

    await processor.process(
      createEvent("invoice.paid", organizationId, userId, {
        amount: 2400,
        customerId: randomUUID(),
        invoiceId: randomUUID(),
        paidAt: "2026-03-25T12:00:00.000Z",
      })
    );

    expect(state.aggregates).toEqual([]);
    expect(logger.info).toHaveBeenCalled();
  });
});
