import rateLimit from "@fastify/rate-limit";
import { fastifyAuthPlugin, type AuthError } from "@wford26/auth-sdk";
import Fastify from "fastify";

import { DocumentsServiceError } from "./lib/errors";
import {
  createNoopDocumentsEventPublisher,
  createRedisDocumentsEventPublisher,
} from "./lib/events";
import { createS3DocumentStorage, type DocumentStorage } from "./lib/storage";
import databasePlugin from "./plugins/database";
import {
  createPrismaDocumentsRepository,
  type DocumentsRepository,
} from "./repositories/documents.repo";
import documentsRoutes from "./routes/v1/documents.routes";
import { createDocumentsService } from "./services/documents.service";

import type { DocumentsEventPublisher } from "./lib/events";
import type { PrismaClient } from "@prisma/client";

export type BuildDocumentsServiceOptions = {
  db?: PrismaClient;
  eventPublisher?: DocumentsEventPublisher;
  jwtSecret?: string;
  repository?: DocumentsRepository;
  storage?: DocumentStorage;
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
  repositoryOverride: DocumentsRepository | undefined,
  dbOverride: PrismaClient | undefined,
  appDb: PrismaClient | undefined
) {
  if (repositoryOverride) {
    return repositoryOverride;
  }

  if (dbOverride) {
    return createPrismaDocumentsRepository(dbOverride);
  }

  if (appDb) {
    return createPrismaDocumentsRepository(appDb);
  }

  throw new Error("A repository or database connection is required");
}

function getStorage(storageOverride: DocumentStorage | undefined) {
  if (storageOverride) {
    return storageOverride;
  }

  const endpoint = process.env.S3_ENDPOINT ?? process.env.MINIO_API_URL;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID ?? process.env.MINIO_ROOT_USER;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY ?? process.env.MINIO_ROOT_PASSWORD;
  const bucketName = process.env.DOCUMENTS_BUCKET ?? "accounting-documents";

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Document storage credentials are required");
  }

  return createS3DocumentStorage({
    accessKeyId,
    bucketName,
    ...(endpoint ? { endpoint } : {}),
    region: process.env.S3_REGION ?? "us-east-1",
    secretAccessKey,
  });
}

export function buildDocumentsServiceApp(options: BuildDocumentsServiceOptions = {}) {
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

  app.get("/health", async () => {
    return {
      status: "ok",
    };
  });

  app.register(async (fastify) => {
    const appDb = options.db ?? fastify.db;
    const repository = getRepository(options.repository, options.db, appDb);
    const storage = getStorage(options.storage);
    const eventPublisher =
      options.eventPublisher ??
      (process.env.REDIS_URL
        ? createRedisDocumentsEventPublisher(process.env.REDIS_URL)
        : createNoopDocumentsEventPublisher());
    const documentsService = createDocumentsService(repository, storage, eventPublisher);

    fastify.register(documentsRoutes, {
      service: documentsService,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DocumentsServiceError) {
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
      "documents service request failed"
    );

    reply.status(500).send(
      buildErrorResponse({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unexpected documents service error",
        statusCode: 500,
      })
    );
  });

  return app;
}
