import { randomUUID } from "node:crypto";

import { signToken } from "@wford26/auth-sdk";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildLedgerServiceApp } from "../../src/app";

import type { LedgerEventPublisher } from "../../src/lib/events";
import type { LedgerAccountRepository } from "../../src/repositories/accounts.repo";
import type { LedgerCategoryRepository } from "../../src/repositories/categories.repo";
import type { LedgerTransactionRepository } from "../../src/repositories/transactions.repo";
import type { AbacusEvent } from "@wford26/event-contracts";
import type {
  Account,
  AccountType,
  Category,
  CategoryTreeNode,
  Role,
  Transaction,
  TransactionFilters,
} from "@wford26/shared-types";

const JWT_SECRET = "ledger-test-secret";

type RepoState = {
  accounts: Map<string, Account>;
  categories: Map<string, Category>;
  categoryAssignmentCounts: Map<string, number>;
  publishedEvents: AbacusEvent[];
  transactionCounts: Map<string, number>;
  transactionSums: Map<string, number>;
  transactions: Map<string, StoredTransaction>;
};

type StoredTransaction = {
  accountId: string;
  amount: number;
  categoryId: string | null;
  createdAt: string;
  createdBy: string;
  date: string;
  description: string | null;
  id: string;
  importBatchId: string | null;
  isActive: boolean;
  isSplit: boolean;
  merchantRaw: string | null;
  organizationId: string;
  reviewStatus: Transaction["reviewStatus"];
  updatedAt: string;
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

function createTransactionRecord(input: {
  accountId: string;
  amount: number;
  categoryId?: string | null;
  createdAt?: string;
  createdBy: string;
  date: string;
  description?: string | null;
  id?: string;
  importBatchId?: string | null;
  isActive?: boolean;
  isSplit?: boolean;
  merchantRaw?: string | null;
  organizationId: string;
  reviewStatus?: Transaction["reviewStatus"];
  updatedAt?: string;
}): StoredTransaction {
  return {
    accountId: input.accountId,
    amount: input.amount,
    categoryId: input.categoryId ?? null,
    createdAt: input.createdAt ?? new Date().toISOString(),
    createdBy: input.createdBy,
    date: input.date,
    description: input.description ?? null,
    id: input.id ?? randomUUID(),
    importBatchId: input.importBatchId ?? null,
    isActive: input.isActive ?? true,
    isSplit: input.isSplit ?? false,
    merchantRaw: input.merchantRaw ?? null,
    organizationId: input.organizationId,
    reviewStatus: input.reviewStatus ?? "unreviewed",
    updatedAt: input.updatedAt ?? new Date().toISOString(),
  };
}

function createTransactionRepository(state: RepoState): LedgerTransactionRepository {
  function adjustAccountStats(accountId: string, amountDelta: number, countDelta: number) {
    state.transactionCounts.set(
      accountId,
      (state.transactionCounts.get(accountId) ?? 0) + countDelta
    );
    state.transactionSums.set(
      accountId,
      Math.round(((state.transactionSums.get(accountId) ?? 0) + amountDelta) * 100) / 100
    );
  }

  function adjustCategoryStats(categoryId: string | null, countDelta: number) {
    if (!categoryId) {
      return;
    }

    state.categoryAssignmentCounts.set(
      categoryId,
      (state.categoryAssignmentCounts.get(categoryId) ?? 0) + countDelta
    );
  }

  function toTransaction(record: StoredTransaction): Transaction {
    const { isActive: _isActive, ...transaction } = record;
    return transaction;
  }

  function matchesFilters(transaction: StoredTransaction, filters: TransactionFilters) {
    if (!transaction.isActive) {
      return false;
    }

    if (filters.accountId && transaction.accountId !== filters.accountId) {
      return false;
    }

    if (filters.categoryId && transaction.categoryId !== filters.categoryId) {
      return false;
    }

    if (filters.status && transaction.reviewStatus !== filters.status) {
      return false;
    }

    if (filters.dateFrom && transaction.date < filters.dateFrom) {
      return false;
    }

    if (filters.dateTo && transaction.date > filters.dateTo) {
      return false;
    }

    if (filters.q) {
      const haystack =
        `${transaction.description ?? ""} ${transaction.merchantRaw ?? ""}`.toLowerCase();
      if (!haystack.includes(filters.q.toLowerCase())) {
        return false;
      }
    }

    if (filters.amountMin !== undefined && transaction.amount < filters.amountMin) {
      return false;
    }

    if (filters.amountMax !== undefined && transaction.amount > filters.amountMax) {
      return false;
    }

    return true;
  }

  return {
    async createTransaction(input) {
      const transaction = createTransactionRecord(input);
      state.transactions.set(transaction.id, transaction);
      adjustAccountStats(transaction.accountId, transaction.amount, 1);
      adjustCategoryStats(transaction.categoryId ?? null, 1);
      return toTransaction(transaction);
    },

    async findTransactionById(transactionId, organizationId) {
      const transaction = state.transactions.get(transactionId);

      if (!transaction || transaction.organizationId !== organizationId) {
        return null;
      }

      return transaction;
    },

    async listTransactions(organizationId, filters) {
      const matchedTransactions = [...state.transactions.values()]
        .filter((transaction) => transaction.organizationId === organizationId)
        .filter((transaction) => matchesFilters(transaction, filters))
        .sort((left, right) => {
          if (left.date === right.date) {
            return right.createdAt.localeCompare(left.createdAt);
          }

          return right.date.localeCompare(left.date);
        });
      const total = matchedTransactions.length;
      const startIndex = (filters.page - 1) * filters.limit;

      return {
        total,
        transactions: matchedTransactions
          .slice(startIndex, startIndex + filters.limit)
          .map(toTransaction),
      };
    },

    async softDeleteTransaction(transactionId, organizationId) {
      const transaction = state.transactions.get(transactionId);

      if (!transaction || transaction.organizationId !== organizationId || !transaction.isActive) {
        return;
      }

      state.transactions.set(transactionId, {
        ...transaction,
        isActive: false,
        updatedAt: new Date().toISOString(),
      });
      adjustAccountStats(transaction.accountId, -transaction.amount, -1);
      adjustCategoryStats(transaction.categoryId ?? null, -1);
    },

    async updateTransaction(transactionId, organizationId, input) {
      const transaction = state.transactions.get(transactionId);

      if (!transaction || transaction.organizationId !== organizationId || !transaction.isActive) {
        throw new Error("Transaction not found");
      }

      if (input.amount !== undefined && input.amount !== transaction.amount) {
        adjustAccountStats(transaction.accountId, -transaction.amount, 0);
        adjustAccountStats(transaction.accountId, input.amount, 0);
      }

      if (input.categoryId !== undefined && input.categoryId !== transaction.categoryId) {
        adjustCategoryStats(transaction.categoryId ?? null, -1);
        adjustCategoryStats(input.categoryId ?? null, 1);
      }

      const updated = {
        ...transaction,
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.date !== undefined ? { date: input.date } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.merchantRaw !== undefined ? { merchantRaw: input.merchantRaw } : {}),
        updatedAt: new Date().toISOString(),
      };

      state.transactions.set(transactionId, updated);
      return toTransaction(updated);
    },
  };
}

function createEventPublisher(state: RepoState): LedgerEventPublisher {
  return {
    async publish(event) {
      state.publishedEvents.push(event);
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
      publishedEvents: [],
      transactionCounts: new Map(),
      transactionSums: new Map(),
      transactions: new Map(),
    };

    app = buildLedgerServiceApp({
      accountRepository: createRepository(state),
      categoryRepository: createCategoryRepository(state),
      eventPublisher: createEventPublisher(state),
      jwtSecret: JWT_SECRET,
      transactionRepository: createTransactionRepository(state),
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
      publishedEvents: [],
      transactionCounts: new Map(),
      transactionSums: new Map(),
      transactions: new Map(),
    };

    app = buildLedgerServiceApp({
      accountRepository: createRepository(state),
      categoryRepository: createCategoryRepository(state),
      eventPublisher: createEventPublisher(state),
      jwtSecret: JWT_SECRET,
      transactionRepository: createTransactionRepository(state),
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

describe("ledger-service T-052 transactions CRUD", () => {
  let app: ReturnType<typeof buildLedgerServiceApp>;
  let state: RepoState;
  let organizationId: string;

  beforeEach(async () => {
    organizationId = randomUUID();
    state = {
      accounts: new Map(),
      categories: new Map(),
      categoryAssignmentCounts: new Map(),
      publishedEvents: [],
      transactionCounts: new Map(),
      transactionSums: new Map(),
      transactions: new Map(),
    };

    app = buildLedgerServiceApp({
      accountRepository: createRepository(state),
      categoryRepository: createCategoryRepository(state),
      eventPublisher: createEventPublisher(state),
      jwtSecret: JWT_SECRET,
      transactionRepository: createTransactionRepository(state),
    });

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates transactions and publishes transaction.created events", async () => {
    const account = createAccountRecord({
      name: "Operating Checking",
      organizationId,
      type: "cash",
    });
    const category = createCategoryRecord({
      name: "Meals",
      organizationId,
    });
    const userId = randomUUID();
    const token = signToken(
      {
        email: "accountant@example.com",
        organizationId,
        role: "accountant",
        userId,
      },
      JWT_SECRET,
      "15m"
    );

    state.accounts.set(account.id, account);
    state.categories.set(category.id, category);

    const response = await request(app.server)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        accountId: account.id,
        amount: 125.45,
        categoryId: category.id,
        date: "2026-03-15",
        description: "Client lunch",
        merchantRaw: "Blue Sparrow",
        organizationId: randomUUID(),
      });

    expect(response.status).toBe(201);
    expect(response.body.data.accountId).toBe(account.id);
    expect(response.body.data.organizationId).toBe(organizationId);
    expect(response.body.data.amount).toBe(125.45);
    expect(response.body.data.reviewStatus).toBe("unreviewed");
    expect(state.transactionCounts.get(account.id)).toBe(1);
    expect(state.categoryAssignmentCounts.get(category.id)).toBe(1);
    expect(state.publishedEvents).toHaveLength(1);
    expect(state.publishedEvents[0]).toMatchObject({
      eventType: "transaction.created",
      organizationId,
      payload: {
        accountId: account.id,
        amount: 125.45,
        categoryId: category.id,
        date: "2026-03-15",
        description: "Client lunch",
        merchantRaw: "Blue Sparrow",
        transactionId: response.body.data.id,
      },
      userId,
      version: "1.0",
    });
  });

  it("lists transactions with pagination and combined filters", async () => {
    const primaryAccount = createAccountRecord({
      name: "Primary Checking",
      organizationId,
      type: "cash",
    });
    const savingsAccount = createAccountRecord({
      name: "Savings",
      organizationId,
      type: "cash",
    });
    const mealsCategory = createCategoryRecord({
      name: "Meals",
      organizationId,
    });
    const travelCategory = createCategoryRecord({
      name: "Travel",
      organizationId,
    });

    state.accounts.set(primaryAccount.id, primaryAccount);
    state.accounts.set(savingsAccount.id, savingsAccount);
    state.categories.set(mealsCategory.id, mealsCategory);
    state.categories.set(travelCategory.id, travelCategory);

    const matchingOne = createTransactionRecord({
      accountId: primaryAccount.id,
      amount: 25.5,
      categoryId: mealsCategory.id,
      createdAt: "2026-03-20T09:00:00.000Z",
      createdBy: randomUUID(),
      date: "2026-03-20",
      description: "Coffee with client",
      merchantRaw: "Roaster",
      organizationId,
      reviewStatus: "unreviewed",
    });
    const matchingTwo = createTransactionRecord({
      accountId: primaryAccount.id,
      amount: 42,
      categoryId: mealsCategory.id,
      createdAt: "2026-03-19T09:00:00.000Z",
      createdBy: randomUUID(),
      date: "2026-03-19",
      description: "Client lunch downtown",
      merchantRaw: "Bistro 17",
      organizationId,
      reviewStatus: "unreviewed",
    });
    const wrongStatus = createTransactionRecord({
      accountId: primaryAccount.id,
      amount: 19,
      categoryId: mealsCategory.id,
      createdAt: "2026-03-18T09:00:00.000Z",
      createdBy: randomUUID(),
      date: "2026-03-18",
      description: "Coffee supplies",
      merchantRaw: "Office Depot",
      organizationId,
      reviewStatus: "reviewed",
    });
    const wrongAccount = createTransactionRecord({
      accountId: savingsAccount.id,
      amount: 31,
      categoryId: mealsCategory.id,
      createdAt: "2026-03-17T09:00:00.000Z",
      createdBy: randomUUID(),
      date: "2026-03-17",
      description: "Lunch",
      merchantRaw: "Corner Cafe",
      organizationId,
      reviewStatus: "unreviewed",
    });
    const wrongCategory = createTransactionRecord({
      accountId: primaryAccount.id,
      amount: 77,
      categoryId: travelCategory.id,
      createdAt: "2026-03-16T09:00:00.000Z",
      createdBy: randomUUID(),
      date: "2026-03-16",
      description: "Hotel breakfast",
      merchantRaw: "Airport Hotel",
      organizationId,
      reviewStatus: "unreviewed",
    });
    const wrongDate = createTransactionRecord({
      accountId: primaryAccount.id,
      amount: 33,
      categoryId: mealsCategory.id,
      createdAt: "2026-02-28T09:00:00.000Z",
      createdBy: randomUUID(),
      date: "2026-02-28",
      description: "Coffee before period",
      merchantRaw: "Roaster",
      organizationId,
      reviewStatus: "unreviewed",
    });
    const wrongAmount = createTransactionRecord({
      accountId: primaryAccount.id,
      amount: 12,
      categoryId: mealsCategory.id,
      createdAt: "2026-03-15T09:00:00.000Z",
      createdBy: randomUUID(),
      date: "2026-03-15",
      description: "Client coffee",
      merchantRaw: "Roaster",
      organizationId,
      reviewStatus: "unreviewed",
    });

    for (const transaction of [
      matchingOne,
      matchingTwo,
      wrongStatus,
      wrongAccount,
      wrongCategory,
      wrongDate,
      wrongAmount,
    ]) {
      state.transactions.set(transaction.id, transaction);
    }

    const token = createAccessToken(organizationId, "viewer");

    const response = await request(app.server)
      .get("/transactions")
      .query({
        accountId: primaryAccount.id,
        amountMax: 50,
        amountMin: 20,
        categoryId: mealsCategory.id,
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31",
        limit: 1,
        page: 1,
        q: "client",
        status: "unreviewed",
      })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.meta).toEqual({
      hasMore: true,
      limit: 1,
      page: 1,
      total: 2,
    });
    expect(response.body.data.data).toHaveLength(1);
    expect(response.body.data.data[0].id).toBe(matchingOne.id);
  });

  it("returns and updates a transaction, then publishes transaction.updated", async () => {
    const account = createAccountRecord({
      name: "Operating Checking",
      organizationId,
      type: "cash",
    });
    const initialCategory = createCategoryRecord({
      name: "Meals",
      organizationId,
    });
    const updatedCategory = createCategoryRecord({
      name: "Travel",
      organizationId,
    });
    const transaction = createTransactionRecord({
      accountId: account.id,
      amount: 75,
      categoryId: initialCategory.id,
      createdBy: randomUUID(),
      date: "2026-03-10",
      description: "Original description",
      merchantRaw: "Original Merchant",
      organizationId,
    });
    const userId = randomUUID();
    const token = signToken(
      {
        email: "admin@example.com",
        organizationId,
        role: "admin",
        userId,
      },
      JWT_SECRET,
      "15m"
    );

    state.accounts.set(account.id, account);
    state.categories.set(initialCategory.id, initialCategory);
    state.categories.set(updatedCategory.id, updatedCategory);
    state.transactions.set(transaction.id, transaction);
    state.transactionCounts.set(account.id, 1);
    state.transactionSums.set(account.id, transaction.amount);
    state.categoryAssignmentCounts.set(initialCategory.id, 1);

    const getResponse = await request(app.server)
      .get(`/transactions/${transaction.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.data.id).toBe(transaction.id);

    const updateResponse = await request(app.server)
      .patch(`/transactions/${transaction.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        amount: 82.25,
        categoryId: updatedCategory.id,
        date: "2026-03-11",
        description: "Updated description",
        merchantRaw: "Updated Merchant",
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.data.amount).toBe(82.25);
    expect(updateResponse.body.data.categoryId).toBe(updatedCategory.id);
    expect(updateResponse.body.data.date).toBe("2026-03-11");
    expect(state.transactionSums.get(account.id)).toBe(82.25);
    expect(state.categoryAssignmentCounts.get(initialCategory.id)).toBe(0);
    expect(state.categoryAssignmentCounts.get(updatedCategory.id)).toBe(1);
    expect(state.publishedEvents.at(-1)).toMatchObject({
      eventType: "transaction.updated",
      organizationId,
      payload: {
        transactionId: transaction.id,
        changes: {
          amount: 82.25,
          categoryId: updatedCategory.id,
          date: "2026-03-11",
          description: "Updated description",
          merchantRaw: "Updated Merchant",
        },
      },
      userId,
      version: "1.0",
    });
  });

  it("soft-deletes transactions and hides them from reads", async () => {
    const account = createAccountRecord({
      name: "Operating Checking",
      organizationId,
      type: "cash",
    });
    const transaction = createTransactionRecord({
      accountId: account.id,
      amount: 54,
      createdBy: randomUUID(),
      date: "2026-03-09",
      description: "Temporary transaction",
      organizationId,
    });
    const token = createAccessToken(organizationId, "owner");

    state.accounts.set(account.id, account);
    state.transactions.set(transaction.id, transaction);
    state.transactionCounts.set(account.id, 1);
    state.transactionSums.set(account.id, 54);

    const deleteResponse = await request(app.server)
      .delete(`/transactions/${transaction.id}`)
      .set("Authorization", `Bearer ${token}`);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.data.deleted).toBe(true);
    expect(state.transactions.get(transaction.id)?.isActive).toBe(false);
    expect(state.transactionCounts.get(account.id)).toBe(0);
    expect(state.transactionSums.get(account.id)).toBe(0);

    const getResponse = await request(app.server)
      .get(`/transactions/${transaction.id}`)
      .set("Authorization", `Bearer ${token}`);
    const listResponse = await request(app.server)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);

    expect(getResponse.status).toBe(404);
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data.data).toEqual([]);
  });

  it("blocks viewer mutations while still allowing transaction reads", async () => {
    const account = createAccountRecord({
      name: "Operating Checking",
      organizationId,
      type: "cash",
    });
    const transaction = createTransactionRecord({
      accountId: account.id,
      amount: 22,
      createdBy: randomUUID(),
      date: "2026-03-12",
      description: "Viewer-visible transaction",
      organizationId,
    });
    const token = createAccessToken(organizationId, "viewer");

    state.accounts.set(account.id, account);
    state.transactions.set(transaction.id, transaction);

    const listResponse = await request(app.server)
      .get("/transactions")
      .set("Authorization", `Bearer ${token}`);
    const getResponse = await request(app.server)
      .get(`/transactions/${transaction.id}`)
      .set("Authorization", `Bearer ${token}`);
    const createResponse = await request(app.server)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        accountId: account.id,
        amount: 11,
        date: "2026-03-13",
      });

    expect(listResponse.status).toBe(200);
    expect(getResponse.status).toBe(200);
    expect(createResponse.status).toBe(403);
  });

  it("rejects foreign or inactive account and category filters on reads and writes", async () => {
    const activeAccount = createAccountRecord({
      name: "Operating Checking",
      organizationId,
      type: "cash",
    });
    const foreignAccount = createAccountRecord({
      name: "Foreign Checking",
      organizationId: randomUUID(),
      type: "cash",
    });
    const inactiveCategory = createCategoryRecord({
      isActive: false,
      name: "Deprecated",
      organizationId,
    });
    const foreignCategory = createCategoryRecord({
      name: "Foreign Category",
      organizationId: randomUUID(),
    });
    const token = createAccessToken(organizationId, "accountant");

    state.accounts.set(activeAccount.id, activeAccount);
    state.accounts.set(foreignAccount.id, foreignAccount);
    state.categories.set(inactiveCategory.id, inactiveCategory);
    state.categories.set(foreignCategory.id, foreignCategory);

    const createResponse = await request(app.server)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        accountId: foreignAccount.id,
        amount: 20,
        categoryId: inactiveCategory.id,
        date: "2026-03-14",
      });
    const listByForeignCategory = await request(app.server)
      .get("/transactions")
      .query({
        categoryId: foreignCategory.id,
      })
      .set("Authorization", `Bearer ${token}`);
    const listByForeignAccount = await request(app.server)
      .get("/transactions")
      .query({
        accountId: foreignAccount.id,
      })
      .set("Authorization", `Bearer ${token}`);

    expect(createResponse.status).toBe(404);
    expect(createResponse.body.error.code).toBe("ACCOUNT_NOT_FOUND");
    expect(listByForeignCategory.status).toBe(404);
    expect(listByForeignCategory.body.error.code).toBe("CATEGORY_NOT_FOUND");
    expect(listByForeignAccount.status).toBe(404);
    expect(listByForeignAccount.body.error.code).toBe("ACCOUNT_NOT_FOUND");
  });
});
