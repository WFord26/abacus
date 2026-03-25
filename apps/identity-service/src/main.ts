import { buildIdentityServiceApp } from "./app";

async function start() {
  const app = buildIdentityServiceApp();
  const port = Number(process.env.PORT ?? 3001);
  const host = process.env.HOST ?? "0.0.0.0";

  try {
    await app.listen({
      host,
      port,
    });
  } catch (error) {
    app.log.error(error, "failed to start identity service");
    process.exit(1);
  }
}

void start();
