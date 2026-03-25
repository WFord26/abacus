import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import {
  fastifyAuthPlugin,
  type AuthError,
  type FastifyAuthPluginOptions,
} from "@wford26/auth-sdk";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";

type ServiceName = "identity" | "ledger" | "documents" | "reporting" | "invoicing";

type GatewayConfig = {
  frontendOrigin: string;
  jwtSecret: string;
  port: number;
  serviceUrls: Record<ServiceName, string | undefined>;
};

const ROUTE_SERVICE_MAP: Record<string, ServiceName> = {
  accounts: "ledger",
  auth: "identity",
  categories: "ledger",
  customers: "invoicing",
  documents: "documents",
  "import-batches": "ledger",
  invoices: "invoicing",
  me: "identity",
  organizations: "identity",
  "reconciliation-sessions": "ledger",
  reports: "reporting",
  transactions: "ledger",
};

function getConfig(): GatewayConfig {
  return {
    frontendOrigin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3007",
    jwtSecret: process.env.JWT_SECRET ?? "development-secret",
    port: Number(process.env.PORT ?? 3000),
    serviceUrls: {
      identity: process.env.IDENTITY_SERVICE_URL,
      ledger: process.env.LEDGER_SERVICE_URL,
      documents: process.env.DOCUMENTS_SERVICE_URL,
      reporting: process.env.REPORTING_SERVICE_URL,
      invoicing: process.env.INVOICING_SERVICE_URL,
    },
  };
}

function buildErrorPayload(code: string, message: string, statusCode: number) {
  return {
    error: {
      code,
      message,
      statusCode,
    },
  };
}

function getStatusCode(error: unknown) {
  if (typeof error === "object" && error && "statusCode" in error) {
    const statusCode = Reflect.get(error, "statusCode");

    if (typeof statusCode === "number") {
      return statusCode;
    }
  }

  return 500;
}

function getErrorCode(statusCode: number) {
  if (statusCode === 401) {
    return "UNAUTHORIZED";
  }

  if (statusCode === 403) {
    return "FORBIDDEN";
  }

  if (statusCode === 404) {
    return "NOT_FOUND";
  }

  if (statusCode >= 500) {
    return "INTERNAL_SERVER_ERROR";
  }

  return "BAD_REQUEST";
}

function getAuthPluginOptions(config: GatewayConfig): FastifyAuthPluginOptions {
  return {
    jwtSecret: config.jwtSecret,
    publicPathPrefixes: ["/health", "/api/v1/auth/"],
    formatError: (error: AuthError) =>
      buildErrorPayload(error.code, error.message, error.statusCode),
  };
}

function getRequestPath(request: FastifyRequest) {
  return request.raw.url?.split("?")[0] ?? request.url;
}

function getServiceNameFromPath(pathname: string): ServiceName | null {
  const [segment] = pathname.split("/").filter(Boolean);

  if (!segment) {
    return null;
  }

  return ROUTE_SERVICE_MAP[segment] ?? null;
}

function getProxyBody(request: FastifyRequest) {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  if (typeof request.body === "string" || Buffer.isBuffer(request.body)) {
    return request.body;
  }

  if (!request.body) {
    return undefined;
  }

  return JSON.stringify(request.body);
}

function getProxyHeaders(request: FastifyRequest) {
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (!value || key === "host" || key === "content-length") {
      continue;
    }

    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }

  headers.set("x-request-id", request.id);

  return headers;
}

async function proxyRequest(request: FastifyRequest, reply: FastifyInstance["reply"]) {
  const config = getConfig();
  const wildcard = ((request.params as { "*": string })["*"] ?? "").replace(/^\/+/, "");
  const serviceName = getServiceNameFromPath(wildcard);

  if (!serviceName) {
    reply
      .status(404)
      .send(buildErrorPayload("NOT_FOUND", "No upstream service matches this route", 404));
    return;
  }

  const serviceUrl = config.serviceUrls[serviceName];

  if (!serviceUrl) {
    reply
      .status(503)
      .send(
        buildErrorPayload(
          "SERVICE_UNAVAILABLE",
          `${serviceName} service URL is not configured`,
          503
        )
      );
    return;
  }

  const query = request.raw.url?.split("?")[1];
  const upstreamUrl = new URL(wildcard, serviceUrl.endsWith("/") ? serviceUrl : `${serviceUrl}/`);

  if (query) {
    upstreamUrl.search = query;
  }

  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers: getProxyHeaders(request),
    body: getProxyBody(request),
  });

  const setCookie =
    "getSetCookie" in upstreamResponse.headers &&
    typeof upstreamResponse.headers.getSetCookie === "function"
      ? upstreamResponse.headers.getSetCookie()
      : [];

  if (setCookie.length > 0) {
    reply.header("set-cookie", setCookie);
  }

  const responseText = await upstreamResponse.text();
  const contentType = upstreamResponse.headers.get("content-type");

  reply.status(upstreamResponse.status);

  if (!responseText) {
    reply.send();
    return;
  }

  if (contentType?.includes("application/json")) {
    reply.type("application/json").send(JSON.parse(responseText));
    return;
  }

  reply.type(contentType ?? "text/plain").send(responseText);
}

export function buildApiGateway() {
  const config = getConfig();
  const app = Fastify({
    logger: true,
  });

  app.register(cors, {
    origin: config.frontendOrigin,
    credentials: true,
  });

  app.register(helmet);
  app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });
  app.register(fastifyAuthPlugin, getAuthPluginOptions(config));

  app.addHook("onResponse", async (request, reply) => {
    request.log.info(
      {
        duration: reply.elapsedTime,
        method: request.method,
        path: getRequestPath(request),
        requestId: request.id,
        statusCode: reply.statusCode,
      },
      "request completed"
    );
  });

  app.get("/health", async () => {
    return {
      status: "ok",
      services: Object.fromEntries(
        Object.entries(config.serviceUrls).map(([serviceName, serviceUrl]) => [
          serviceName,
          serviceUrl ? "configured" : "missing",
        ])
      ),
    };
  });

  app.all("/api/v1/*", async (request, reply) => {
    await proxyRequest(request, reply);
  });

  app.setNotFoundHandler((request, reply) => {
    reply
      .status(404)
      .send(buildErrorPayload("NOT_FOUND", `Route ${getRequestPath(request)} does not exist`, 404));
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = getStatusCode(error);
    const code = getErrorCode(statusCode);
    const message = error.message || "Unexpected gateway error";

    request.log.error(
      {
        err: error,
        method: request.method,
        path: getRequestPath(request),
        requestId: request.id,
      },
      "gateway request failed"
    );

    reply.status(statusCode).send(buildErrorPayload(code, message, statusCode));
  });

  return app;
}

export type ApiGateway = ReturnType<typeof buildApiGateway>;
