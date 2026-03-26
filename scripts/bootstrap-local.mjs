import {
  dockerComposeFilePath,
  envFilePath,
  formatValidationErrors,
  loadLocalEnv,
  parseCliArgs,
  repoRoot,
  resolveLocalEnv,
  runCommand,
  validateLocalEnv,
  waitForTcpPort,
  writeLine,
} from "./lib/local-setup.mjs";

async function main() {
  const args = parseCliArgs();
  const dryRun = args.has("--dry-run");
  const fix = args.has("--fix");
  const skipMigrate = args.has("--skip-migrate");
  const { envStatus, fileEnv } = loadLocalEnv({
    fix,
  });
  const resolvedEnv = resolveLocalEnv(fileEnv);
  const validationErrors = validateLocalEnv(resolvedEnv);
  const redisUrl = new URL(resolvedEnv.REDIS_URL);
  const minioUrl = new URL(resolvedEnv.MINIO_API_URL);

  if (validationErrors.length > 0) {
    console.error(
      "Local environment validation failed:\n" + formatValidationErrors(validationErrors)
    );
    process.exit(1);
  }

  if (envStatus.created) {
    writeLine(`Created ${envFilePath} from .env.example`);
  }

  await runCommand("docker", ["compose", "-f", dockerComposeFilePath, "up", "-d"], {
    cwd: repoRoot,
    dryRun,
  });

  if (!dryRun) {
    writeLine("Waiting for local infrastructure ports...");
    await waitForTcpPort({
      host: resolvedEnv.POSTGRES_HOST,
      port: Number(resolvedEnv.POSTGRES_PORT),
    });
    await waitForTcpPort({
      host: redisUrl.hostname,
      port: Number(redisUrl.port || "6379"),
    });
    await waitForTcpPort({
      host: minioUrl.hostname,
      port: Number(minioUrl.port || (minioUrl.protocol === "https:" ? "443" : "80")),
    });
  }

  if (!skipMigrate) {
    await runCommand("node", ["scripts/migrate-all.mjs", ...(dryRun ? ["--dry-run"] : [])], {
      cwd: repoRoot,
      dryRun: false,
      env: {
        ...process.env,
        ...resolvedEnv,
      },
    });
  }

  if (dryRun) {
    writeLine("Dry run complete.");
    return;
  }

  writeLine("Local infrastructure is ready.");
  writeLine("Next steps:");
  writeLine("- Start the apps with: npm run dev");
  writeLine("- Seed the first admin with: npm run seed:local");
}

void main();
