import rateLimit from "@fastify/rate-limit";
import { fastifyAuthPlugin, type AuthError } from "@wford26/auth-sdk";
import Fastify from "fastify";

import { InvoicingServiceError } from "./lib/errors";
import {
  createNoopInvoicingEventPublisher,
  createRedisInvoicingEventPublisher,
  type InvoicingEventPublisher,
} from "./lib/events";
import { createS3InvoicingPdfStorage, type InvoicingPdfStorage } from "./lib/storage";
import databasePlugin from "./plugins/database";
import {
  createPrismaInvoicingRepository,
  type InvoicingRepository,
} from "./repositories/invoicing.repo";
import customersRoutes from "./routes/v1/customers.routes";
import invoicesRoutes from "./routes/v1/invoices.routes";
import { createInvoicingService } from "./services/invoicing.service";

import type { PrismaClient } from "@prisma/client";

export type BuildInvoicingServiceOptions = {
  db?: PrismaClient;
  eventPublisher?: InvoicingEventPublisher;
  jwtSecret?: string;
  repository?: InvoicingRepository;
  storage?: InvoicingPdfStorage;
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
  repositoryOverride: InvoicingRepository | undefined,
  dbOverride: PrismaClient | undefined,
  appDb: PrismaClient | undefined
) {
  if (repositoryOverride) {
    return repositoryOverride;
  }

  if (dbOverride) {
    return createPrismaInvoicingRepository(dbOverride);
  }

  if (appDb) {
    return createPrismaInvoicingRepository(appDb);
  }

  throw new Error("A repository or database connection is required");
}

function getStorage(storageOverride: InvoicingPdfStorage | undefined) {
  if (storageOverride) {
    return storageOverride;
  }

  const endpoint = process.env.S3_ENDPOINT ?? process.env.MINIO_API_URL;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? process.env.MINIO_ROOT_USER;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? process.env.MINIO_ROOT_PASSWORD;
  const bucketName = process.env.INVOICES_BUCKET ?? "accounting-invoices";

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Invoice PDF storage credentials are required");
  }

  return createS3InvoicingPdfStorage({
    accessKeyId,
    bucketName,
    ...(endpoint ? { endpoint } : {}),
    region: process.env.S3_REGION ?? "us-east-1",
    secretAccessKey,
  });
}

export function buildInvoicingServiceApp(options: BuildInvoicingServiceOptions = {}) {
  const app = Fastify({
    logger: true,
  });

  if (!options.repository && !options.db) {
    app.register(databasePlugin);
  }

  app.register(rateLimit);
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
    const storage = getStorage(options.storage);
    const eventPublisher =
      options.eventPublisher ??
      (process.env.REDIS_URL
        ? createRedisInvoicingEventPublisher(process.env.REDIS_URL)
        : createNoopInvoicingEventPublisher());
    const service = createInvoicingService(repository, storage, eventPublisher);

    fastify.register(customersRoutes, {
      service,
    });

    fastify.register(invoicesRoutes, {
      service,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof InvoicingServiceError) {
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
      "invoicing service request failed"
    );

    reply.status(500).send(
      buildErrorResponse({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unexpected invoicing service error",
        statusCode: 500,
      })
    );
  });

  return app;
}
