import { buildLedgerServiceApp } from "./app";

async function start() {
  const app = buildLedgerServiceApp();
  const port = Number(process.env.PORT ?? 3002);
  const host = process.env.HOST ?? "0.0.0.0";

  try {
    await app.listen({
      host,
      port,
    });
  } catch (error) {
    app.log.error(error, "failed to start ledger service");
    process.exit(1);
  }
}

void start();
