import { randomUUID } from "node:crypto";

import { signToken } from "@wford26/auth-sdk";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildLedgerServiceApp } from "../../src/app";

import type { LedgerAccountRepository } from "../../src/repositories/accounts.repo";
import type { Account, AccountType, Role } from "@wford26/shared-types";

const JWT_SECRET = "ledger-test-secret";

type RepoState = {
  accounts: Map<string, Account>;
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
      transactionCounts: new Map(),
      transactionSums: new Map(),
    };

    app = buildLedgerServiceApp({
      jwtSecret: JWT_SECRET,
      repository: createRepository(state),
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
