import { buildDocumentsServiceApp } from "./app";

async function start() {
  const app = buildDocumentsServiceApp();
  const port = Number(process.env.PORT ?? 3004);
  const host = process.env.HOST ?? "0.0.0.0";

  try {
    await app.listen({
      host,
      port,
    });
  } catch (error) {
    app.log.error(error, "failed to start documents service");
    process.exit(1);
  }
}

void start();
