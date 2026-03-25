import rateLimit from "@fastify/rate-limit";
import { fastifyAuthPlugin, type AuthError } from "@wford26/auth-sdk";
import Fastify from "fastify";

import { LedgerServiceError } from "./lib/errors";
import databasePlugin from "./plugins/database";
import {
  createPrismaLedgerAccountRepository,
  type LedgerAccountRepository,
} from "./repositories/accounts.repo";
import {
  createPrismaLedgerCategoryRepository,
  type LedgerCategoryRepository,
} from "./repositories/categories.repo";
import accountsRoutes from "./routes/v1/accounts.routes";
import categoriesRoutes from "./routes/v1/categories.routes";
import { createLedgerAccountsService } from "./services/accounts.service";
import { createLedgerCategoriesService } from "./services/categories.service";

import type { PrismaClient } from "@prisma/client";

export type BuildLedgerServiceOptions = {
  accountRepository?: LedgerAccountRepository;
  categoryRepository?: LedgerCategoryRepository;
  db?: PrismaClient;
  jwtSecret?: string;
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

export function buildLedgerServiceApp(options: BuildLedgerServiceOptions = {}) {
  const app = Fastify({
    logger: true,
  });

  if (!options.accountRepository && !options.categoryRepository && !options.db) {
    app.register(databasePlugin);
  }

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
    const accountsService = createLedgerAccountsService(accountRepository);
    const categoriesService = createLedgerCategoriesService(categoryRepository);

    fastify.register(accountsRoutes, {
      service: accountsService,
    });

    fastify.register(categoriesRoutes, {
      service: categoriesService,
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
