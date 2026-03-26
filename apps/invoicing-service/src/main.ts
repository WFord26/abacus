import { buildInvoicingServiceApp } from "./app";

async function start() {
  const app = buildInvoicingServiceApp();
  const port = Number(process.env.PORT ?? 3006);
  const host = process.env.HOST ?? "0.0.0.0";

  try {
    await app.listen({
      host,
      port,
    });
  } catch (error) {
    app.log.error(error, "failed to start invoicing service");
    process.exit(1);
  }
}

void start();
