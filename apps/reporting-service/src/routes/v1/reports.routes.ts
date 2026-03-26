import { success } from "../../lib/response";

import type { ReportingReportsService } from "../../services/reports.service";
import type { FastifyPluginAsync } from "fastify";

type ReportsRoutesOptions = {
  service: ReportingReportsService;
};

function isValidPeriod(period: string | undefined): period is string {
  return typeof period === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
}

const reportsRoutes: FastifyPluginAsync<ReportsRoutesOptions> = async (fastify, options) => {
  fastify.get("/reports/pnl", async (request, reply) => {
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

    const validatedPeriod = typeof period === "string" ? period : undefined;

    if (!validatedPeriod) {
      reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Query parameter period must be in YYYY-MM format",
          statusCode: 400,
        },
      });
      return;
    }

    const report = await options.service.getPnlReport(request.user.organizationId, validatedPeriod);
    reply.send(success(report));
  });
};

export default reportsRoutes;
