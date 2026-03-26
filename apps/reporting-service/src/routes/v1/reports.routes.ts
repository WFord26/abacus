import { success } from "../../lib/response";

import type { ReportingReportsService } from "../../services/reports.service";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

type ReportsRoutesOptions = {
  service: ReportingReportsService;
};

function isValidPeriod(period: string | undefined): period is string {
  return typeof period === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
}

function parseLimit(value: unknown, fallback: number) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    return null;
  }

  return parsed;
}

function parseJobId(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value;
}

type ValidatedPeriodRequest = {
  period: string;
  query: Record<string, unknown>;
  user: NonNullable<FastifyRequest["user"]>;
};

const reportsRoutes: FastifyPluginAsync<ReportsRoutesOptions> = async (fastify, options) => {
  async function validatePeriodRequest(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<ValidatedPeriodRequest | undefined> {
    const period =
      typeof request.query === "object" && request.query
        ? (request.query as Record<string, unknown>).period
        : undefined;

    if (!request.user) {
      reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
          statusCode: 401,
        },
      });
      return;
    }

    if (!isValidPeriod(typeof period === "string" ? period : undefined)) {
      reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Query parameter period must be in YYYY-MM format",
          statusCode: 400,
        },
      });
      return;
    }

    const validatedPeriod = period as string;

    return {
      period: validatedPeriod,
      query:
        typeof request.query === "object" && request.query
          ? (request.query as Record<string, unknown>)
          : {},
      user: request.user,
    };
  }

  fastify.get("/reports/pnl", async (request, reply) => {
    const validated = await validatePeriodRequest(request, reply);

    if (!validated) {
      return;
    }

    const report = await options.service.getPnlReport(
      validated.user.organizationId,
      validated.period
    );
    reply.send(success(report));
  });

  fastify.get("/reports/expenses-by-category", async (request, reply) => {
    const validated = await validatePeriodRequest(request, reply);

    if (!validated) {
      return;
    }

    const limit = parseLimit(validated.query.limit, 10);

    if (limit === null) {
      reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Query parameter limit must be an integer between 1 and 100",
          statusCode: 400,
        },
      });
      return;
    }

    const report = await options.service.getExpenseByCategoryReport(
      validated.user.organizationId,
      validated.period,
      limit
    );
    reply.send(success(report));
  });

  fastify.get("/reports/vendor-spend", async (request, reply) => {
    const validated = await validatePeriodRequest(request, reply);

    if (!validated) {
      return;
    }

    const limit = parseLimit(validated.query.limit, 20);

    if (limit === null) {
      reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Query parameter limit must be an integer between 1 and 100",
          statusCode: 400,
        },
      });
      return;
    }

    const report = await options.service.getVendorSpendReport(
      validated.user.organizationId,
      validated.period,
      limit
    );
    reply.send(success(report));
  });

  fastify.get("/reports/dashboard", async (request, reply) => {
    if (!request.user) {
      reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
          statusCode: 401,
        },
      });
      return;
    }

    const report = await options.service.getDashboardSummary(request.user.organizationId);
    reply.send(success(report));
  });

  fastify.post("/reports/export/csv", async (request, reply) => {
    if (!request.user) {
      reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
          statusCode: 401,
        },
      });
      return;
    }

    const exportJob = await options.service.createCsvExportJob(
      request.user.organizationId,
      request.user.userId
    );
    reply.status(202).send(success(exportJob));
  });

  fastify.get("/reports/export/:jobId", async (request, reply) => {
    if (!request.user) {
      reply.status(401).send({
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
          statusCode: 401,
        },
      });
      return;
    }

    const params =
      typeof request.params === "object" && request.params
        ? (request.params as Record<string, unknown>)
        : {};
    const jobId = parseJobId(params.jobId);

    if (!jobId) {
      reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Route parameter jobId is required",
          statusCode: 400,
        },
      });
      return;
    }

    const exportJob = await options.service.getCsvExportJob(jobId, request.user.organizationId);

    if (!exportJob) {
      reply.status(404).send({
        error: {
          code: "NOT_FOUND",
          message: "Export job not found",
          statusCode: 404,
        },
      });
      return;
    }

    reply.send(success(exportJob));
  });
};

export default reportsRoutes;
