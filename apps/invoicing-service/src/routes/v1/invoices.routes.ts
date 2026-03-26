import { requireRole } from "@wford26/auth-sdk";

import { success } from "../../lib/response";
import { parseSchema } from "../../lib/validation";
import {
  createInvoiceBodySchema,
  invoiceParamsSchema,
  listInvoicesQuerySchema,
  updateInvoiceBodySchema,
} from "../../schemas/invoicing.schema";

import type { InvoicingService } from "../../services/invoicing.service";
import type { FastifyPluginAsync } from "fastify";

type InvoicesRoutesOptions = {
  service: InvoicingService;
};

const mutateRoles = ["owner", "admin", "accountant"] as const;

const invoicesRoutes: FastifyPluginAsync<InvoicesRoutesOptions> = async (fastify, options) => {
  fastify.get("/invoices", async (request) => {
    const query = parseSchema(listInvoicesQuerySchema, request.query);
    const invoices = await options.service.listInvoices(request.user!.organizationId, {
      ...(query.customerId !== undefined ? { customerId: query.customerId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
    });

    return success(invoices);
  });

  fastify.post(
    "/invoices",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request, reply) => {
      const body = parseSchema(createInvoiceBodySchema, request.body);
      const invoice = await options.service.createInvoice({
        customerId: body.customerId,
        ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
        ...(body.issueDate !== undefined ? { issueDate: body.issueDate } : {}),
        lineItems: body.lineItems,
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        organizationId: request.user!.organizationId,
        taxRate: body.taxRate ?? 0,
        userId: request.user!.userId,
      });

      reply.status(201);
      return success(invoice);
    }
  );

  fastify.get("/invoices/:invoiceId", async (request) => {
    const params = parseSchema(invoiceParamsSchema, request.params);
    const invoice = await options.service.getInvoice(
      params.invoiceId,
      request.user!.organizationId
    );

    return success(invoice);
  });

  fastify.patch(
    "/invoices/:invoiceId",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request) => {
      const params = parseSchema(invoiceParamsSchema, request.params);
      const body = parseSchema(updateInvoiceBodySchema, request.body);
      const invoice = await options.service.updateInvoice(
        params.invoiceId,
        request.user!.organizationId,
        {
          ...(body.customerId !== undefined ? { customerId: body.customerId } : {}),
          ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
          ...(body.issueDate !== undefined ? { issueDate: body.issueDate } : {}),
          ...(body.lineItems !== undefined ? { lineItems: body.lineItems } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          ...(body.status !== undefined ? { status: body.status } : {}),
          ...(body.taxRate !== undefined ? { taxRate: body.taxRate } : {}),
        }
      );

      return success(invoice);
    }
  );

  fastify.delete(
    "/invoices/:invoiceId",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request) => {
      const params = parseSchema(invoiceParamsSchema, request.params);
      const result = await options.service.deleteInvoice(
        params.invoiceId,
        request.user!.organizationId
      );

      return success(result);
    }
  );

  fastify.post(
    "/invoices/:invoiceId/send",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request) => {
      const params = parseSchema(invoiceParamsSchema, request.params);
      const invoice = await options.service.sendInvoice(
        params.invoiceId,
        request.user!.organizationId
      );

      return success(invoice);
    }
  );

  fastify.post(
    "/invoices/:invoiceId/mark-paid",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request) => {
      const params = parseSchema(invoiceParamsSchema, request.params);
      const invoice = await options.service.markInvoicePaid({
        invoiceId: params.invoiceId,
        organizationId: request.user!.organizationId,
        userId: request.user!.userId,
      });

      return success(invoice);
    }
  );

  fastify.get("/invoices/:invoiceId/pdf", async (request) => {
    const params = parseSchema(invoiceParamsSchema, request.params);
    const pdf = await options.service.getInvoicePdf(params.invoiceId, request.user!.organizationId);

    return success(pdf);
  });
};

export default invoicesRoutes;
