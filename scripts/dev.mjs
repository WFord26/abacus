import { spawn } from "node:child_process";

import {
  formatValidationErrors,
  loadLocalEnv,
  repoRoot,
  resolveLocalEnv,
  validateLocalEnv,
} from "./lib/local-setup.mjs";

function startService(label, extraEnv, args) {
  const child = spawn("npx", ["--yes", "pnpm", ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...resolvedEnv,
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

const { fileEnv } = loadLocalEnv();
const resolvedEnv = resolveLocalEnv(fileEnv);
const validationErrors = validateLocalEnv(resolvedEnv);
const children = [];
let shuttingDown = false;

if (validationErrors.length > 0) {
  console.error(
    "Local environment validation failed:\n" + formatValidationErrors(validationErrors)
  );
  process.exit(1);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

children.push(
  startService(
    "identity",
    {
      DATABASE_URL: fileEnv.DATABASE_URL ?? resolvedEnv.IDENTITY_DATABASE_URL,
      FRONTEND_ORIGIN: resolvedEnv.FRONTEND_ORIGIN,
      PORT: resolvedEnv.IDENTITY_PORT,
      REDIS_URL: resolvedEnv.REDIS_URL,
      RESEND_API_KEY: resolvedEnv.RESEND_API_KEY,
      RESEND_FROM_EMAIL: resolvedEnv.RESEND_FROM_EMAIL,
      ...(resolvedEnv.RESEND_REPLY_TO ? { RESEND_REPLY_TO: resolvedEnv.RESEND_REPLY_TO } : {}),
    },
    ["--filter", "@wford26/accounting-identity-service", "dev"]
  )
);

children.push(
  startService(
    "ledger",
    {
      DATABASE_URL: resolvedEnv.LEDGER_DATABASE_URL,
      PORT: resolvedEnv.LEDGER_PORT,
      REDIS_URL: resolvedEnv.REDIS_URL,
    },
    ["--filter", "@wford26/accounting-ledger-service", "dev"]
  )
);

children.push(
  startService(
    "documents",
    {
      DATABASE_URL: resolvedEnv.DOCUMENTS_DATABASE_URL,
      DOCUMENTS_BUCKET: resolvedEnv.DOCUMENTS_BUCKET,
      MINIO_API_URL: resolvedEnv.MINIO_API_URL,
      MINIO_ROOT_PASSWORD: resolvedEnv.MINIO_ROOT_PASSWORD,
      MINIO_ROOT_USER: resolvedEnv.MINIO_ROOT_USER,
      PORT: resolvedEnv.DOCUMENTS_PORT,
      REDIS_URL: resolvedEnv.REDIS_URL,
      S3_ACCESS_KEY_ID: resolvedEnv.S3_ACCESS_KEY_ID,
      S3_ENDPOINT: resolvedEnv.S3_ENDPOINT,
      S3_REGION: resolvedEnv.S3_REGION,
      S3_SECRET_ACCESS_KEY: resolvedEnv.S3_SECRET_ACCESS_KEY,
    },
    ["--filter", "@wford26/accounting-documents-service", "dev"]
  )
);

children.push(
  startService(
    "reporting",
    {
      DATABASE_URL: resolvedEnv.REPORTING_DATABASE_URL,
      MINIO_API_URL: resolvedEnv.MINIO_API_URL,
      MINIO_ROOT_PASSWORD: resolvedEnv.MINIO_ROOT_PASSWORD,
      MINIO_ROOT_USER: resolvedEnv.MINIO_ROOT_USER,
      PORT: resolvedEnv.REPORTING_PORT,
      REDIS_URL: resolvedEnv.REDIS_URL,
      REPORTS_BUCKET: resolvedEnv.REPORTS_BUCKET,
      S3_ACCESS_KEY_ID: resolvedEnv.S3_ACCESS_KEY_ID,
      S3_ENDPOINT: resolvedEnv.S3_ENDPOINT,
      S3_REGION: resolvedEnv.S3_REGION,
      S3_SECRET_ACCESS_KEY: resolvedEnv.S3_SECRET_ACCESS_KEY,
    },
    ["--filter", "@wford26/accounting-reporting-service", "dev"]
  )
);

children.push(
  startService(
    "invoicing",
    {
      DATABASE_URL: resolvedEnv.INVOICING_DATABASE_URL,
      INVOICES_BUCKET: resolvedEnv.INVOICES_BUCKET,
      MINIO_API_URL: resolvedEnv.MINIO_API_URL,
      MINIO_ROOT_PASSWORD: resolvedEnv.MINIO_ROOT_PASSWORD,
      MINIO_ROOT_USER: resolvedEnv.MINIO_ROOT_USER,
      PORT: resolvedEnv.INVOICING_PORT,
      REDIS_URL: resolvedEnv.REDIS_URL,
      S3_ACCESS_KEY_ID: resolvedEnv.S3_ACCESS_KEY_ID,
      S3_ENDPOINT: resolvedEnv.S3_ENDPOINT,
      S3_REGION: resolvedEnv.S3_REGION,
      S3_SECRET_ACCESS_KEY: resolvedEnv.S3_SECRET_ACCESS_KEY,
    },
    ["--filter", "@wford26/accounting-invoicing-service", "dev"]
  )
);

children.push(
  startService(
    "gateway",
    {
      DOCUMENTS_SERVICE_URL: resolvedEnv.DOCUMENTS_SERVICE_URL,
      FRONTEND_ORIGIN: resolvedEnv.FRONTEND_ORIGIN,
      IDENTITY_SERVICE_URL: resolvedEnv.IDENTITY_SERVICE_URL,
      INVOICING_SERVICE_URL: resolvedEnv.INVOICING_SERVICE_URL,
      LEDGER_SERVICE_URL: resolvedEnv.LEDGER_SERVICE_URL,
      PORT: resolvedEnv.API_GATEWAY_PORT,
      REPORTING_SERVICE_URL: resolvedEnv.REPORTING_SERVICE_URL,
    },
    ["--filter", "@wford26/accounting-api-gateway", "dev"]
  )
);

children.push(
  startService(
    "web",
    {
      NEXT_PUBLIC_API_BASE_URL: resolvedEnv.NEXT_PUBLIC_API_BASE_URL,
      PORT: resolvedEnv.WEB_PORT,
    },
    ["--filter", "@wford26/accounting-web", "dev"]
  )
);
