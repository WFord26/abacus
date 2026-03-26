import { REFRESH_TOKEN_COOKIE_NAME, REFRESH_TOKEN_TTL_SECONDS } from "../../lib/auth";
import { success } from "../../lib/response";
import { sanitizeOrganization, sanitizeUser } from "../../lib/serialize";
import { parseSchema } from "../../lib/validation";
import {
  emailTokenBodySchema,
  loginBodySchema,
  magicLinkRequestBodySchema,
  registerBodySchema,
  switchOrganizationBodySchema,
} from "../../schemas/identity.schema";

import type { AuthService } from "../../services/auth.service";
import type { FastifyPluginAsync } from "fastify";

type AuthRoutesOptions = {
  service: AuthService;
};

const refreshCookieOptions = {
  httpOnly: true,
  maxAge: REFRESH_TOKEN_TTL_SECONDS,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (fastify, options) => {
  fastify.get("/auth/bootstrap-status", async () => {
    const status = await options.service.getBootstrapStatus();

    return success(status);
  });

  fastify.post("/auth/bootstrap-admin", async (request, reply) => {
    const body = parseSchema(registerBodySchema, request.body);
    const session = await options.service.bootstrapAdmin(body);

    reply.setCookie(REFRESH_TOKEN_COOKIE_NAME, session.tokens.refreshToken, refreshCookieOptions);
    reply.status(201);

    return success({
      organization: sanitizeOrganization(session.organization),
      tokens: session.tokens,
      user: sanitizeUser(session.user),
    });
  });

  fastify.post("/auth/register", async (request, reply) => {
    const body = parseSchema(registerBodySchema, request.body);
    const session = await options.service.register(body);

    reply.setCookie(REFRESH_TOKEN_COOKIE_NAME, session.tokens.refreshToken, refreshCookieOptions);
    reply.status(201);

    return success({
      organization: sanitizeOrganization(session.organization),
      tokens: session.tokens,
      user: sanitizeUser(session.user),
    });
  });

  fastify.post(
    "/auth/login",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
        },
      },
    },
    async (request, reply) => {
      const body = parseSchema(loginBodySchema, request.body);
      const session = await options.service.login(body);

      reply.setCookie(REFRESH_TOKEN_COOKIE_NAME, session.tokens.refreshToken, refreshCookieOptions);

      return success({
        organization: sanitizeOrganization(session.organization),
        tokens: session.tokens,
        user: sanitizeUser(session.user),
      });
    }
  );

  fastify.post(
    "/auth/magic-link/request",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
        },
      },
    },
    async (request) => {
      const body = parseSchema(magicLinkRequestBodySchema, request.body);
      const result = await options.service.requestMagicLink(body);

      return success(result);
    }
  );

  fastify.post("/auth/magic-link/consume", async (request, reply) => {
    const body = parseSchema(emailTokenBodySchema, request.body);
    const refreshToken = request.cookies[REFRESH_TOKEN_COOKIE_NAME];
    const session = await options.service.consumeMagicLink({
      currentRefreshToken: refreshToken,
      token: body.token,
    });

    reply.setCookie(REFRESH_TOKEN_COOKIE_NAME, session.tokens.refreshToken, refreshCookieOptions);

    return success({
      organization: sanitizeOrganization(session.organization),
      tokens: session.tokens,
      user: sanitizeUser(session.user),
    });
  });

  fastify.post("/auth/email-verification/request", async (request) => {
    const result = await options.service.requestEmailVerification({
      userId: request.user!.userId,
    });

    return success(result);
  });

  fastify.post("/auth/email-verification/consume", async (request) => {
    const body = parseSchema(emailTokenBodySchema, request.body);
    const result = await options.service.consumeVerificationToken(body.token);

    return success({
      user: sanitizeUser(result.user),
      verified: result.verified,
    });
  });

  fastify.post("/auth/refresh", async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_TOKEN_COOKIE_NAME];
    const session = await options.service.refresh(refreshToken);

    reply.setCookie(REFRESH_TOKEN_COOKIE_NAME, session.tokens.refreshToken, refreshCookieOptions);

    return success({
      tokens: session.tokens,
    });
  });

  fastify.post("/auth/switch-organization", async (request, reply) => {
    const body = parseSchema(switchOrganizationBodySchema, request.body);
    const refreshToken = request.cookies[REFRESH_TOKEN_COOKIE_NAME];
    const session = await options.service.switchOrganization({
      currentRefreshToken: refreshToken,
      organizationId: body.organizationId,
      userId: request.user!.userId,
    });

    reply.setCookie(REFRESH_TOKEN_COOKIE_NAME, session.tokens.refreshToken, refreshCookieOptions);

    return success({
      organization: sanitizeOrganization(session.organization),
      tokens: session.tokens,
      user: sanitizeUser(session.user),
    });
  });

  fastify.post("/auth/logout", async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_TOKEN_COOKIE_NAME];
    await options.service.logout(refreshToken);
    reply.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
      path: "/",
    });

    return success({
      loggedOut: true,
    });
  });
};

export default authRoutes;
