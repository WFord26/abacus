import { requireRole } from "@wford26/auth-sdk";

import { success } from "../../lib/response";
import { parseSchema } from "../../lib/validation";
import {
  createTransactionBodySchema,
  listTransactionsQuerySchema,
  transactionParamsSchema,
  updateTransactionBodySchema,
} from "../../schemas/transactions.schema";

import type { LedgerTransactionsService } from "../../services/transactions.service";
import type { TransactionFilters } from "@wford26/shared-types";
import type { FastifyPluginAsync } from "fastify";

type TransactionsRoutesOptions = {
  service: LedgerTransactionsService;
};

const mutateRoles = ["owner", "admin", "accountant"] as const;

const transactionsRoutes: FastifyPluginAsync<TransactionsRoutesOptions> = async (
  fastify,
  options
) => {
  fastify.get("/transactions", async (request) => {
    const query = parseSchema(listTransactionsQuerySchema, request.query);
    const filters: TransactionFilters = {
      limit: query.limit ?? 50,
      page: query.page ?? 1,
      ...(query.accountId ? { accountId: query.accountId } : {}),
      ...(query.amountMax !== undefined ? { amountMax: query.amountMax } : {}),
      ...(query.amountMin !== undefined ? { amountMin: query.amountMin } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.dateFrom ? { dateFrom: query.dateFrom } : {}),
      ...(query.dateTo ? { dateTo: query.dateTo } : {}),
      ...(query.q ? { q: query.q } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const transactions = await options.service.listTransactions(
      request.user!.organizationId,
      filters
    );

    return success(transactions);
  });

  fastify.post(
    "/transactions",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request, reply) => {
      const body = parseSchema(createTransactionBodySchema, request.body);
      const transaction = await options.service.createTransaction({
        accountId: body.accountId,
        amount: body.amount,
        ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
        createdBy: request.user!.userId,
        date: body.date,
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.merchantRaw !== undefined ? { merchantRaw: body.merchantRaw } : {}),
        organizationId: request.user!.organizationId,
      });

      reply.status(201);
      return success(transaction);
    }
  );

  fastify.get("/transactions/:transactionId", async (request) => {
    const params = parseSchema(transactionParamsSchema, request.params);
    const transaction = await options.service.getTransaction(
      params.transactionId,
      request.user!.organizationId
    );

    return success(transaction);
  });

  fastify.patch(
    "/transactions/:transactionId",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request) => {
      const params = parseSchema(transactionParamsSchema, request.params);
      const body = parseSchema(updateTransactionBodySchema, request.body);
      const transaction = await options.service.updateTransaction(
        params.transactionId,
        request.user!.organizationId,
        request.user!.userId,
        {
          ...(body.amount !== undefined ? { amount: body.amount } : {}),
          ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
          ...(body.date !== undefined ? { date: body.date } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.merchantRaw !== undefined ? { merchantRaw: body.merchantRaw } : {}),
        }
      );

      return success(transaction);
    }
  );

  fastify.delete(
    "/transactions/:transactionId",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request) => {
      const params = parseSchema(transactionParamsSchema, request.params);
      const result = await options.service.deleteTransaction(
        params.transactionId,
        request.user!.organizationId
      );

      return success(result);
    }
  );
};

export default transactionsRoutes;
