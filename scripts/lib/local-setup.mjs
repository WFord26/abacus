import { spawn } from "node:child_process";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const repoRoot = resolve(__dirname, "../..");
export const envFilePath = resolve(repoRoot, ".env");
export const envExampleFilePath = resolve(repoRoot, ".env.example");
export const dockerComposeFilePath = resolve(repoRoot, "infrastructure/docker/docker-compose.yml");

export function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const raw = readFileSync(filePath, "utf8");
  const env = {};

  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

export function ensureRootEnvFile({ fix = false } = {}) {
  if (existsSync(envFilePath)) {
    return {
      created: false,
      exists: true,
      path: envFilePath,
    };
  }

  if (!existsSync(envExampleFilePath)) {
    throw new Error(`Missing env template at ${envExampleFilePath}`);
  }

  if (!fix) {
    return {
      created: false,
      exists: false,
      path: envFilePath,
    };
  }

  copyFileSync(envExampleFilePath, envFilePath);

  return {
    created: true,
    exists: true,
    path: envFilePath,
  };
}

export function resolveLocalEnv(fileEnv = {}) {
  const read = (key, fallback) => {
    const value = fileEnv[key];

    if (value === undefined || value === null) {
      return fallback;
    }

    if (typeof value === "string" && value.trim().length === 0) {
      return fallback;
    }

    return value;
  };

  return {
    API_GATEWAY_PORT: read("API_GATEWAY_PORT", "3000"),
    DOCUMENTS_BUCKET: read("DOCUMENTS_BUCKET", "accounting-documents"),
    DOCUMENTS_DATABASE_URL: read(
      "DOCUMENTS_DATABASE_URL",
      "postgresql://postgres:postgres@localhost:15432/accounting?schema=documents"
    ),
    DOCUMENTS_PORT: read("DOCUMENTS_PORT", "3004"),
    DOCUMENTS_SERVICE_URL: read("DOCUMENTS_SERVICE_URL", "http://127.0.0.1:3004"),
    FRONTEND_ORIGIN: read("FRONTEND_ORIGIN", "http://127.0.0.1:3007"),
    HOST: read("HOST", "127.0.0.1"),
    IDENTITY_DATABASE_URL: read(
      "IDENTITY_DATABASE_URL",
      "postgresql://postgres:postgres@localhost:15432/accounting?schema=identity"
    ),
    IDENTITY_PORT: read("IDENTITY_PORT", "3001"),
    IDENTITY_SERVICE_URL: read("IDENTITY_SERVICE_URL", "http://127.0.0.1:3001"),
    INVOICES_BUCKET: read("INVOICES_BUCKET", "accounting-invoices"),
    INVOICING_DATABASE_URL: read(
      "INVOICING_DATABASE_URL",
      "postgresql://postgres:postgres@localhost:15432/accounting?schema=invoicing"
    ),
    INVOICING_PORT: read("INVOICING_PORT", "3006"),
    INVOICING_SERVICE_URL: read("INVOICING_SERVICE_URL", "http://127.0.0.1:3006"),
    JWT_SECRET: read("JWT_SECRET", "development-secret"),
    LEDGER_DATABASE_URL: read(
      "LEDGER_DATABASE_URL",
      "postgresql://postgres:postgres@localhost:15432/accounting?schema=ledger"
    ),
    LEDGER_PORT: read("LEDGER_PORT", "3002"),
    LEDGER_SERVICE_URL: read("LEDGER_SERVICE_URL", "http://127.0.0.1:3002"),
    MAILHOG_SMTP_HOST: read("MAILHOG_SMTP_HOST", "127.0.0.1"),
    MAILHOG_SMTP_PORT: read("MAILHOG_SMTP_PORT", "1025"),
    MAILHOG_UI_URL: read("MAILHOG_UI_URL", "http://127.0.0.1:8025"),
    MINIO_API_URL: read("MINIO_API_URL", "http://127.0.0.1:9000"),
    MINIO_CONSOLE_URL: read("MINIO_CONSOLE_URL", "http://127.0.0.1:9001"),
    MINIO_ROOT_PASSWORD: read("MINIO_ROOT_PASSWORD", "minioadmin"),
    MINIO_ROOT_USER: read("MINIO_ROOT_USER", "minioadmin"),
    NEXT_PUBLIC_API_BASE_URL: read("NEXT_PUBLIC_API_BASE_URL", "http://127.0.0.1:3000/api/v1"),
    NODE_ENV: read("NODE_ENV", "development"),
    POSTGRES_DB: read("POSTGRES_DB", "accounting"),
    POSTGRES_HOST: read("POSTGRES_HOST", "localhost"),
    POSTGRES_PASSWORD: read("POSTGRES_PASSWORD", "postgres"),
    POSTGRES_PORT: read("POSTGRES_PORT", "15432"),
    POSTGRES_USER: read("POSTGRES_USER", "postgres"),
    REDIS_URL: read("REDIS_URL", "redis://localhost:16379"),
    REPORTING_DATABASE_URL: read(
      "REPORTING_DATABASE_URL",
      "postgresql://postgres:postgres@localhost:15432/accounting?schema=reporting"
    ),
    REPORTING_PORT: read("REPORTING_PORT", "3003"),
    REPORTING_SERVICE_URL: read("REPORTING_SERVICE_URL", "http://127.0.0.1:3003"),
    REPORTS_BUCKET: read("REPORTS_BUCKET", "accounting-reports"),
    RESEND_API_KEY: read("RESEND_API_KEY", ""),
    RESEND_FROM_EMAIL: read("RESEND_FROM_EMAIL", "Abacus <auth@updates.example.com>"),
    RESEND_REPLY_TO: read("RESEND_REPLY_TO", ""),
    S3_ACCESS_KEY_ID: read("S3_ACCESS_KEY_ID", read("MINIO_ROOT_USER", "minioadmin")),
    S3_ENDPOINT: read("S3_ENDPOINT", read("MINIO_API_URL", "http://127.0.0.1:9000")),
    S3_REGION: read("S3_REGION", "us-east-1"),
    S3_SECRET_ACCESS_KEY: read("S3_SECRET_ACCESS_KEY", read("MINIO_ROOT_PASSWORD", "minioadmin")),
    SEED_ADMIN_EMAIL: read("SEED_ADMIN_EMAIL", "admin@example.com"),
    SEED_ADMIN_NAME: read("SEED_ADMIN_NAME", "Admin"),
    SEED_ADMIN_PASSWORD: read("SEED_ADMIN_PASSWORD", "password123"),
    WEB_PORT: read("WEB_PORT", "3007"),
  };
}

function isValidUrl(value, allowedProtocols) {
  try {
    const url = new URL(value);
    return allowedProtocols.includes(url.protocol);
  } catch {
    return false;
  }
}

function isValidPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

export function validateLocalEnv(env) {
  const errors = [];

  const requiredTextKeys = [
    "HOST",
    "JWT_SECRET",
    "MINIO_ROOT_PASSWORD",
    "MINIO_ROOT_USER",
    "POSTGRES_DB",
    "POSTGRES_HOST",
    "POSTGRES_PASSWORD",
    "POSTGRES_USER",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "SEED_ADMIN_EMAIL",
    "SEED_ADMIN_NAME",
    "SEED_ADMIN_PASSWORD",
  ];

  for (const key of requiredTextKeys) {
    if (!env[key] || String(env[key]).trim().length === 0) {
      errors.push(`${key} must be set`);
    }
  }

  const portKeys = [
    "API_GATEWAY_PORT",
    "DOCUMENTS_PORT",
    "IDENTITY_PORT",
    "INVOICING_PORT",
    "LEDGER_PORT",
    "MAILHOG_SMTP_PORT",
    "POSTGRES_PORT",
    "REPORTING_PORT",
    "WEB_PORT",
  ];

  for (const key of portKeys) {
    if (!isValidPort(env[key])) {
      errors.push(`${key} must be a valid TCP port`);
    }
  }

  const urlChecks = [
    ["DOCUMENTS_SERVICE_URL", ["http:", "https:"]],
    ["FRONTEND_ORIGIN", ["http:", "https:"]],
    ["IDENTITY_DATABASE_URL", ["postgresql:", "postgres:"]],
    ["IDENTITY_SERVICE_URL", ["http:", "https:"]],
    ["INVOICING_DATABASE_URL", ["postgresql:", "postgres:"]],
    ["INVOICING_SERVICE_URL", ["http:", "https:"]],
    ["LEDGER_DATABASE_URL", ["postgresql:", "postgres:"]],
    ["LEDGER_SERVICE_URL", ["http:", "https:"]],
    ["MAILHOG_UI_URL", ["http:", "https:"]],
    ["MINIO_API_URL", ["http:", "https:"]],
    ["MINIO_CONSOLE_URL", ["http:", "https:"]],
    ["NEXT_PUBLIC_API_BASE_URL", ["http:", "https:"]],
    ["REDIS_URL", ["redis:", "rediss:"]],
    ["REPORTING_DATABASE_URL", ["postgresql:", "postgres:"]],
    ["REPORTING_SERVICE_URL", ["http:", "https:"]],
    ["S3_ENDPOINT", ["http:", "https:"]],
  ];

  for (const [key, protocols] of urlChecks) {
    if (!isValidUrl(env[key], protocols)) {
      errors.push(`${key} must be a valid ${protocols.join(" or ")} URL`);
    }
  }

  return errors;
}

export function formatValidationErrors(errors) {
  return errors.map((error) => `- ${error}`).join("\n");
}

export function loadLocalEnv({ fix = false } = {}) {
  const envStatus = ensureRootEnvFile({
    fix,
  });

  if (!envStatus.exists) {
    throw new Error(`Missing ${envFilePath}. Run the command again with --fix to create it.`);
  }

  return {
    envStatus,
    fileEnv: parseEnvFile(envFilePath),
  };
}

export function parseCliArgs(argv = process.argv.slice(2)) {
  return new Set(argv);
}

export function describeCommand(command, args) {
  return [command, ...args].join(" ");
}

export function writeLine(message = "") {
  process.stdout.write(`${message}\n`);
}

export async function runCommand(command, args, options = {}) {
  const { cwd = repoRoot, dryRun = false, env = process.env, stdio = "inherit" } = options;

  const rendered = describeCommand(command, args);
  writeLine(`$ ${rendered}`);

  if (dryRun) {
    return;
  }

  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio,
    });

    child.on("error", rejectPromise);
    child.on("exit", (code, signal) => {
      if (signal) {
        rejectPromise(new Error(`${rendered} exited with signal ${signal}`));
        return;
      }

      if (code && code !== 0) {
        rejectPromise(new Error(`${rendered} exited with code ${code}`));
        return;
      }

      resolvePromise();
    });
  });
}

export async function waitForTcpPort({ host, intervalMs = 500, port, timeoutMs = 30_000 }) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const isReady = await new Promise((resolvePromise) => {
      const socket = net.createConnection({
        host,
        port,
      });

      socket.once("connect", () => {
        socket.destroy();
        resolvePromise(true);
      });

      socket.once("error", () => {
        socket.destroy();
        resolvePromise(false);
      });
    });

    if (isReady) {
      return;
    }

    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, intervalMs);
    });
  }

  throw new Error(`Timed out waiting for ${host}:${port}`);
}
