import fp from "fastify-plugin";
import jwt, { type SignOptions } from "jsonwebtoken";

import type { JWTPayload, Role } from "@wford26/shared-types";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

export type AuthError = {
  code: "UNAUTHORIZED" | "FORBIDDEN";
  message: string;
  statusCode: 401 | 403;
};

export type FastifyAuthPluginOptions = {
  formatError?: (error: AuthError) => unknown;
  jwtSecret?: string;
  publicPathPrefixes?: string[];
  resolveOrganizationId?: (request: FastifyRequest) => string | null;
};

const VALID_ROLES = new Set<Role>(["owner", "admin", "accountant", "viewer"]);

function isJwtPayload(value: unknown): value is JWTPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    typeof payload.userId === "string" &&
    typeof payload.organizationId === "string" &&
    typeof payload.email === "string" &&
    typeof payload.role === "string" &&
    VALID_ROLES.has(payload.role as Role)
  );
}

function getBearerToken(authorizationHeader?: string): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

function getRouteOrganizationId(params: unknown): string | null {
  if (!params || typeof params !== "object") {
    return null;
  }

  const routeParams = params as Record<string, unknown>;

  if (typeof routeParams.organizationId === "string") {
    return routeParams.organizationId;
  }

  if (typeof routeParams.orgId === "string") {
    return routeParams.orgId;
  }

  return null;
}

function getJwtSecret(secretOverride?: string): string {
  const secret = secretOverride ?? process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }

  return secret;
}

function sendUnauthorized(reply: FastifyReply, message: string) {
  reply.status(401).send({ message });
}

function sendForbidden(reply: FastifyReply, message: string) {
  reply.status(403).send({ message });
}

function sendAuthError(
  reply: FastifyReply,
  error: AuthError,
  formatError?: FastifyAuthPluginOptions["formatError"]
) {
  reply
    .status(error.statusCode)
    .send(formatError ? formatError(error) : { message: error.message });
}

function isPublicPath(pathname: string, publicPathPrefixes: string[]) {
  return publicPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

export function signToken(payload: JWTPayload, secret: string, expiresIn: string): string {
  const options: SignOptions = {
    algorithm: "HS256",
    expiresIn: expiresIn as NonNullable<SignOptions["expiresIn"]>,
  };

  return jwt.sign(payload, secret, options);
}

export function verifyToken(token: string, secret: string): JWTPayload {
  const decoded = jwt.verify(token, secret, {
    algorithms: ["HS256"],
  });

  if (!isJwtPayload(decoded)) {
    throw new Error("Invalid JWT payload");
  }

  return decoded;
}

const authPlugin: FastifyPluginAsync<FastifyAuthPluginOptions> = async (fastify, options) => {
  fastify.decorateRequest("user", undefined);

  fastify.addHook("preHandler", async (request, reply) => {
    const pathname = request.raw.url?.split("?")[0] ?? request.url;
    const publicPathPrefixes = options.publicPathPrefixes ?? [];

    if (isPublicPath(pathname, publicPathPrefixes)) {
      return;
    }

    const token = getBearerToken(request.headers.authorization);

    if (!token) {
      sendAuthError(
        reply,
        {
          code: "UNAUTHORIZED",
          message: "Missing or invalid authorization header",
          statusCode: 401,
        },
        options.formatError
      );
      return;
    }

    let user: JWTPayload;

    try {
      user = verifyToken(token, getJwtSecret(options.jwtSecret));
    } catch {
      sendAuthError(
        reply,
        {
          code: "UNAUTHORIZED",
          message: "Invalid or expired token",
          statusCode: 401,
        },
        options.formatError
      );
      return;
    }

    const routeOrganizationId = options.resolveOrganizationId
      ? options.resolveOrganizationId(request)
      : getRouteOrganizationId(request.params);

    if (routeOrganizationId && routeOrganizationId !== user.organizationId) {
      sendAuthError(
        reply,
        {
          code: "FORBIDDEN",
          message: "Organization scope mismatch",
          statusCode: 403,
        },
        options.formatError
      );
      return;
    }

    request.user = user;
  });
};

export const fastifyAuthPlugin = fp(authPlugin, {
  fastify: "4.x",
  name: "@wford26/auth-sdk/fastify-auth-plugin",
});

export function requireRole(roles: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      sendUnauthorized(reply, "Authentication required");
      return;
    }

    if (!roles.includes(request.user.role)) {
      sendForbidden(reply, "Insufficient role");
    }
  };
}
