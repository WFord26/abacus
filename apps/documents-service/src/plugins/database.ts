import { PrismaClient } from "@prisma/client";
import fp from "fastify-plugin";

import type { FastifyPluginAsync } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    db: PrismaClient;
  }
}

const databasePlugin: FastifyPluginAsync = async (fastify) => {
  const db = new PrismaClient();

  await db.$connect();
  fastify.decorate("db", db);

  fastify.addHook("onClose", async () => {
    await db.$disconnect();
  });
};

export default fp(databasePlugin, {
  fastify: "4.x",
  name: "documents-database-plugin",
});
