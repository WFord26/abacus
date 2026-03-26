import { fastifyAuthPlugin, type AuthError } from "@wford26/auth-sdk";
import Fastify from "fastify";

import {
  createNoopReportingEventSubscriber,
  createRedisReportingEventSubscriber,
  type ReportingEventSubscriber,
} from "./lib/events";
import databasePlugin from "./plugins/database";
import {
  createPrismaReportingMetricsRepository,
  type ReportingMetricsRepository,
} from "./repositories/reporting.repo";
import reportsRoutes from "./routes/v1/reports.routes";
import {
  createReportingEventProcessor,
  type ReportingEventProcessor,
} from "./services/event-processor";
import { createReportingReportsService } from "./services/reports.service";

import type { PrismaClient } from "@prisma/client";

export type BuildReportingServiceOptions = {
  db?: PrismaClient;
  eventProcessor?: ReportingEventProcessor;
  eventSubscriber?: ReportingEventSubscriber;
  jwtSecret?: string;
  repository?: ReportingMetricsRepository;
};

function buildErrorResponse(error: {
  code: string;
  details?: Record<string, string | number | boolean | null>;
  message: string;
  statusCode: number;
}) {
  return {
    error: {
      code: error.code,
      message: error.message,
      statusCode: error.statusCode,
      ...(error.details ? { details: error.details } : {}),
    },
  };
}

function getRepository(
  repositoryOverride: ReportingMetricsRepository | undefined,
  dbOverride: PrismaClient | undefined,
  appDb: PrismaClient | undefined
) {
  if (repositoryOverride) {
    return repositoryOverride;
  }

  if (dbOverride) {
    return createPrismaReportingMetricsRepository(dbOverride);
  }

  if (appDb) {
    return createPrismaReportingMetricsRepository(appDb);
  }

  throw new Error("A reporting repository or database connection is required");
}

export function buildReportingServiceApp(options: BuildReportingServiceOptions = {}) {
  const app = Fastify({
    logger: true,
  });

  if (!options.repository && !options.db) {
    app.register(databasePlugin);
  }

  app.register(fastifyAuthPlugin, {
    formatError: (error: AuthError) =>
      buildErrorResponse({
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
      }),
    ...(options.jwtSecret ? { jwtSecret: options.jwtSecret } : {}),
    publicPathPrefixes: ["/health"],
  });

  app.get("/health", async () => ({
    status: "ok",
  }));

  app.register(async (fastify) => {
    const appDb = options.db ?? fastify.db;
    const repository = getRepository(options.repository, options.db, appDb);
    const eventProcessor =
      options.eventProcessor ?? createReportingEventProcessor(repository, fastify.log);
    const reportsService = createReportingReportsService(repository);
    const eventSubscriber =
      options.eventSubscriber ??
      (process.env.REDIS_URL
        ? createRedisReportingEventSubscriber({
            logger: fastify.log,
            processor: eventProcessor,
            redisUrl: process.env.REDIS_URL,
          })
        : createNoopReportingEventSubscriber());

    fastify.addHook("onReady", async () => {
      await eventSubscriber.start();
    });

    fastify.addHook("onClose", async () => {
      await eventSubscriber.stop();
    });

    fastify.register(reportsRoutes, {
      service: reportsService,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(
      {
        err: error,
        method: request.method,
        path: request.url,
        requestId: request.id,
      },
      "reporting service request failed"
    );

    reply.status(500).send(
      buildErrorResponse({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unexpected reporting service error",
        statusCode: 500,
      })
    );
  });

  return app;
}
