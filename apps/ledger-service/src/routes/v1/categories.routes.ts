import { requireRole } from "@wford26/auth-sdk";

import { success } from "../../lib/response";
import { parseSchema } from "../../lib/validation";
import {
  categoryParamsSchema,
  createCategoryBodySchema,
  updateCategoryBodySchema,
} from "../../schemas/categories.schema";

import type { LedgerCategoriesService } from "../../services/categories.service";
import type { FastifyPluginAsync } from "fastify";

type CategoriesRoutesOptions = {
  service: LedgerCategoriesService;
};

const mutateRoles = ["owner", "admin", "accountant"] as const;

const categoriesRoutes: FastifyPluginAsync<CategoriesRoutesOptions> = async (fastify, options) => {
  fastify.get("/categories", async (request) => {
    const categories = await options.service.listCategories(request.user!.organizationId);

    return success(categories);
  });

  fastify.post(
    "/categories",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request, reply) => {
      const body = parseSchema(createCategoryBodySchema, request.body);
      const category = await options.service.createCategory({
        ...(body.color !== undefined ? { color: body.color } : {}),
        name: body.name,
        organizationId: request.user!.organizationId,
        ...(body.parentId !== undefined ? { parentId: body.parentId } : {}),
      });

      reply.status(201);
      return success(category);
    }
  );

  fastify.patch(
    "/categories/:categoryId",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request) => {
      const params = parseSchema(categoryParamsSchema, request.params);
      const body = parseSchema(updateCategoryBodySchema, request.body);
      const category = await options.service.updateCategory(
        params.categoryId,
        request.user!.organizationId,
        {
          ...(body.color !== undefined ? { color: body.color } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.parentId !== undefined ? { parentId: body.parentId } : {}),
        }
      );

      return success(category);
    }
  );

  fastify.delete(
    "/categories/:categoryId",
    {
      preHandler: requireRole([...mutateRoles]),
    },
    async (request) => {
      const params = parseSchema(categoryParamsSchema, request.params);
      const result = await options.service.deleteCategory(
        params.categoryId,
        request.user!.organizationId
      );

      return success(result);
    }
  );
};

export default categoriesRoutes;
