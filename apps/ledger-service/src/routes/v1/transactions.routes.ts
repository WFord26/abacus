import { requireRole } from "@wford26/auth-sdk";

import { LedgerServiceError } from "../../lib/errors";
import { success } from "../../lib/response";
import { parseSchema } from "../../lib/validation";
import { importTransactionsCsvFieldsSchema } from "../../schemas/import-batches.schema";
import {
  createTransactionBodySchema,
  listTransactionsQuerySchema,
  reviewTransactionBodySchema,
  transactionParamsSchema,
  updateTransactionBodySchema,
} from "../../schemas/transactions.schema";

import type { LedgerImportBatchesService } from "../../services/import-batches.service";
import type { LedgerTransactionsService } from "../../services/transactions.service";
import type { TransactionFilters } from "@wford26/shared-types";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";

type TransactionsRoutesOptions = {
  importService: LedgerImportBatchesService;
  service: LedgerTransactionsService;
};

const mutateRoles = ["owner", "admin", "accountant"] as const;

async function parseCsvImportRequest(request: FastifyRequest) {
  let accountId: string | undefined;
  let content: string | undefined;
  let filename: string | undefined;

  for await (const part of request.parts()) {
    if (part.type === "file") {
      if (part.fieldname !== "file") {
        continue;
      }

      filename = part.filename;
      content = (await part.toBuffer()).toString("utf8");
      continue;
    }

    if (part.fieldname === "accountId") {
      accountId = String(part.value);
    }
  }

  const fields = parseSchema(importTransactionsCsvFieldsSchema, {
    accountId,
  });

  if (!content) {
    throw new LedgerServiceError("VALIDATION_ERROR", "CSV file is required", 400, {
      path: "file",
    });
  }

  return {
    accountId: fields.accountId,
    content,
    ...(filename ? { filename } : {}),
  };
}

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

  fastify.get("/transactions/review-queue", async (request) => {
    const transactions = await options.service.listTransactions(request.user!.organizationId, {
      limit: 100,
      page: 1,
      status: "unreviewed",
    });

    return success(transactions);
  });

  fastify.post(
    "/transactions/import/csv",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request, reply) => {
      const upload = await parseCsvImportRequest(request);
      const batch = await options.importService.importTransactionsCsv({
        accountId: upload.accountId,
        content: upload.content,
        createdBy: request.user!.userId,
        ...(upload.filename !== undefined ? { filename: upload.filename } : {}),
        organizationId: request.user!.organizationId,
      });

      reply.status(201);
      return success(batch);
    }
  );

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

  fastify.post(
    "/transactions/:transactionId/review",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request) => {
      const params = parseSchema(transactionParamsSchema, request.params);
      const body = parseSchema(reviewTransactionBodySchema, request.body);
      const transaction = await options.service.reviewTransaction(
        params.transactionId,
        request.user!.organizationId,
        request.user!.userId,
        body.status
      );

      return success(transaction);
    }
  );

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
