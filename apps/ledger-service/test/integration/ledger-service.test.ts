import { randomUUID } from "node:crypto";

import { signToken } from "@wford26/auth-sdk";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildLedgerServiceApp } from "../../src/app";

import type { LedgerAccountRepository } from "../../src/repositories/accounts.repo";
import type { LedgerCategoryRepository } from "../../src/repositories/categories.repo";
import type { Account, AccountType, Category, CategoryTreeNode, Role } from "@wford26/shared-types";

const JWT_SECRET = "ledger-test-secret";

type RepoState = {
  accounts: Map<string, Account>;
  categories: Map<string, Category>;
  categoryAssignmentCounts: Map<string, number>;
  transactionCounts: Map<string, number>;
  transactionSums: Map<string, number>;
};

function createAccountRecord(input: {
  code?: string | null;
  createdAt?: string;
  id?: string;
  isActive?: boolean;
  name: string;
  organizationId: string;
  type: AccountType;
}): Account {
  return {
    code: input.code ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
    id: input.id ?? randomUUID(),
    isActive: input.isActive ?? true,
    name: input.name,
    organizationId: input.organizationId,
    type: input.type,
  };
}

function createRepository(state: RepoState): LedgerAccountRepository {
  const defaultAccounts: ReadonlyArray<{ name: string; type: AccountType }> = [
    { name: "Checking Account", type: "cash" },
    { name: "Credit Card", type: "credit" },
    { name: "General Expenses", type: "expense" },
    { name: "Revenue", type: "income" },
  ];

  function getAccountsForOrganization(organizationId: string) {
    return [...state.accounts.values()].filter(
      (account) => account.organizationId === organizationId
    );
  }

  return {
    async countAccountsForOrganization(organizationId) {
      return getAccountsForOrganization(organizationId).length;
    },

    async countTransactionsForAccount(accountId, organizationId) {
      const account = state.accounts.get(accountId);

      if (!account || account.organizationId !== organizationId) {
        return 0;
      }

      return state.transactionCounts.get(accountId) ?? 0;
    },

    async createAccount(input) {
      const account = createAccountRecord(input);
      state.accounts.set(account.id, account);
      return account;
    },

    async createDefaultAccounts(organizationId) {
      const accounts = defaultAccounts.map((account) =>
        createAccountRecord({
          name: account.name,
          organizationId,
          type: account.type,
        })
      );

      for (const account of accounts) {
        state.accounts.set(account.id, account);
      }

      return accounts;
    },

    async findAccountById(accountId, organizationId) {
      const account = state.accounts.get(accountId);

      if (!account || account.organizationId !== organizationId || !account.isActive) {
        return null;
      }

      return account;
    },

    async listActiveAccountsForOrganization(organizationId) {
      return getAccountsForOrganization(organizationId)
        .filter((account) => account.isActive)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    },

    async softDeleteAccount(accountId, organizationId) {
      const account = state.accounts.get(accountId);

      if (!account || account.organizationId !== organizationId) {
        return;
      }

      state.accounts.set(accountId, {
        ...account,
        isActive: false,
      });
    },

    async sumTransactionsForAccount(accountId, organizationId) {
      const account = state.accounts.get(accountId);

      if (!account || account.organizationId !== organizationId) {
        return 0;
      }

      return state.transactionSums.get(accountId) ?? 0;
    },

    async updateAccount(accountId, organizationId, input) {
      const account = state.accounts.get(accountId);

      if (!account || account.organizationId !== organizationId || !account.isActive) {
        throw new Error("Account not found");
      }

      const updated = {
        ...account,
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
      };

      state.accounts.set(accountId, updated);
      return updated;
    },
  };
}

function createCategoryRecord(input: {
  color?: string | null;
  id?: string;
  isActive?: boolean;
  name: string;
  organizationId: string;
  parentId?: string | null;
}): Category {
  return {
    color: input.color ?? null,
    id: input.id ?? randomUUID(),
    isActive: input.isActive ?? true,
    name: input.name,
    organizationId: input.organizationId,
    parentId: input.parentId ?? null,
  };
}

function createCategoryRepository(state: RepoState): LedgerCategoryRepository {
  const defaultCategories: ReadonlyArray<{ isActive?: boolean; name: string }> = [
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

  function getCategoriesForOrganization(organizationId: string) {
    return [...state.categories.values()].filter(
      (category) => category.organizationId === organizationId
    );
  }

  return {
    async countCategoriesForOrganization(organizationId) {
      return getCategoriesForOrganization(organizationId).length;
    },

    async countTransactionAssignmentsForCategory(categoryId, organizationId) {
      const category = state.categories.get(categoryId);

      if (!category || category.organizationId !== organizationId) {
        return 0;
      }

      return state.categoryAssignmentCounts.get(categoryId) ?? 0;
    },

    async createCategory(input) {
      const category = createCategoryRecord(input);
      state.categories.set(category.id, category);
      return category;
    },

    async createDefaultCategories(organizationId) {
      const categories = defaultCategories.map((category) =>
        createCategoryRecord({
          isActive: category.isActive ?? true,
          name: category.name,
          organizationId,
        })
      );

      for (const category of categories) {
        state.categories.set(category.id, category);
      }

      return categories;
    },

    async findCategoryById(categoryId, organizationId) {
      const category = state.categories.get(categoryId);

      if (!category || category.organizationId !== organizationId) {
        return null;
      }

      return category;
    },

    async listCategoriesForOrganization(organizationId) {
      return getCategoriesForOrganization(organizationId).sort((left, right) =>
        left.name.localeCompare(right.name)
      );
    },

    async softDeleteCategory(categoryId, organizationId) {
      const category = state.categories.get(categoryId);

      if (!category || category.organizationId !== organizationId) {
        return;
      }

      state.categories.set(categoryId, {
        ...category,
        isActive: false,
      });
    },

    async updateCategory(categoryId, organizationId, input) {
      const category = state.categories.get(categoryId);

      if (!category || category.organizationId !== organizationId) {
        throw new Error("Category not found");
      }

      const updated = {
        ...category,
        ...(input.color !== undefined ? { color: input.color } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      };

      state.categories.set(categoryId, updated);
      return updated;
    },
  };
}

function createAccessToken(organizationId: string, role: Role = "owner") {
  return signToken(
    {
      email: "owner@example.com",
      organizationId,
      role,
      userId: randomUUID(),
    },
    JWT_SECRET,
    "15m"
  );
}

describe("ledger-service T-050 accounts CRUD", () => {
  let app: ReturnType<typeof buildLedgerServiceApp>;
  let state: RepoState;
  let organizationId: string;

  beforeEach(async () => {
    organizationId = randomUUID();
    state = {
      accounts: new Map(),
      categories: new Map(),
      categoryAssignmentCounts: new Map(),
      transactionCounts: new Map(),
      transactionSums: new Map(),
    };

    app = buildLedgerServiceApp({
      accountRepository: createRepository(state),
      categoryRepository: createCategoryRepository(state),
      jwtSecret: JWT_SECRET,
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("seeds default accounts the first time an org lists accounts", async () => {
    const token = createAccessToken(organizationId);

    const response = await request(app.server)
      .get("/accounts")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(4);
    expect(response.body.data.map((account: Account) => account.name)).toEqual([
      "Checking Account",
      "Credit Card",
      "General Expenses",
      "Revenue",
    ]);
  });

  it("creates and updates accounts for accountant-capable roles", async () => {
    const token = createAccessToken(organizationId, "accountant");

    const createResponse = await request(app.server)
      .post("/accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        code: "1000",
        name: "Operations Checking",
        type: "cash" satisfies AccountType,
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.name).toBe("Operations Checking");
    expect(createResponse.body.data.code).toBe("1000");

    const updateResponse = await request(app.server)
      .patch(`/accounts/${createResponse.body.data.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        code: "1010",
        name: "Primary Checking",
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.name).toBe("Primary Checking");
    expect(updateResponse.body.data.code).toBe("1010");
  });

  it("blocks viewer mutations but still allows reads", async () => {
    const token = createAccessToken(organizationId, "viewer");

    const listResponse = await request(app.server)
      .get("/accounts")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);

    const createResponse = await request(app.server)
      .post("/accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Viewer Attempt",
        type: "cash" satisfies AccountType,
      });

    expect(createResponse.status).toBe(403);
  });

  it("returns computed balances for cash and credit accounts", async () => {
    const cashAccount = createAccountRecord({
      name: "Checking Account",
      organizationId,
      type: "cash",
    });
    const creditAccount = createAccountRecord({
      name: "Corporate Card",
      organizationId,
      type: "credit",
    });

    state.accounts.set(cashAccount.id, cashAccount);
    state.accounts.set(creditAccount.id, creditAccount);
    state.transactionSums.set(cashAccount.id, 125.45);
    state.transactionSums.set(creditAccount.id, -60);

    const token = createAccessToken(organizationId);

    const cashResponse = await request(app.server)
      .get(`/accounts/${cashAccount.id}/balance`)
      .set("Authorization", `Bearer ${token}`);
    const creditResponse = await request(app.server)
      .get(`/accounts/${creditAccount.id}/balance`)
      .set("Authorization", `Bearer ${token}`);

    expect(cashResponse.status).toBe(200);
    expect(cashResponse.body.data.balance).toBe(125.45);
    expect(cashResponse.body.data.currency).toBe("USD");
    expect(creditResponse.status).toBe(200);
    expect(creditResponse.body.data.balance).toBe(60);
  });

  it("soft-deletes accounts without transactions and does not re-seed defaults afterward", async () => {
    const token = createAccessToken(organizationId);
    const account = createAccountRecord({
      name: "Temporary Account",
      organizationId,
      type: "expense",
    });

    state.accounts.set(account.id, account);

    const deleteResponse = await request(app.server)
      .delete(`/accounts/${account.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.data.deleted).toBe(true);
    expect(state.accounts.get(account.id)?.isActive).toBe(false);

    const listResponse = await request(app.server)
      .get("/accounts")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toEqual([]);
  });

  it("returns a conflict when deleting an account with transactions", async () => {
    const token = createAccessToken(organizationId);
    const account = createAccountRecord({
      name: "Operating Account",
      organizationId,
      type: "cash",
    });

    state.accounts.set(account.id, account);
    state.transactionCounts.set(account.id, 2);

    const response = await request(app.server)
      .delete(`/accounts/${account.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("ACCOUNT_HAS_TRANSACTIONS");
  });

  it("scopes accounts to the authenticated organization", async () => {
    const otherOrganizationId = randomUUID();
    const foreignAccount = createAccountRecord({
      id: randomUUID(),
      name: "Other Org Account",
      organizationId: otherOrganizationId,
      type: "cash",
    });

    state.accounts.set(foreignAccount.id, foreignAccount);

    const token = createAccessToken(organizationId);

    const response = await request(app.server)
      .get(`/accounts/${foreignAccount.id}/balance`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(404);
  });
});

describe("ledger-service T-051 categories CRUD", () => {
  let app: ReturnType<typeof buildLedgerServiceApp>;
  let state: RepoState;
  let organizationId: string;

  beforeEach(async () => {
    organizationId = randomUUID();
    state = {
      accounts: new Map(),
      categories: new Map(),
      categoryAssignmentCounts: new Map(),
      transactionCounts: new Map(),
      transactionSums: new Map(),
    };

    app = buildLedgerServiceApp({
      accountRepository: createRepository(state),
      categoryRepository: createCategoryRepository(state),
      jwtSecret: JWT_SECRET,
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("seeds default categories once and returns them as a tree", async () => {
    const token = createAccessToken(organizationId);

    const response = await request(app.server)
      .get("/categories")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(9);
    expect(response.body.data.map((category: CategoryTreeNode) => category.name)).toEqual([
      "Food & Dining",
      "Marketing",
      "Office Supplies",
      "Other",
      "Payroll",
      "Professional Services",
      "Software & Subscriptions",
      "Travel",
      "Utilities",
    ]);
    expect(
      response.body.data.find((category: CategoryTreeNode) => category.name === "Payroll")?.isActive
    ).toBe(false);
  });

  it("creates nested categories and returns them in the hierarchical tree", async () => {
    const token = createAccessToken(organizationId, "accountant");

    const parentResponse = await request(app.server)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        color: "#2563eb",
        name: "Meals",
      });

    expect(parentResponse.status).toBe(201);

    const childResponse = await request(app.server)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Client Lunches",
        parentId: parentResponse.body.data.id,
      });

    expect(childResponse.status).toBe(201);

    const listResponse = await request(app.server)
      .get("/categories")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0].name).toBe("Meals");
    expect(listResponse.body.data[0].children).toHaveLength(1);
    expect(listResponse.body.data[0].children[0].name).toBe("Client Lunches");
  });

  it("updates category metadata and parent relationships", async () => {
    const token = createAccessToken(organizationId, "admin");
    const operations = createCategoryRecord({
      name: "Operations",
      organizationId,
    });
    const software = createCategoryRecord({
      name: "Software",
      organizationId,
    });

    state.categories.set(operations.id, operations);
    state.categories.set(software.id, software);

    const response = await request(app.server)
      .patch(`/categories/${software.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        color: "#0f766e",
        name: "Software & Tools",
        parentId: operations.id,
      });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe("Software & Tools");
    expect(response.body.data.color).toBe("#0f766e");
    expect(response.body.data.parentId).toBe(operations.id);
  });

  it("prevents invalid parent cycles", async () => {
    const token = createAccessToken(organizationId, "owner");
    const parent = createCategoryRecord({
      name: "Parent",
      organizationId,
    });
    const child = createCategoryRecord({
      name: "Child",
      organizationId,
      parentId: parent.id,
    });

    state.categories.set(parent.id, parent);
    state.categories.set(child.id, child);

    const response = await request(app.server)
      .patch(`/categories/${parent.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        parentId: child.id,
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_CATEGORY_PARENT");
  });

  it("blocks viewer mutations but allows reads", async () => {
    const token = createAccessToken(organizationId, "viewer");

    const listResponse = await request(app.server)
      .get("/categories")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);

    const createResponse = await request(app.server)
      .post("/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Viewer Attempt",
      });

    expect(createResponse.status).toBe(403);
  });

  it("returns a conflict when deleting a category with assigned transactions", async () => {
    const token = createAccessToken(organizationId, "owner");
    const category = createCategoryRecord({
      name: "Travel",
      organizationId,
    });

    state.categories.set(category.id, category);
    state.categoryAssignmentCounts.set(category.id, 2);

    const response = await request(app.server)
      .delete(`/categories/${category.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("CATEGORY_HAS_TRANSACTIONS");
  });

  it("soft-deletes categories without reseeding defaults afterward", async () => {
    const token = createAccessToken(organizationId, "owner");
    const category = createCategoryRecord({
      name: "Deprecated Category",
      organizationId,
    });

    state.categories.set(category.id, category);

    const deleteResponse = await request(app.server)
      .delete(`/categories/${category.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(deleteResponse.status).toBe(200);
    expect(state.categories.get(category.id)?.isActive).toBe(false);

    const listResponse = await request(app.server)
      .get("/categories")
      .set("Authorization", `Bearer ${token}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);
    expect(listResponse.body.data[0].name).toBe("Deprecated Category");
    expect(listResponse.body.data[0].isActive).toBe(false);
  });
});
