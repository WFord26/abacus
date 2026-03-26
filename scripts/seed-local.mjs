import {
  formatValidationErrors,
  loadLocalEnv,
  parseCliArgs,
  resolveLocalEnv,
  validateLocalEnv,
  writeLine,
} from "./lib/local-setup.mjs";

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const payload = response.headers.get("content-type")?.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      payload.error &&
      typeof payload.error === "object" &&
      "message" in payload.error
        ? payload.error.message
        : `${response.status} ${response.statusText}`;

    throw new Error(message);
  }

  return payload;
}

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

  const identityBaseUrl = `${resolvedEnv.IDENTITY_SERVICE_URL}/auth`;
  const seedDetails = {
    email: resolvedEnv.SEED_ADMIN_EMAIL,
    name: resolvedEnv.SEED_ADMIN_NAME,
    password: resolvedEnv.SEED_ADMIN_PASSWORD,
  };

  writeLine(`Target identity service: ${resolvedEnv.IDENTITY_SERVICE_URL}`);
  writeLine(`Seed admin email: ${seedDetails.email}`);

  if (dryRun) {
    writeLine("Dry run complete.");
    return;
  }

  const status = await requestJson(`${identityBaseUrl}/bootstrap-status`, {
    method: "GET",
  });

  const available =
    status &&
    typeof status === "object" &&
    "data" in status &&
    status.data &&
    typeof status.data === "object" &&
    "available" in status.data
      ? Boolean(status.data.available)
      : false;

  if (!available) {
    writeLine("Bootstrap admin already exists. No seed action taken.");
    return;
  }

  await requestJson(`${identityBaseUrl}/bootstrap-admin`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(seedDetails),
  });

  writeLine("Bootstrap admin created.");
  writeLine(`- Email: ${seedDetails.email}`);
  writeLine(`- Password: ${seedDetails.password}`);
}

void main().catch((error) => {
  console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
