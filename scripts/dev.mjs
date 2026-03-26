import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const envFilePath = resolve(repoRoot, ".env");

function parseEnvFile(filePath) {
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

function startService(label, extraEnv, args) {
  const child = spawn("npx", ["--yes", "pnpm", ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...fileEnv,
      HOST: fileEnv.HOST ?? "127.0.0.1",
      NODE_ENV: fileEnv.NODE_ENV ?? "development",
      ...extraEnv,
    },
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    if (signal) {
      console.error(`[${label}] exited with signal ${signal}`);
      shutdown(1);
      return;
    }

    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
      shutdown(code);
      return;
    }

    console.error(`[${label}] exited`);
    shutdown(0);
  });

  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGINT");
    }
  }

  setTimeout(() => {
    process.exit(exitCode);
  }, 50).unref();
}

const fileEnv = parseEnvFile(envFilePath);
const children = [];
let shuttingDown = false;

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

children.push(
  startService(
    "identity",
    {
      DATABASE_URL: fileEnv.DATABASE_URL ?? fileEnv.IDENTITY_DATABASE_URL ?? "",
      REDIS_URL: fileEnv.REDIS_URL ?? "redis://localhost:16379",
      JWT_SECRET: fileEnv.JWT_SECRET ?? "development-secret",
      PORT: fileEnv.IDENTITY_PORT ?? "3001",
    },
    ["--filter", "@wford26/accounting-identity-service", "dev"]
  )
);

children.push(
  startService(
    "ledger",
    {
      DATABASE_URL:
        fileEnv.LEDGER_DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:15432/accounting?schema=ledger",
      JWT_SECRET: fileEnv.JWT_SECRET ?? "development-secret",
      PORT: fileEnv.LEDGER_PORT ?? "3002",
    },
    ["--filter", "@wford26/accounting-ledger-service", "dev"]
  )
);

children.push(
  startService(
    "documents",
    {
      DATABASE_URL:
        fileEnv.DOCUMENTS_DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:15432/accounting?schema=documents",
      DOCUMENTS_BUCKET: fileEnv.DOCUMENTS_BUCKET ?? "accounting-documents",
      MINIO_API_URL: fileEnv.MINIO_API_URL ?? "http://127.0.0.1:9000",
      MINIO_ROOT_PASSWORD: fileEnv.MINIO_ROOT_PASSWORD ?? "minioadmin",
      MINIO_ROOT_USER: fileEnv.MINIO_ROOT_USER ?? "minioadmin",
      PORT: fileEnv.DOCUMENTS_PORT ?? "3004",
      REDIS_URL: fileEnv.REDIS_URL ?? "redis://localhost:16379",
      S3_ACCESS_KEY_ID: fileEnv.S3_ACCESS_KEY_ID ?? fileEnv.MINIO_ROOT_USER ?? "minioadmin",
      S3_ENDPOINT: fileEnv.S3_ENDPOINT ?? fileEnv.MINIO_API_URL ?? "http://127.0.0.1:9000",
      S3_REGION: fileEnv.S3_REGION ?? "us-east-1",
      S3_SECRET_ACCESS_KEY:
        fileEnv.S3_SECRET_ACCESS_KEY ?? fileEnv.MINIO_ROOT_PASSWORD ?? "minioadmin",
    },
    ["--filter", "@wford26/accounting-documents-service", "dev"]
  )
);

children.push(
  startService(
    "reporting",
    {
      DATABASE_URL:
        fileEnv.REPORTING_DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:15432/accounting?schema=reporting",
      MINIO_API_URL: fileEnv.MINIO_API_URL ?? "http://127.0.0.1:9000",
      MINIO_ROOT_PASSWORD: fileEnv.MINIO_ROOT_PASSWORD ?? "minioadmin",
      MINIO_ROOT_USER: fileEnv.MINIO_ROOT_USER ?? "minioadmin",
      PORT: fileEnv.REPORTING_PORT ?? "3003",
      REDIS_URL: fileEnv.REDIS_URL ?? "redis://localhost:16379",
      REPORTS_BUCKET: fileEnv.REPORTS_BUCKET ?? "accounting-reports",
      S3_ACCESS_KEY_ID: fileEnv.S3_ACCESS_KEY_ID ?? fileEnv.MINIO_ROOT_USER ?? "minioadmin",
      S3_ENDPOINT: fileEnv.S3_ENDPOINT ?? fileEnv.MINIO_API_URL ?? "http://127.0.0.1:9000",
      S3_REGION: fileEnv.S3_REGION ?? "us-east-1",
      S3_SECRET_ACCESS_KEY:
        fileEnv.S3_SECRET_ACCESS_KEY ?? fileEnv.MINIO_ROOT_PASSWORD ?? "minioadmin",
    },
    ["--filter", "@wford26/accounting-reporting-service", "dev"]
  )
);

children.push(
  startService(
    "gateway",
    {
      FRONTEND_ORIGIN: fileEnv.FRONTEND_ORIGIN ?? "http://127.0.0.1:3007",
      IDENTITY_SERVICE_URL: fileEnv.IDENTITY_SERVICE_URL ?? "http://127.0.0.1:3001",
      LEDGER_SERVICE_URL: fileEnv.LEDGER_SERVICE_URL ?? "http://127.0.0.1:3002",
      DOCUMENTS_SERVICE_URL: fileEnv.DOCUMENTS_SERVICE_URL ?? "http://127.0.0.1:3004",
      REPORTING_SERVICE_URL: fileEnv.REPORTING_SERVICE_URL ?? "http://127.0.0.1:3003",
      INVOICING_SERVICE_URL: fileEnv.INVOICING_SERVICE_URL ?? "",
      JWT_SECRET: fileEnv.JWT_SECRET ?? "development-secret",
      PORT: fileEnv.API_GATEWAY_PORT ?? "3000",
    },
    ["--filter", "@wford26/accounting-api-gateway", "dev"]
  )
);

children.push(
  startService(
    "web",
    {
      NEXT_PUBLIC_API_BASE_URL: fileEnv.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3000/api/v1",
      PORT: fileEnv.WEB_PORT ?? "3007",
    },
    ["--filter", "@wford26/accounting-web", "dev"]
  )
);
