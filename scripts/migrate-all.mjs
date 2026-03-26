import {
  formatValidationErrors,
  loadLocalEnv,
  parseCliArgs,
  repoRoot,
  resolveLocalEnv,
  runCommand,
  validateLocalEnv,
  writeLine,
} from "./lib/local-setup.mjs";

async function main() {
  const args = parseCliArgs();
  const dryRun = args.has("--dry-run");
  const fix = args.has("--fix");
  const { fileEnv } = loadLocalEnv({
    fix,
  });
  const resolvedEnv = resolveLocalEnv(fileEnv);
  const validationErrors = validateLocalEnv(resolvedEnv);

  if (validationErrors.length > 0) {
    console.error(
      "Local environment validation failed:\n" + formatValidationErrors(validationErrors)
    );
    process.exit(1);
  }

  await runCommand("bash", ["infrastructure/scripts/seed-db.sh"], {
    cwd: repoRoot,
    dryRun,
    env: {
      ...process.env,
      ...resolvedEnv,
    },
  });

  if (!dryRun) {
    writeLine("All schema migrations applied.");
  }
}

void main();
