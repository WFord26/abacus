import type { PrismaClient } from "@prisma/client";
import type { Account, AccountType } from "@wford26/shared-types";

type AccountRecord = Account;

export type LedgerAccountRepository = {
  countAccountsForOrganization(organizationId: string): Promise<number>;
  countTransactionsForAccount(accountId: string, organizationId: string): Promise<number>;
  createAccount(input: {
    code?: string | null;
    name: string;
    organizationId: string;
    type: AccountType;
  }): Promise<AccountRecord>;
  createDefaultAccounts(organizationId: string): Promise<AccountRecord[]>;
  findAccountById(accountId: string, organizationId: string): Promise<AccountRecord | null>;
  listActiveAccountsForOrganization(organizationId: string): Promise<AccountRecord[]>;
  softDeleteAccount(accountId: string, organizationId: string): Promise<void>;
  sumTransactionsForAccount(accountId: string, organizationId: string): Promise<number>;
  updateAccount(
    accountId: string,
    organizationId: string,
    input: {
      code?: string | null;
      name?: string;
    }
  ): Promise<AccountRecord>;
};

function toAccountRecord(account: {
  code: string | null;
  createdAt: Date;
  id: string;
  isActive: boolean;
  name: string;
  organizationId: string;
  type: string;
}): AccountRecord {
  return {
    code: account.code,
    createdAt: account.createdAt.toISOString(),
    id: account.id,
    isActive: account.isActive,
    name: account.name,
    organizationId: account.organizationId,
    type: account.type as AccountType,
  };
}

const defaultAccounts: ReadonlyArray<{ name: string; type: AccountType }> = [
  { name: "Checking Account", type: "cash" },
  { name: "Credit Card", type: "credit" },
  { name: "General Expenses", type: "expense" },
  { name: "Revenue", type: "income" },
];

export function createPrismaLedgerAccountRepository(db: PrismaClient): LedgerAccountRepository {
  return {
    async countAccountsForOrganization(organizationId) {
      return db.account.count({
        where: {
          organizationId,
        },
      });
    },

    async countTransactionsForAccount(accountId, organizationId) {
      return db.transaction.count({
        where: {
          accountId,
          organizationId,
        },
      });
    },

    async createAccount(input) {
      const account = await db.account.create({
        data: {
          ...(input.code !== undefined ? { code: input.code } : {}),
          name: input.name,
          organizationId: input.organizationId,
          type: input.type,
        },
      });

      return toAccountRecord(account);
    },

    async createDefaultAccounts(organizationId) {
      return db.$transaction(async (transaction) => {
        const existingCount = await transaction.account.count({
          where: {
            organizationId,
          },
        });

        if (existingCount > 0) {
          const accounts = await transaction.account.findMany({
            orderBy: {
              createdAt: "asc",
            },
            where: {
              isActive: true,
              organizationId,
            },
          });

          return accounts.map(toAccountRecord);
        }

        const createdAccounts = [];

        for (const account of defaultAccounts) {
          const created = await transaction.account.create({
            data: {
              name: account.name,
              organizationId,
              type: account.type,
            },
          });

          createdAccounts.push(created);
        }

        return createdAccounts.map(toAccountRecord);
      });
    },

    async findAccountById(accountId, organizationId) {
      const account = await db.account.findFirst({
        where: {
          id: accountId,
          isActive: true,
          organizationId,
        },
      });

      return account ? toAccountRecord(account) : null;
    },

    async listActiveAccountsForOrganization(organizationId) {
      const accounts = await db.account.findMany({
        orderBy: {
          createdAt: "asc",
        },
        where: {
          isActive: true,
          organizationId,
        },
      });

      return accounts.map(toAccountRecord);
    },

    async softDeleteAccount(accountId, organizationId) {
      await db.account.updateMany({
        data: {
          isActive: false,
        },
        where: {
          id: accountId,
          isActive: true,
          organizationId,
        },
      });
    },

    async sumTransactionsForAccount(accountId, organizationId) {
      const result = await db.transaction.aggregate({
        _sum: {
          amount: true,
        },
        where: {
          accountId,
          organizationId,
        },
      });

      return Number(result._sum.amount ?? 0);
    },

    async updateAccount(accountId, organizationId, input) {
      await db.account.updateMany({
        data: {
          ...(input.code !== undefined ? { code: input.code } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
        },
        where: {
          id: accountId,
          isActive: true,
          organizationId,
        },
      });

      const account = await db.account.findFirst({
        where: {
          id: accountId,
          isActive: true,
          organizationId,
        },
      });

      if (!account) {
        throw new Error("Account not found after update");
      }

      return toAccountRecord(account);
    },
  };
}
