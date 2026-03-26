import { buildReportingServiceApp } from "./app";

async function start() {
  const app = buildReportingServiceApp();
  const port = Number(process.env.PORT ?? 3003);
  const host = process.env.HOST ?? "0.0.0.0";

  try {
    await app.listen({
      host,
      port,
    });
  } catch (error) {
    app.log.error(error, "failed to start reporting service");
    process.exit(1);
  }
}

void start();
