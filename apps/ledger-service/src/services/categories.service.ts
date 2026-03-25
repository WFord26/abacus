import { LedgerServiceError } from "../lib/errors";

import type { LedgerCategoryRepository } from "../repositories/categories.repo";
import type { Category, CategoryTreeNode } from "@wford26/shared-types";

export type LedgerCategoriesService = {
  createCategory(input: {
    color?: string | null;
    name: string;
    organizationId: string;
    parentId?: string | null;
  }): Promise<Category>;
  deleteCategory(categoryId: string, organizationId: string): Promise<{ deleted: true }>;
  listCategories(organizationId: string): Promise<CategoryTreeNode[]>;
  updateCategory(
    categoryId: string,
    organizationId: string,
    input: {
      color?: string | null;
      name?: string;
      parentId?: string | null;
    }
  ): Promise<Category>;
};

function buildCategoryTree(categories: Category[]): CategoryTreeNode[] {
  const categoryMap = new Map<string, CategoryTreeNode>();

  for (const category of categories) {
    categoryMap.set(category.id, {
      ...category,
      children: [],
    });
  }

  const roots: CategoryTreeNode[] = [];

  for (const category of categoryMap.values()) {
    const parentId = category.parentId ?? null;
    const parent = parentId ? categoryMap.get(parentId) : null;

    if (parent) {
      parent.children.push(category);
      continue;
    }

    roots.push(category);
  }

  const sortTree = (nodes: CategoryTreeNode[]) => {
    nodes.sort((left, right) => left.name.localeCompare(right.name));
    for (const node of nodes) {
      sortTree(node.children);
    }
  };

  sortTree(roots);
  return roots;
}

function ensureParentIsValid(
  categoryId: string | null,
  proposedParentId: string | null,
  categories: Category[]
) {
  if (!proposedParentId) {
    return;
  }

  if (categoryId && proposedParentId === categoryId) {
    throw new LedgerServiceError("INVALID_CATEGORY_PARENT", "A category cannot parent itself", 400);
  }

  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const parent = categoriesById.get(proposedParentId);

  if (!parent) {
    throw new LedgerServiceError("CATEGORY_PARENT_NOT_FOUND", "Parent category not found", 404);
  }

  let currentParentId = parent.parentId ?? null;

  while (currentParentId) {
    if (categoryId && currentParentId === categoryId) {
      throw new LedgerServiceError(
        "INVALID_CATEGORY_PARENT",
        "Category hierarchy cannot contain cycles",
        400
      );
    }

    currentParentId = categoriesById.get(currentParentId)?.parentId ?? null;
  }
}

export function createLedgerCategoriesService(
  repository: LedgerCategoryRepository
): LedgerCategoriesService {
  return {
    async createCategory(input) {
      const categories = await repository.listCategoriesForOrganization(input.organizationId);
      const parentId = input.parentId ?? null;

      ensureParentIsValid(
        null,
        parentId,
        categories.filter((category) => category.isActive)
      );

      return repository.createCategory({
        ...(input.color !== undefined ? { color: input.color } : {}),
        name: input.name,
        organizationId: input.organizationId,
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      });
    },

    async deleteCategory(categoryId, organizationId) {
      const category = await repository.findCategoryById(categoryId, organizationId);

      if (!category) {
        throw new LedgerServiceError("NOT_FOUND", "Category not found", 404);
      }

      const assignmentCount = await repository.countTransactionAssignmentsForCategory(
        categoryId,
        organizationId
      );

      if (assignmentCount > 0) {
        throw new LedgerServiceError(
          "CATEGORY_HAS_TRANSACTIONS",
          "Cannot delete a category with assigned transactions",
          409
        );
      }

      await repository.softDeleteCategory(categoryId, organizationId);

      return {
        deleted: true as const,
      };
    },

    async listCategories(organizationId) {
      let categories = await repository.listCategoriesForOrganization(organizationId);

      if (categories.length === 0) {
        const totalCategoryCount = await repository.countCategoriesForOrganization(organizationId);

        if (totalCategoryCount === 0) {
          categories = await repository.createDefaultCategories(organizationId);
        }
      }

      return buildCategoryTree(categories);
    },

    async updateCategory(categoryId, organizationId, input) {
      const category = await repository.findCategoryById(categoryId, organizationId);

      if (!category) {
        throw new LedgerServiceError("NOT_FOUND", "Category not found", 404);
      }

      const categories = await repository.listCategoriesForOrganization(organizationId);
      const proposedParentId =
        input.parentId !== undefined ? input.parentId : (category.parentId ?? null);

      ensureParentIsValid(
        categoryId,
        proposedParentId,
        categories.filter((item) => item.isActive)
      );

      return repository.updateCategory(categoryId, organizationId, input);
    },
  };
}
