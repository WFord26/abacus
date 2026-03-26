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
});
