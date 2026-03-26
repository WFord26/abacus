import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { fastifyAuthPlugin, type AuthError } from "@wford26/auth-sdk";
import Fastify from "fastify";

import {
  createBcryptPasswordHasher,
  createInMemoryRefreshTokenStore,
  createRedisRefreshTokenStore,
  type PasswordHasher,
  type RefreshTokenStore,
} from "./lib/auth";
import {
  createNoopEmailSender,
  createResendEmailSender,
  type IdentityEmailSender,
} from "./lib/email";
import { IdentityServiceError } from "./lib/errors";
import databasePlugin from "./plugins/database";
import {
  createPrismaIdentityRepository,
  type IdentityRepository,
} from "./repositories/identity.repo";
import authRoutes from "./routes/v1/auth.routes";
import identityRoutes from "./routes/v1/identity.routes";
import { createAuthService } from "./services/auth.service";
import { createIdentityService } from "./services/identity.service";

import type { PrismaClient } from "@prisma/client";

export type BuildIdentityServiceOptions = {
  appOrigin?: string;
  db?: PrismaClient;
  emailSender?: IdentityEmailSender;
  jwtSecret?: string;
  passwordHasher?: PasswordHasher;
  refreshTokenStore?: RefreshTokenStore;
  repository?: IdentityRepository;
};

function resolveOrganizationId(request: { params: unknown; raw: { url?: string | undefined } }) {
  const pathname = request.raw.url?.split("?")[0] ?? "";

  if (
    /^\/organizations\/[^/]+\/accept-invite$/.test(pathname) ||
    /^\/organizations\/[^/]+\/decline-invite$/.test(pathname)
  ) {
    return null;
  }

  if (!request.params || typeof request.params !== "object") {
    return null;
  }

  const routeParams = request.params as Record<string, unknown>;

  if (typeof routeParams.organizationId === "string") {
    return routeParams.organizationId;
  }

  if (typeof routeParams.orgId === "string") {
    return routeParams.orgId;
  }

  return null;
}

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
  repositoryOverride: IdentityRepository | undefined,
  dbOverride: PrismaClient | undefined,
  appDb: PrismaClient | undefined
) {
  if (repositoryOverride) {
    return repositoryOverride;
  }

  if (dbOverride) {
    return createPrismaIdentityRepository(dbOverride);
  }

  if (appDb) {
    return createPrismaIdentityRepository(appDb);
  }

  throw new Error("A repository or database connection is required");
}

export function buildIdentityServiceApp(options: BuildIdentityServiceOptions = {}) {
  const app = Fastify({
    logger: true,
  });

  if (!options.repository && !options.db) {
    app.register(databasePlugin);
  }

  app.register(cookie);
  app.register(rateLimit);

  const authPluginOptions = {
    formatError: (error: AuthError) => buildErrorResponse(error),
    publicPathPrefixes: [
      "/auth/bootstrap-admin",
      "/auth/bootstrap-status",
      "/auth/email-verification/consume",
      "/auth/login",
      "/auth/logout",
      "/auth/magic-link/consume",
      "/auth/magic-link/request",
      "/auth/refresh",
      "/auth/register",
      "/health",
    ],
    resolveOrganizationId,
    ...(options.jwtSecret ? { jwtSecret: options.jwtSecret } : {}),
  };

  app.register(fastifyAuthPlugin, authPluginOptions);

  app.get("/health", async () => {
    return {
      status: "ok",
    };
  });

  app.register(async (fastify) => {
    const repository = getRepository(options.repository, options.db, options.db ?? fastify.db);
    const jwtSecret = options.jwtSecret ?? process.env.JWT_SECRET ?? "development-secret";
    const refreshTokenStore =
      options.refreshTokenStore ??
      (process.env.REDIS_URL
        ? createRedisRefreshTokenStore(process.env.REDIS_URL)
        : createInMemoryRefreshTokenStore());
    const passwordHasher = options.passwordHasher ?? createBcryptPasswordHasher();
    const appOrigin = options.appOrigin ?? process.env.FRONTEND_ORIGIN ?? "http://127.0.0.1:3007";
    const emailSender =
      options.emailSender ??
      (process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL
        ? createResendEmailSender({
            apiKey: process.env.RESEND_API_KEY,
            from: process.env.RESEND_FROM_EMAIL,
            ...(process.env.RESEND_REPLY_TO ? { replyTo: process.env.RESEND_REPLY_TO } : {}),
          })
        : createNoopEmailSender());
    const authService = createAuthService(repository, {
      appOrigin,
      emailSender,
      jwtSecret,
      passwordHasher,
      refreshTokenStore,
    });
    const service = createIdentityService(repository, {
      appOrigin,
      emailSender,
    });

    fastify.register(authRoutes, {
      service: authService,
    });

    fastify.register(identityRoutes, {
      service,
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof IdentityServiceError) {
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
      "identity service request failed"
    );

    reply.status(500).send(
      buildErrorResponse({
        code: "INTERNAL_SERVER_ERROR",
        message: "Unexpected identity service error",
        statusCode: 500,
      })
    );
  });

  return app;
}
