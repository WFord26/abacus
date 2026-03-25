import { LedgerServiceError } from "../lib/errors";

import type { LedgerAccountRepository } from "../repositories/accounts.repo";
import type { Account, AccountType } from "@wford26/shared-types";

type AccountBalance = {
  accountId: string;
  asOf: string;
  balance: number;
  currency: "USD";
};

export type LedgerAccountsService = {
  createAccount(input: {
    code?: string | null;
    name: string;
    organizationId: string;
    type: AccountType;
  }): Promise<Account>;
  deleteAccount(accountId: string, organizationId: string): Promise<{ deleted: true }>;
  getAccountBalance(accountId: string, organizationId: string): Promise<AccountBalance>;
  listAccounts(organizationId: string): Promise<Account[]>;
  updateAccount(
    accountId: string,
    organizationId: string,
    input: {
      code?: string | null;
      name?: string;
    }
  ): Promise<Account>;
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function createLedgerAccountsService(
  repository: LedgerAccountRepository
): LedgerAccountsService {
  return {
    async createAccount(input) {
      return repository.createAccount(input);
    },

    async deleteAccount(accountId, organizationId) {
      const account = await repository.findAccountById(accountId, organizationId);

      if (!account) {
        throw new LedgerServiceError("NOT_FOUND", "Account not found", 404);
      }

      const transactionCount = await repository.countTransactionsForAccount(
        accountId,
        organizationId
      );

      if (transactionCount > 0) {
        throw new LedgerServiceError(
          "ACCOUNT_HAS_TRANSACTIONS",
          "Cannot delete an account with associated transactions",
          409
        );
      }

      await repository.softDeleteAccount(accountId, organizationId);

      return {
        deleted: true as const,
      };
    },

    async getAccountBalance(accountId, organizationId) {
      const account = await repository.findAccountById(accountId, organizationId);

      if (!account) {
        throw new LedgerServiceError("NOT_FOUND", "Account not found", 404);
      }

      const transactionSum = await repository.sumTransactionsForAccount(accountId, organizationId);
      const balance = account.type === "credit" ? Math.abs(transactionSum) : transactionSum;

      return {
        accountId: account.id,
        asOf: new Date().toISOString(),
        balance: roundCurrency(balance),
        currency: "USD",
      };
    },

    async listAccounts(organizationId) {
      let accounts = await repository.listActiveAccountsForOrganization(organizationId);

      if (accounts.length > 0) {
        return accounts;
      }

      const totalAccountCount = await repository.countAccountsForOrganization(organizationId);

      if (totalAccountCount === 0) {
        accounts = await repository.createDefaultAccounts(organizationId);
      }

      return accounts;
    },

    async updateAccount(accountId, organizationId, input) {
      const account = await repository.findAccountById(accountId, organizationId);

      if (!account) {
        throw new LedgerServiceError("NOT_FOUND", "Account not found", 404);
      }

      return repository.updateAccount(accountId, organizationId, input);
    },
  };
}
