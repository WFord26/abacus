import { requireRole } from "@wford26/auth-sdk";

import { success } from "../../lib/response";
import { parseSchema } from "../../lib/validation";
import {
  documentIdParamsSchema,
  documentTransactionParamsSchema,
  finalizeDocumentBodySchema,
  linkTransactionBodySchema,
  listDocumentsQuerySchema,
  uploadUrlBodySchema,
  transactionIdParamsSchema,
} from "../../schemas/documents.schema";

import type { DocumentsService } from "../../services/documents.service";
import type { FastifyPluginAsync } from "fastify";

type DocumentsRoutesOptions = {
  service: DocumentsService;
};

const mutateRoles = ["owner", "admin", "accountant"] as const;

const documentsRoutes: FastifyPluginAsync<DocumentsRoutesOptions> = async (fastify, options) => {
  fastify.post("/documents/upload-url", async (request) => {
    const body = parseSchema(uploadUrlBodySchema, request.body);
    const result = await options.service.requestUploadUrl({
      contentType: body.contentType,
      filename: body.filename,
      organizationId: request.user!.organizationId,
      size: body.size,
      userId: request.user!.userId,
    });

    return success(result);
  });

  fastify.post("/documents", async (request, reply) => {
    const body = parseSchema(finalizeDocumentBodySchema, request.body);
    const result = await options.service.finalizeDocument({
      documentId: body.documentId,
      organizationId: request.user!.organizationId,
      s3Key: body.s3Key,
      userId: request.user!.userId,
    });

    reply.status(201);
    return success(result);
  });

  fastify.get("/documents", async (request) => {
    const query = parseSchema(listDocumentsQuerySchema, request.query);
    const result = await options.service.listDocuments(request.user!.organizationId, {
      limit: query.limit ?? 50,
      page: query.page ?? 1,
    });

    return success(result);
  });

  fastify.get("/documents/:documentId", async (request) => {
    const params = parseSchema(documentIdParamsSchema, request.params);
    const result = await options.service.getDocument(
      params.documentId,
      request.user!.organizationId
    );

    return success(result);
  });

  fastify.delete(
    "/documents/:documentId",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request) => {
      const params = parseSchema(documentIdParamsSchema, request.params);
      const result = await options.service.deleteDocument(
        params.documentId,
        request.user!.organizationId
      );

      return success(result);
    }
  );

  fastify.post(
    "/documents/:documentId/link-transaction",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request, reply) => {
      const params = parseSchema(documentIdParamsSchema, request.params);
      const body = parseSchema(linkTransactionBodySchema, request.body);
      const result = await options.service.linkTransaction({
        documentId: params.documentId,
        organizationId: request.user!.organizationId,
        transactionId: body.transactionId,
        userId: request.user!.userId,
      });

      reply.status(201);
      return success(result);
    }
  );

  fastify.delete(
    "/documents/:documentId/link-transaction/:transactionId",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request) => {
      const params = parseSchema(documentTransactionParamsSchema, request.params);
      const result = await options.service.unlinkTransaction({
        documentId: params.documentId,
        organizationId: request.user!.organizationId,
        transactionId: params.transactionId,
      });

      return success(result);
    }
  );

  fastify.get("/documents/by-transaction/:transactionId", async (request) => {
    const params = parseSchema(transactionIdParamsSchema, request.params);
    const result = await options.service.listDocumentsByTransaction(
      request.user!.organizationId,
      params.transactionId
    );

    return success(result);
  });
};

export default documentsRoutes;
