import { buildApiGateway } from "./app";

async function start() {
  const app = buildApiGateway();
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "0.0.0.0";

  try {
    await app.listen({
      host,
      port,
    });
  } catch (error) {
    app.log.error(error, "failed to start api gateway");
    process.exit(1);
  }
}

void start();
