import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { fastifyAuthPlugin, type AuthError } from "@wford26/auth-sdk";
import Fastify from "fastify";

import { LedgerServiceError } from "./lib/errors";
import {
  createNoopLedgerEventPublisher,
  createNoopLedgerEventSubscriber,
  createRedisLedgerEventPublisher,
  createRedisLedgerEventSubscriber,
} from "./lib/events";
import databasePlugin from "./plugins/database";
import {
  createPrismaLedgerAccountRepository,
  type LedgerAccountRepository,
} from "./repositories/accounts.repo";
import {
  createPrismaLedgerCategoryRepository,
  type LedgerCategoryRepository,
} from "./repositories/categories.repo";
import {
  createPrismaLedgerImportBatchRepository,
  type LedgerImportBatchRepository,
} from "./repositories/import-batches.repo";
import {
  createPrismaLedgerTransactionRepository,
  type LedgerTransactionRepository,
} from "./repositories/transactions.repo";
import accountsRoutes from "./routes/v1/accounts.routes";
import categoriesRoutes from "./routes/v1/categories.routes";
import importBatchesRoutes from "./routes/v1/import-batches.routes";
import transactionsRoutes from "./routes/v1/transactions.routes";
import { createLedgerAccountsService } from "./services/accounts.service";
import { createLedgerCategoriesService } from "./services/categories.service";
import { createLedgerImportBatchesService } from "./services/import-batches.service";
import {
  createLedgerEventProcessor,
  type LedgerEventProcessor,
} from "./services/invoice-settlement.service";
import { createLedgerTransactionsService } from "./services/transactions.service";

import type { LedgerEventPublisher, LedgerEventSubscriber } from "./lib/events";
import type { PrismaClient } from "@prisma/client";

export type BuildLedgerServiceOptions = {
  accountRepository?: LedgerAccountRepository;
  categoryRepository?: LedgerCategoryRepository;
  db?: PrismaClient;
  eventProcessor?: LedgerEventProcessor;
  eventPublisher?: LedgerEventPublisher;
  eventSubscriber?: LedgerEventSubscriber;
  importBatchRepository?: LedgerImportBatchRepository;
  jwtSecret?: string;
  transactionRepository?: LedgerTransactionRepository;
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

function getAccountRepository(
  repositoryOverride: LedgerAccountRepository | undefined,
  dbOverride: PrismaClient | undefined,
  appDb: PrismaClient | undefined
) {
  if (repositoryOverride) {
    return repositoryOverride;
  }

  if (dbOverride) {
    return createPrismaLedgerAccountRepository(dbOverride);
  }

  if (appDb) {
    return createPrismaLedgerAccountRepository(appDb);
  }

  throw new Error("A repository or database connection is required");
}

function getCategoryRepository(
  repositoryOverride: LedgerCategoryRepository | undefined,
  dbOverride: PrismaClient | undefined,
  appDb: PrismaClient | undefined
) {
  if (repositoryOverride) {
    return repositoryOverride;
  }

  if (dbOverride) {
    return createPrismaLedgerCategoryRepository(dbOverride);
  }

  if (appDb) {
    return createPrismaLedgerCategoryRepository(appDb);
  }

  throw new Error("A category repository or database connection is required");
}

function getTransactionRepository(
  repositoryOverride: LedgerTransactionRepository | undefined,
  dbOverride: PrismaClient | undefined,
  appDb: PrismaClient | undefined
) {
  if (repositoryOverride) {
    return repositoryOverride;
  }

  if (dbOverride) {
    return createPrismaLedgerTransactionRepository(dbOverride);
  }

  if (appDb) {
    return createPrismaLedgerTransactionRepository(appDb);
  }

  throw new Error("A transaction repository or database connection is required");
}

function getImportBatchRepository(
  repositoryOverride: LedgerImportBatchRepository | undefined,
  dbOverride: PrismaClient | undefined,
  appDb: PrismaClient | undefined
) {
  if (repositoryOverride) {
    return repositoryOverride;
  }

  if (dbOverride) {
    return createPrismaLedgerImportBatchRepository(dbOverride);
  }

  if (appDb) {
    return createPrismaLedgerImportBatchRepository(appDb);
  }

  throw new Error("An import batch repository or database connection is required");
}

export function buildLedgerServiceApp(options: BuildLedgerServiceOptions = {}) {
  const app = Fastify({
    logger: true,
  });

  if (
    !options.accountRepository &&
    !options.categoryRepository &&
    !options.importBatchRepository &&
    !options.transactionRepository &&
    !options.db
  ) {
    app.register(databasePlugin);
  }

  app.register(multipart);
  app.register(rateLimit);
  const authPluginOptions = {
    formatError: (error: AuthError) => buildErrorResponse(error),
    publicPathPrefixes: ["/health"],
    ...(options.jwtSecret ? { jwtSecret: options.jwtSecret } : {}),
  };

  app.register(fastifyAuthPlugin, authPluginOptions);

  app.get("/health", async () => {
    return {
      status: "ok",
    };
  });

  app.register(async (fastify) => {
    const appDb = options.db ?? fastify.db;
    const accountRepository = getAccountRepository(options.accountRepository, options.db, appDb);
    const categoryRepository = getCategoryRepository(options.categoryRepository, options.db, appDb);
    const transactionRepository = getTransactionRepository(
      options.transactionRepository,
      options.db,
      appDb
    );
    const importBatchRepository = getImportBatchRepository(
      options.importBatchRepository,
      options.db,
      appDb
    );
    const eventPublisher =
      options.eventPublisher ??
      (process.env.REDIS_URL
        ? createRedisLedgerEventPublisher(process.env.REDIS_URL)
        : createNoopLedgerEventPublisher());
    const eventProcessor =
      options.eventProcessor ??
      createLedgerEventProcessor(
        transactionRepository,
        accountRepository,
        eventPublisher,
        fastify.log
      );
    const eventSubscriber =
      options.eventSubscriber ??
      (process.env.REDIS_URL
        ? createRedisLedgerEventSubscriber({
            logger: fastify.log,
            processor: eventProcessor,
            redisUrl: process.env.REDIS_URL,
          })
        : createNoopLedgerEventSubscriber());
    const accountsService = createLedgerAccountsService(accountRepository);
    const categoriesService = createLedgerCategoriesService(categoryRepository);
    const transactionsService = createLedgerTransactionsService(
      transactionRepository,
      accountRepository,
      categoryRepository,
      eventPublisher
    );
    const importBatchesService = createLedgerImportBatchesService(
      importBatchRepository,
      transactionRepository,
      accountRepository,
      eventPublisher
    );

    fastify.register(accountsRoutes, {
      service: accountsService,
    });

    fastify.register(categoriesRoutes, {
      service: categoriesService,
    });

    fastify.register(transactionsRoutes, {
      importService: importBatchesService,
      service: transactionsService,
    });

    fastify.register(importBatchesRoutes, {
      service: importBatchesService,
    });

    fastify.addHook("onReady", async () => {
      await eventSubscriber.start();
    });

    fastify.addHook("onClose", async () => {
      await eventSubscriber.stop();
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof LedgerServiceError) {
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
      "ledger service request failed"
    );

    reply.status(500).send(
      buildErrorResponse({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unexpected ledger service error",
        statusCode: 500,
      })
    );
  });

  return app;
}
