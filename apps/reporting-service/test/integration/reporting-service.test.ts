import { randomUUID } from "node:crypto";

import { signToken } from "@wford26/auth-sdk";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildReportingServiceApp } from "../../src/app";

import type { ReportingEventSubscriber } from "../../src/lib/events";
import type {
  ReportingMetricAggregate,
  ReportingMetricsRepository,
} from "../../src/repositories/reporting.repo";

const JWT_SECRET = "reporting-test-secret";

type RepoState = {
  metrics: ReportingMetricAggregate[];
};

function createRepository(state: RepoState): ReportingMetricsRepository {
  return {
    async listLedgerExpenseTransactionsForOrganization() {
      return [];
    },
    async listMetricAggregatesForOrganizationPeriod(organizationId, period) {
      return state.metrics.filter(
        (metric) => metric.organizationId === organizationId && metric.period === period
      );
    },
    async replaceMetricAggregatesForOrganization() {
      return;
    },
  };
}

function createNoopSubscriber(): ReportingEventSubscriber {
  return {
    async start() {
      return;
    },
    async stop() {
      return;
    },
  };
}

function createMetric(input: {
  computedAt?: string;
  metricKey: string;
  metadata?: Record<string, string | number | boolean | null> | null;
  organizationId: string;
  period: string;
  value: number;
}): ReportingMetricAggregate {
  return {
    computedAt: input.computedAt ?? new Date().toISOString(),
    id: randomUUID(),
    metadata: input.metadata ?? null,
    metricKey: input.metricKey,
    organizationId: input.organizationId,
    period: input.period,
    value: input.value,
  };
}

describe("reporting service pnl route", () => {
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const userId = randomUUID();
  let state: RepoState;

  beforeEach(() => {
    state = {
      metrics: [],
    };
  });

  afterEach(async () => {
    // no-op placeholder for parity with other suites
  });

  function createAccessToken(overrides: Partial<{ organizationId: string }> = {}) {
    return signToken(
      {
        email: "viewer@example.com",
        organizationId: overrides.organizationId ?? organizationId,
        role: "viewer",
        userId,
      },
      JWT_SECRET,
      "1h"
    );
  }

  it("returns an empty pnl report for periods with no aggregates", async () => {
    const app = buildReportingServiceApp({
      eventSubscriber: createNoopSubscriber(),
      jwtSecret: JWT_SECRET,
      repository: createRepository(state),
    });

    await app.ready();

    const response = await request(app.server)
      .get("/reports/pnl?period=2026-12")
      .set("authorization", `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      expenses: [],
      income: [],
      netIncome: 0,
      period: "2026-12",
      totalExpenses: 0,
      totalIncome: 0,
    });

    await app.close();
  });

  it("returns pnl data from reporting.metric_aggregates for the caller organization", async () => {
    state.metrics = [
      createMetric({
        computedAt: "2026-03-25T10:00:00.000Z",
        metricKey: "total_expenses:2026-03",
        organizationId,
        period: "2026-03",
        value: 8340.5,
      }),
      createMetric({
        computedAt: "2026-03-25T11:00:00.000Z",
        metricKey: "category_spend:software:2026-03",
        metadata: {
          categoryId: "software",
          categoryName: "Software & Subscriptions",
        },
        organizationId,
        period: "2026-03",
        value: 2400,
      }),
      createMetric({
        computedAt: "2026-03-25T11:30:00.000Z",
        metricKey: "category_spend:travel:2026-03",
        metadata: {
          categoryId: "travel",
          categoryName: "Travel",
        },
        organizationId,
        period: "2026-03",
        value: 1200,
      }),
      createMetric({
        metricKey: "total_expenses:2026-03",
        organizationId: otherOrganizationId,
        period: "2026-03",
        value: 9999,
      }),
    ];

    const app = buildReportingServiceApp({
      eventSubscriber: createNoopSubscriber(),
      jwtSecret: JWT_SECRET,
      repository: createRepository(state),
    });

    await app.ready();

    const response = await request(app.server)
      .get("/reports/pnl?period=2026-03")
      .set("authorization", `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      expenses: [
        {
          amount: 2400,
          categoryId: "software",
          categoryName: "Software & Subscriptions",
        },
        {
          amount: 1200,
          categoryId: "travel",
          categoryName: "Travel",
        },
      ],
      income: [],
      netIncome: -8340.5,
      period: "2026-03",
      totalExpenses: 8340.5,
      totalIncome: 0,
    });
    expect(response.body.data.generatedAt).toBe("2026-03-25T11:30:00.000Z");

    await app.close();
  });

  it("rejects invalid period formats", async () => {
    const app = buildReportingServiceApp({
      eventSubscriber: createNoopSubscriber(),
      jwtSecret: JWT_SECRET,
      repository: createRepository(state),
    });

    await app.ready();

    const response = await request(app.server)
      .get("/reports/pnl?period=2026-3")
      .set("authorization", `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("BAD_REQUEST");

    await app.close();
  });

  it("returns expense-by-category percentages that sum to 100 with transaction counts", async () => {
    state.metrics = [
      createMetric({
        computedAt: "2026-03-25T11:30:00.000Z",
        metricKey: "category_spend:software:2026-03",
        metadata: {
          categoryId: "software",
          categoryName: "Software & Subscriptions",
          transactionCount: 3,
        },
        organizationId,
        period: "2026-03",
        value: 3000,
      }),
      createMetric({
        computedAt: "2026-03-25T11:31:00.000Z",
        metricKey: "category_spend:travel:2026-03",
        metadata: {
          categoryId: "travel",
          categoryName: "Travel",
          transactionCount: 2,
        },
        organizationId,
        period: "2026-03",
        value: 2000,
      }),
      createMetric({
        computedAt: "2026-03-25T11:32:00.000Z",
        metricKey: "category_spend:uncategorized:2026-03",
        metadata: {
          categoryId: null,
          categoryName: "Uncategorized",
          transactionCount: 1,
        },
        organizationId,
        period: "2026-03",
        value: 1000,
      }),
    ];

    const app = buildReportingServiceApp({
      eventSubscriber: createNoopSubscriber(),
      jwtSecret: JWT_SECRET,
      repository: createRepository(state),
    });

    await app.ready();

    const response = await request(app.server)
      .get("/reports/expenses-by-category?period=2026-03&limit=3")
      .set("authorization", `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.data.categories).toEqual([
      {
        amount: 3000,
        categoryId: "software",
        categoryName: "Software & Subscriptions",
        percentage: 50,
        transactionCount: 3,
      },
      {
        amount: 2000,
        categoryId: "travel",
        categoryName: "Travel",
        percentage: 33.33,
        transactionCount: 2,
      },
      {
        amount: 1000,
        categoryId: null,
        categoryName: "Uncategorized",
        percentage: 16.67,
        transactionCount: 1,
      },
    ]);
    expect(
      response.body.data.categories.reduce(
        (sum: number, category: { percentage: number }) => sum + category.percentage,
        0
      )
    ).toBe(100);

    await app.close();
  });

  it("returns vendor spend ordered by amount and respects limit", async () => {
    state.metrics = [
      createMetric({
        computedAt: "2026-03-25T11:30:00.000Z",
        metricKey: "vendor_spend:delta:2026-03",
        metadata: {
          merchantKey: "delta",
          merchantName: "Delta",
          transactionCount: 1,
        },
        organizationId,
        period: "2026-03",
        value: 850,
      }),
      createMetric({
        computedAt: "2026-03-25T11:31:00.000Z",
        metricKey: "vendor_spend:uber:2026-03",
        metadata: {
          merchantKey: "uber",
          merchantName: "Uber",
          transactionCount: 4,
        },
        organizationId,
        period: "2026-03",
        value: 420,
      }),
      createMetric({
        computedAt: "2026-03-25T11:32:00.000Z",
        metricKey: "vendor_spend:coffee-shop:2026-03",
        metadata: {
          merchantKey: "coffee-shop",
          merchantName: "Coffee Shop",
          transactionCount: 3,
        },
        organizationId,
        period: "2026-03",
        value: 120,
      }),
    ];

    const app = buildReportingServiceApp({
      eventSubscriber: createNoopSubscriber(),
      jwtSecret: JWT_SECRET,
      repository: createRepository(state),
    });

    await app.ready();

    const response = await request(app.server)
      .get("/reports/vendor-spend?period=2026-03&limit=2")
      .set("authorization", `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.data.vendors).toEqual([
      {
        amount: 850,
        merchantName: "Delta",
        transactionCount: 1,
      },
      {
        amount: 420,
        merchantName: "Uber",
        transactionCount: 4,
      },
    ]);

    await app.close();
  });
});
