import { requireRole } from "@wford26/auth-sdk";

import { success } from "../../lib/response";
import { parseSchema } from "../../lib/validation";
import {
  accountParamsSchema,
  createAccountBodySchema,
  updateAccountBodySchema,
} from "../../schemas/accounts.schema";

import type { LedgerAccountsService } from "../../services/accounts.service";
import type { FastifyPluginAsync } from "fastify";

type AccountsRoutesOptions = {
  service: LedgerAccountsService;
};

const mutateRoles = ["owner", "admin", "accountant"] as const;

const accountsRoutes: FastifyPluginAsync<AccountsRoutesOptions> = async (fastify, options) => {
  fastify.get("/accounts", async (request) => {
    const organizationId = request.user!.organizationId;
    const accounts = await options.service.listAccounts(organizationId);

    return success(accounts);
  });

  fastify.post(
    "/accounts",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request, reply) => {
      const body = parseSchema(createAccountBodySchema, request.body);
      const account = await options.service.createAccount({
        ...(body.code !== undefined ? { code: body.code } : {}),
        name: body.name,
        organizationId: request.user!.organizationId,
        type: body.type,
      });

      reply.status(201);
      return success(account);
    }
  );

  fastify.patch(
    "/accounts/:accountId",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request) => {
      const params = parseSchema(accountParamsSchema, request.params);
      const body = parseSchema(updateAccountBodySchema, request.body);
      const account = await options.service.updateAccount(
        params.accountId,
        request.user!.organizationId,
        {
          ...(body.code !== undefined ? { code: body.code } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
        }
      );

      return success(account);
    }
  );

  fastify.delete(
    "/accounts/:accountId",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request) => {
      const params = parseSchema(accountParamsSchema, request.params);
      const result = await options.service.deleteAccount(
        params.accountId,
        request.user!.organizationId
      );

      return success(result);
    }
  );

  fastify.get("/accounts/:accountId/balance", async (request) => {
    const params = parseSchema(accountParamsSchema, request.params);
    const balance = await options.service.getAccountBalance(
      params.accountId,
      request.user!.organizationId
    );

    return success(balance);
  });
};

export default accountsRoutes;
