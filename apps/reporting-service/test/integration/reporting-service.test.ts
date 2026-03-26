import { randomUUID } from "node:crypto";

import { signToken } from "@wford26/auth-sdk";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildReportingServiceApp } from "../../src/app";
import { createInMemoryReportingDashboardCache } from "../../src/lib/cache";

import type { ReportingEventSubscriber } from "../../src/lib/events";
import type { ReportingExportJobQueue } from "../../src/lib/export-queue";
import type {
  DashboardLedgerSnapshot,
  ReportingMetricAggregate,
  ReportingMetricsRepository,
  ReportExportTransactionRow,
} from "../../src/repositories/reporting.repo";
import type { ReportExportJobResponse, ReportExportJobStatus } from "@wford26/shared-types";

const JWT_SECRET = "reporting-test-secret";

type RepoState = {
  dashboardLookupCount: number;
  dashboardSnapshot: DashboardLedgerSnapshot;
  exportRows: ReportExportTransactionRow[];
  metricLookupCount: number;
  metrics: ReportingMetricAggregate[];
};

function createRepository(state: RepoState): ReportingMetricsRepository {
  return {
    async getDashboardLedgerSnapshot() {
      state.dashboardLookupCount += 1;
      return state.dashboardSnapshot;
    },
    async listLedgerExpenseTransactionsForOrganization() {
      return [];
    },
    async listMetricAggregatesForOrganizationPeriod(organizationId, period) {
      state.metricLookupCount += 1;
      return state.metrics.filter(
        (metric) => metric.organizationId === organizationId && metric.period === period
      );
    },
    async listTransactionsForExport() {
      return state.exportRows;
    },
    async replaceMetricAggregatesForOrganization() {
      return;
    },
  };
}

type ExportQueueState = {
  jobs: Map<
    string,
    ReportExportJobResponse & {
      organizationId: string;
    }
  >;
};

function createExportQueue(state: ExportQueueState): ReportingExportJobQueue {
  return {
    async enqueueCsvExport(input) {
      const jobId = randomUUID();
      state.jobs.set(jobId, {
        createdAt: "2026-03-25T12:00:00.000Z",
        errorMessage: null,
        jobId,
        organizationId: input.organizationId,
        status: "pending",
      });

      return {
        jobId,
        status: "pending",
      };
    },

    async getCsvExportJob(jobId, organizationId) {
      const job = state.jobs.get(jobId);

      if (!job || job.organizationId !== organizationId) {
        return null;
      }

      const { organizationId: _organizationId, ...response } = job;
      return response;
    },

    async start() {
      return;
    },

    async stop() {
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
  let exportQueueState: ExportQueueState;

  beforeEach(() => {
    state = {
      dashboardLookupCount: 0,
      dashboardSnapshot: {
        accountBalances: [],
        recentTransactions: [],
        uncategorizedCount: 0,
        unreviewedCount: 0,
      },
      exportRows: [],
      metricLookupCount: 0,
      metrics: [],
    };
    exportQueueState = {
      jobs: new Map(),
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
      dashboardCache: createInMemoryReportingDashboardCache(),
      eventSubscriber: createNoopSubscriber(),
      exportQueue: createExportQueue(exportQueueState),
      jwtSecret: JWT_SECRET,
      now: () => new Date("2026-03-25T12:00:00.000Z"),
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
      dashboardCache: createInMemoryReportingDashboardCache(),
      eventSubscriber: createNoopSubscriber(),
      exportQueue: createExportQueue(exportQueueState),
      jwtSecret: JWT_SECRET,
      now: () => new Date("2026-03-25T12:00:00.000Z"),
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
      dashboardCache: createInMemoryReportingDashboardCache(),
      eventSubscriber: createNoopSubscriber(),
      exportQueue: createExportQueue(exportQueueState),
      jwtSecret: JWT_SECRET,
      now: () => new Date("2026-03-25T12:00:00.000Z"),
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
      dashboardCache: createInMemoryReportingDashboardCache(),
      eventSubscriber: createNoopSubscriber(),
      exportQueue: createExportQueue(exportQueueState),
      jwtSecret: JWT_SECRET,
      now: () => new Date("2026-03-25T12:00:00.000Z"),
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
      dashboardCache: createInMemoryReportingDashboardCache(),
      eventSubscriber: createNoopSubscriber(),
      exportQueue: createExportQueue(exportQueueState),
      jwtSecret: JWT_SECRET,
      now: () => new Date("2026-03-25T12:00:00.000Z"),
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

  it("returns a cached dashboard summary composed from metrics and ledger snapshot data", async () => {
    state.metrics = [
      createMetric({
        computedAt: "2026-03-25T10:00:00.000Z",
        metricKey: "total_expenses:2026-03",
        organizationId,
        period: "2026-03",
        value: 1200,
      }),
      createMetric({
        computedAt: "2026-03-25T10:05:00.000Z",
        metricKey: "total_expenses:2026-02",
        organizationId,
        period: "2026-02",
        value: 1000,
      }),
      createMetric({
        computedAt: "2026-03-25T10:10:00.000Z",
        metricKey: "category_spend:software:2026-03",
        metadata: {
          categoryId: "software",
          categoryName: "Software",
        },
        organizationId,
        period: "2026-03",
        value: 700,
      }),
    ];
    state.dashboardSnapshot = {
      accountBalances: [
        {
          accountId: "account-1",
          accountName: "Checking Account",
          accountType: "cash",
          asOf: "2026-03-25T12:00:00.000Z",
          balance: 4500,
        },
      ],
      recentTransactions: [
        {
          accountId: "account-1",
          accountName: "Checking Account",
          amount: -42.5,
          categoryId: "software",
          categoryName: "Software",
          createdAt: "2026-03-24T12:00:00.000Z",
          date: "2026-03-24",
          description: "Monthly tool",
          id: "txn-1",
          merchantRaw: "Linear",
          reviewStatus: "reviewed",
        },
      ],
      uncategorizedCount: 2,
      unreviewedCount: 4,
    };
    const app = buildReportingServiceApp({
      dashboardCache: createInMemoryReportingDashboardCache(),
      eventSubscriber: createNoopSubscriber(),
      exportQueue: createExportQueue(exportQueueState),
      jwtSecret: JWT_SECRET,
      now: () => new Date("2026-03-25T12:00:00.000Z"),
      repository: createRepository(state),
    });

    await app.ready();

    const firstResponse = await request(app.server)
      .get("/reports/dashboard")
      .set("authorization", `Bearer ${createAccessToken()}`);
    const secondResponse = await request(app.server)
      .get("/reports/dashboard")
      .set("authorization", `Bearer ${createAccessToken()}`);

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.data).toMatchObject({
      currentMonth: {
        expenseTrend: 20,
        period: "2026-03",
        topCategory: {
          amount: 700,
          categoryId: "software",
          name: "Software",
        },
        totalExpenses: 1200,
      },
      unreviewedCount: 4,
      uncategorizedCount: 2,
    });
    expect(firstResponse.body.data.accountBalances).toHaveLength(1);
    expect(firstResponse.body.data.recentTransactions).toHaveLength(1);
    expect(secondResponse.status).toBe(200);
    expect(state.metricLookupCount).toBe(2);
    expect(state.dashboardLookupCount).toBe(1);

    await app.close();
  });

  it("starts and returns csv export jobs for the caller organization", async () => {
    const app = buildReportingServiceApp({
      dashboardCache: createInMemoryReportingDashboardCache(),
      eventSubscriber: createNoopSubscriber(),
      exportQueue: createExportQueue(exportQueueState),
      jwtSecret: JWT_SECRET,
      now: () => new Date("2026-03-25T12:00:00.000Z"),
      repository: createRepository(state),
    });

    await app.ready();

    const createResponse = await request(app.server)
      .post("/reports/export/csv")
      .set("authorization", `Bearer ${createAccessToken()}`);

    expect(createResponse.status).toBe(202);
    expect(createResponse.body.data.status).toBe("pending");

    const jobId = createResponse.body.data.jobId as string;
    const existingJob = exportQueueState.jobs.get(jobId);

    expect(existingJob).toBeDefined();

    exportQueueState.jobs.set(jobId, {
      completedAt: "2026-03-25T12:01:00.000Z",
      createdAt: existingJob!.createdAt,
      downloadUrl: "https://downloads.test/reports/export.csv",
      downloadUrlExpiresAt: "2026-03-25T13:01:00.000Z",
      errorMessage: null,
      jobId,
      organizationId,
      status: "complete",
    });

    const statusResponse = await request(app.server)
      .get(`/reports/export/${jobId}`)
      .set("authorization", `Bearer ${createAccessToken()}`);

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.data).toMatchObject({
      downloadUrl: "https://downloads.test/reports/export.csv",
      jobId,
      status: "complete",
    });

    await app.close();
  });

  it("does not expose export jobs across organizations", async () => {
    const foreignJobId = randomUUID();
    exportQueueState.jobs.set(foreignJobId, {
      createdAt: "2026-03-25T12:00:00.000Z",
      errorMessage: null,
      jobId: foreignJobId,
      organizationId: otherOrganizationId,
      status: "pending" as ReportExportJobStatus,
    });
    const app = buildReportingServiceApp({
      dashboardCache: createInMemoryReportingDashboardCache(),
      eventSubscriber: createNoopSubscriber(),
      exportQueue: createExportQueue(exportQueueState),
      jwtSecret: JWT_SECRET,
      now: () => new Date("2026-03-25T12:00:00.000Z"),
      repository: createRepository(state),
    });

    await app.ready();

    const response = await request(app.server)
      .get(`/reports/export/${foreignJobId}`)
      .set("authorization", `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(404);

    await app.close();
  });
});
