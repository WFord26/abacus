import { requireRole } from "@wford26/auth-sdk";

import { success } from "../../lib/response";
import { parseSchema } from "../../lib/validation";
import {
  customerBodySchema,
  customerParamsSchema,
  updateCustomerBodySchema,
} from "../../schemas/invoicing.schema";

import type { InvoicingService } from "../../services/invoicing.service";
import type { FastifyPluginAsync } from "fastify";

type CustomersRoutesOptions = {
  service: InvoicingService;
};

const mutateRoles = ["owner", "admin", "accountant"] as const;

const customersRoutes: FastifyPluginAsync<CustomersRoutesOptions> = async (fastify, options) => {
  fastify.get("/customers", async (request) => {
    const customers = await options.service.listCustomers(request.user!.organizationId);

    return success(customers);
  });

  fastify.post(
    "/customers",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request, reply) => {
      const body = parseSchema(customerBodySchema, request.body);
      const customer = await options.service.createCustomer({
        ...(body.address !== undefined ? { address: body.address } : {}),
        ...(body.email !== undefined ? { email: body.email } : {}),
        name: body.name,
        organizationId: request.user!.organizationId,
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
      });

      reply.status(201);
      return success(customer);
    }
  );

  fastify.patch(
    "/customers/:customerId",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request) => {
      const params = parseSchema(customerParamsSchema, request.params);
      const body = parseSchema(updateCustomerBodySchema, request.body);
      const customer = await options.service.updateCustomer(
        params.customerId,
        request.user!.organizationId,
        {
          ...(body.address !== undefined ? { address: body.address } : {}),
          ...(body.email !== undefined ? { email: body.email } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.phone !== undefined ? { phone: body.phone } : {}),
        }
      );

      return success(customer);
    }
  );

  fastify.delete(
    "/customers/:customerId",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request) => {
      const params = parseSchema(customerParamsSchema, request.params);
      const result = await options.service.deleteCustomer(
        params.customerId,
        request.user!.organizationId
      );

      return success(result);
    }
  );
};

export default customersRoutes;
