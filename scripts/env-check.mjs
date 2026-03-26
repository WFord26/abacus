import {
  envFilePath,
  formatValidationErrors,
  loadLocalEnv,
  parseCliArgs,
  resolveLocalEnv,
  validateLocalEnv,
  writeLine,
} from "./lib/local-setup.mjs";

async function main() {
  const args = parseCliArgs();
  const fix = args.has("--fix");

  const { envStatus, fileEnv } = loadLocalEnv({
    fix,
  });
  const resolvedEnv = resolveLocalEnv(fileEnv);
  const validationErrors = validateLocalEnv(resolvedEnv);

  if (envStatus.created) {
    writeLine(`Created ${envFilePath} from .env.example`);
  }

  if (validationErrors.length > 0) {
    console.error(
      "Local environment validation failed:\n" + formatValidationErrors(validationErrors)
    );
    process.exit(1);
  }

  writeLine(`Environment OK: ${envStatus.path}`);
  writeLine(`- API gateway: ${resolvedEnv.HOST}:${resolvedEnv.API_GATEWAY_PORT}`);
  writeLine(`- Web: ${resolvedEnv.HOST}:${resolvedEnv.WEB_PORT}`);
  writeLine(`- PostgreSQL: ${resolvedEnv.POSTGRES_HOST}:${resolvedEnv.POSTGRES_PORT}`);
  writeLine(`- Redis: ${resolvedEnv.REDIS_URL}`);
  writeLine(`- MinIO: ${resolvedEnv.MINIO_API_URL}`);
}

void main();
