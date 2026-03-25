import type { PrismaClient } from "@prisma/client";
import type { Category } from "@wford26/shared-types";

type CategoryRecord = Category;

export type LedgerCategoryRepository = {
  countCategoriesForOrganization(organizationId: string): Promise<number>;
  countTransactionAssignmentsForCategory(
    categoryId: string,
    organizationId: string
  ): Promise<number>;
  createCategory(input: {
    color?: string | null;
    name: string;
    organizationId: string;
    parentId?: string | null;
  }): Promise<CategoryRecord>;
  createDefaultCategories(organizationId: string): Promise<CategoryRecord[]>;
  findCategoryById(categoryId: string, organizationId: string): Promise<CategoryRecord | null>;
  listCategoriesForOrganization(organizationId: string): Promise<CategoryRecord[]>;
  softDeleteCategory(categoryId: string, organizationId: string): Promise<void>;
  updateCategory(
    categoryId: string,
    organizationId: string,
    input: {
      color?: string | null;
      name?: string;
      parentId?: string | null;
    }
  ): Promise<CategoryRecord>;
};

function toCategoryRecord(category: {
  color: string | null;
  id: string;
  isActive: boolean;
  name: string;
  organizationId: string;
  parentId: string | null;
}): CategoryRecord {
  return {
    color: category.color,
    id: category.id,
    isActive: category.isActive,
    name: category.name,
    organizationId: category.organizationId,
    parentId: category.parentId,
  };
}

const defaultCategories: ReadonlyArray<{
  isActive?: boolean;
  name: string;
}> = [
  { name: "Food & Dining" },
  { name: "Travel" },
  { name: "Software & Subscriptions" },
  { name: "Office Supplies" },
  { name: "Marketing" },
  { name: "Professional Services" },
  { name: "Utilities" },
  { isActive: false, name: "Payroll" },
  { name: "Other" },
];

export function createPrismaLedgerCategoryRepository(db: PrismaClient): LedgerCategoryRepository {
  return {
    async countCategoriesForOrganization(organizationId) {
      return db.category.count({
        where: {
          organizationId,
        },
      });
    },

    async countTransactionAssignmentsForCategory(categoryId, organizationId) {
      const [transactionCount, lineCount] = await Promise.all([
        db.transaction.count({
          where: {
            categoryId,
            organizationId,
          },
        }),
        db.transactionLine.count({
          where: {
            categoryId,
            organizationId,
          },
        }),
      ]);

      return transactionCount + lineCount;
    },

    async createCategory(input) {
      const category = await db.category.create({
        data: {
          ...(input.color !== undefined ? { color: input.color } : {}),
          name: input.name,
          organizationId: input.organizationId,
          ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        },
      });

      return toCategoryRecord(category);
    },

    async createDefaultCategories(organizationId) {
      return db.$transaction(async (transaction) => {
        const existingCount = await transaction.category.count({
          where: {
            organizationId,
          },
        });

        if (existingCount > 0) {
          const categories = await transaction.category.findMany({
            orderBy: [{ name: "asc" }, { id: "asc" }],
            where: {
              organizationId,
            },
          });

          return categories.map(toCategoryRecord);
        }

        const createdCategories = [];

        for (const category of defaultCategories) {
          const created = await transaction.category.create({
            data: {
              isActive: category.isActive ?? true,
              name: category.name,
              organizationId,
            },
          });

          createdCategories.push(created);
        }

        return createdCategories.map(toCategoryRecord);
      });
    },

    async findCategoryById(categoryId, organizationId) {
      const category = await db.category.findFirst({
        where: {
          id: categoryId,
          organizationId,
        },
      });

      return category ? toCategoryRecord(category) : null;
    },

    async listCategoriesForOrganization(organizationId) {
      const categories = await db.category.findMany({
        orderBy: [{ name: "asc" }, { id: "asc" }],
        where: {
          organizationId,
        },
      });

      return categories.map(toCategoryRecord);
    },

    async softDeleteCategory(categoryId, organizationId) {
      await db.category.updateMany({
        data: {
          isActive: false,
        },
        where: {
          id: categoryId,
          organizationId,
        },
      });
    },

    async updateCategory(categoryId, organizationId, input) {
      await db.category.updateMany({
        data: {
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        },
        where: {
          id: categoryId,
          organizationId,
        },
      });

      const category = await db.category.findFirst({
        where: {
          id: categoryId,
          organizationId,
        },
      });

      if (!category) {
        throw new Error("Category not found after update");
      }

      return toCategoryRecord(category);
    },
  };
}
