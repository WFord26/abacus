import { randomUUID } from "node:crypto";

import { createEvent } from "@wford26/event-contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  INVOICE_PAYMENT_SOURCE_TYPE,
  createLedgerEventProcessor,
} from "../../src/services/invoice-settlement.service";

import type { LedgerAccountRepository } from "../../src/repositories/accounts.repo";
import type { LedgerTransactionRepository } from "../../src/repositories/transactions.repo";
import type { AbacusEvent } from "@wford26/event-contracts";
import type { Account, AccountType, Transaction } from "@wford26/shared-types";

const organizationId = randomUUID();
const userId = randomUUID();

type TestState = {
  accounts: Account[];
  createdTransactions: Transaction[];
  publishedEvents: AbacusEvent[];
};

function createAccount(input: {
  id?: string;
  name: string;
  organizationId: string;
  type: AccountType;
}): Account {
  return {
    createdAt: new Date().toISOString(),
    id: input.id ?? randomUUID(),
    isActive: true,
    name: input.name,
    organizationId: input.organizationId,
    type: input.type,
  };
}

function createAccountRepository(state: TestState): LedgerAccountRepository {
  return {
    async countAccountsForOrganization() {
      return state.accounts.length;
    },
    async countTransactionsForAccount() {
      return 0;
    },
    async createAccount(input) {
      const account = createAccount({
        name: input.name,
        organizationId: input.organizationId,
        type: input.type,
      });
      state.accounts.push(account);
      return account;
    },
    async createDefaultAccounts(requestedOrganizationId) {
      const accounts = [
        createAccount({
          name: "Checking Account",
          organizationId: requestedOrganizationId,
          type: "cash",
        }),
        createAccount({
          name: "Revenue",
          organizationId: requestedOrganizationId,
          type: "income",
        }),
      ];
      state.accounts = accounts;
      return accounts;
    },
    async findAccountById(accountId, requestedOrganizationId) {
      return (
        state.accounts.find(
          (account) =>
            account.id === accountId &&
            account.organizationId === requestedOrganizationId &&
            account.isActive
        ) ?? null
      );
    },
    async listActiveAccountsForOrganization(requestedOrganizationId) {
      return state.accounts.filter(
        (account) => account.organizationId === requestedOrganizationId && account.isActive
      );
    },
    async softDeleteAccount() {
      return undefined;
    },
    async sumTransactionsForAccount() {
      return 0;
    },
    async updateAccount() {
      throw new Error("not needed");
    },
  };
}

function createTransactionRepository(state: TestState): LedgerTransactionRepository {
  return {
    async createTransaction(input) {
      const transaction: Transaction = {
        accountId: input.accountId,
        amount: input.amount,
        categoryId: input.categoryId ?? null,
        createdAt: new Date().toISOString(),
        createdBy: input.createdBy,
        date: input.date,
        description: input.description ?? null,
        id: randomUUID(),
        importBatchId: input.importBatchId ?? null,
        isSplit: false,
        merchantRaw: input.merchantRaw ?? null,
        organizationId: input.organizationId,
        reviewStatus: input.reviewStatus ?? "unreviewed",
        updatedAt: new Date().toISOString(),
      };
      state.createdTransactions.push(transaction);
      return transaction;
    },
    async findTransactionBySourceReference(input) {
      const matching = state.createdTransactions.find(
        (transaction) =>
          transaction.organizationId === input.organizationId &&
          transaction.description === `Invoice payment ${input.sourceId}` &&
          input.sourceType === INVOICE_PAYMENT_SOURCE_TYPE
      );

      return matching ?? null;
    },
    async findTransactionsByDuplicateCandidates() {
      return [];
    },
    async findTransactionById() {
      return null;
    },
    async listTransactions() {
      return {
        total: 0,
        transactions: [],
      };
    },
    async softDeleteTransaction() {
      return undefined;
    },
    async updateTransactionReviewStatus() {
      throw new Error("not needed");
    },
    async updateTransaction() {
      throw new Error("not needed");
    },
  };
}

describe("ledger invoice settlement processor", () => {
  let state: TestState;

  beforeEach(() => {
    state = {
      accounts: [],
      createdTransactions: [],
      publishedEvents: [],
    };
  });

  it("creates a reviewed income transaction and emits transaction.created", async () => {
    const accountRepository = createAccountRepository(state);
    const transactionRepository = createTransactionRepository(state);
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    };
    const eventPublisher = {
      async publish(event: AbacusEvent) {
        state.publishedEvents.push(event);
      },
    };
    const processor = createLedgerEventProcessor(
      transactionRepository,
      accountRepository,
      eventPublisher,
      logger
    );

    await processor.process(
      createEvent("invoice.paid", organizationId, userId, {
        amount: 2400,
        customerId: randomUUID(),
        invoiceId: "invoice-123",
        paidAt: "2026-03-26T15:30:00.000Z",
      })
    );

    expect(state.createdTransactions).toHaveLength(1);
    const createdTransaction = state.createdTransactions[0];
    const publishedEvent = state.publishedEvents[0];

    expect(createdTransaction).toBeDefined();
    expect(publishedEvent).toBeDefined();

    if (!createdTransaction || !publishedEvent) {
      throw new Error("Expected created transaction and published event");
    }

    expect(createdTransaction).toMatchObject({
      amount: 2400,
      date: "2026-03-26",
      description: "Invoice payment invoice-123",
      merchantRaw: "Invoice invoice-123",
      organizationId,
      reviewStatus: "reviewed",
    });
    expect(createdTransaction.accountId).toBe(
      state.accounts.find((account) => account.type === "income")?.id
    );
    expect(state.publishedEvents).toHaveLength(1);
    expect(publishedEvent).toMatchObject({
      eventType: "transaction.created",
      organizationId,
      userId,
    });
  });

  it("ignores replayed invoice.paid events", async () => {
    state.accounts = [
      createAccount({
        name: "Revenue",
        organizationId,
        type: "income",
      }),
    ];

    const accountRepository = createAccountRepository(state);
    const transactionRepository = createTransactionRepository(state);
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
    };
    const eventPublisher = {
      async publish(event: AbacusEvent) {
        state.publishedEvents.push(event);
      },
    };
    const processor = createLedgerEventProcessor(
      transactionRepository,
      accountRepository,
      eventPublisher,
      logger
    );
    const event = createEvent("invoice.paid", organizationId, userId, {
      amount: 1000,
      customerId: randomUUID(),
      invoiceId: "invoice-dup",
      paidAt: "2026-03-26T10:00:00.000Z",
    });

    await processor.process(event);
    await processor.process(event);

    expect(state.createdTransactions).toHaveLength(1);
    expect(state.publishedEvents).toHaveLength(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: "invoice-dup",
        organizationId,
      }),
      "ledger subscriber ignored replayed invoice.paid event"
    );
  });
});
