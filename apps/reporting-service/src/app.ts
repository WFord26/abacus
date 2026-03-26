import { fastifyAuthPlugin, type AuthError } from "@wford26/auth-sdk";
import Fastify from "fastify";

import {
  createInMemoryReportingDashboardCache,
  createRedisReportingDashboardCache,
  type ReportingDashboardCache,
} from "./lib/cache";
import { ReportingServiceError } from "./lib/errors";
import {
  createNoopReportingEventSubscriber,
  createRedisReportingEventSubscriber,
  type ReportingEventSubscriber,
} from "./lib/events";
import {
  createBullMqReportingExportJobQueue,
  createUnavailableReportingExportJobQueue,
  type ReportingExportJobQueue,
} from "./lib/export-queue";
import {
  createS3ReportingExportStorage,
  createUnavailableReportingExportStorage,
  type ReportingExportStorage,
} from "./lib/storage";
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
import { createReportingCsvExportProcessor } from "./services/report-exports.service";
import { createReportingReportsService } from "./services/reports.service";

import type { PrismaClient } from "@prisma/client";

export type BuildReportingServiceOptions = {
  dashboardCache?: ReportingDashboardCache;
  db?: PrismaClient;
  eventProcessor?: ReportingEventProcessor;
  eventSubscriber?: ReportingEventSubscriber;
  exportQueue?: ReportingExportJobQueue;
  jwtSecret?: string;
  now?: () => Date;
  repository?: ReportingMetricsRepository;
  storage?: ReportingExportStorage;
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

function getDashboardCache(dashboardCacheOverride: ReportingDashboardCache | undefined) {
  if (dashboardCacheOverride) {
    return dashboardCacheOverride;
  }

  if (process.env.REDIS_URL) {
    return createRedisReportingDashboardCache(process.env.REDIS_URL);
  }

  return createInMemoryReportingDashboardCache();
}

function getStorage(storageOverride: ReportingExportStorage | undefined) {
  if (storageOverride) {
    return storageOverride;
  }

  const endpoint = process.env.S3_ENDPOINT ?? process.env.MINIO_API_URL;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? process.env.MINIO_ROOT_USER;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? process.env.MINIO_ROOT_PASSWORD;
  const bucketName = process.env.REPORTS_BUCKET ?? "accounting-reports";

  if (!accessKeyId || !secretAccessKey) {
    return createUnavailableReportingExportStorage();
  }

  return createS3ReportingExportStorage({
    accessKeyId,
    bucketName,
    ...(endpoint ? { endpoint } : {}),
    region: process.env.S3_REGION ?? "us-east-1",
    secretAccessKey,
  });
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
    const dashboardCache = getDashboardCache(options.dashboardCache);
    const storage = getStorage(options.storage);
    const exportProcessor = createReportingCsvExportProcessor(repository, storage);
    const exportQueue =
      options.exportQueue ??
      (process.env.REDIS_URL
        ? createBullMqReportingExportJobQueue({
            logger: fastify.log,
            processor: (input) => exportProcessor.run(input),
            redisUrl: process.env.REDIS_URL,
            storage,
          })
        : createUnavailableReportingExportJobQueue());
    const eventProcessor =
      options.eventProcessor ??
      createReportingEventProcessor(repository, fastify.log, dashboardCache);
    const reportsService = createReportingReportsService(repository, {
      dashboardCache,
      exportQueue,
      now: options.now ?? (() => new Date()),
    });
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
      await exportQueue.start();
      await eventSubscriber.start();
    });

    fastify.addHook("onClose", async () => {
      await eventSubscriber.stop();
      await exportQueue.stop();
    });

    fastify.register(reportsRoutes, {
      service: reportsService,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ReportingServiceError) {
      reply.status(error.statusCode).send(
        buildErrorResponse({
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
          ...(error.details ? { details: error.details } : {}),
        })
      );
      return;
    }

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
