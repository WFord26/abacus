import { createEvent } from "@wford26/event-contracts";

import type { LedgerEventPublisher } from "../lib/events";
import type { LedgerAccountRepository } from "../repositories/accounts.repo";
import type { LedgerTransactionRepository } from "../repositories/transactions.repo";
import type { AbacusEvent, InvoicePaidEvent } from "@wford26/event-contracts";

const INVOICE_PAYMENT_SOURCE_TYPE = "invoice_payment";

export type LedgerLogger = {
  error(payload: unknown, message?: string): void;
  info?(payload: unknown, message?: string): void;
  warn?(payload: unknown, message?: string): void;
};

export type LedgerEventProcessor = {
  process(event: AbacusEvent): Promise<void>;
};

function buildIncomeTransactionDescription(invoiceId: string) {
  return `Invoice payment ${invoiceId}`;
}

function buildIncomeTransactionMerchant(invoiceId: string) {
  return `Invoice ${invoiceId}`;
}

async function findIncomeAccount(
  accountRepository: LedgerAccountRepository,
  organizationId: string
) {
  let accounts = await accountRepository.listActiveAccountsForOrganization(organizationId);

  if (accounts.length === 0) {
    accounts = await accountRepository.createDefaultAccounts(organizationId);
  }

  return accounts.find((account) => account.isActive && account.type === "income") ?? null;
}

async function processInvoicePaidEvent(
  event: InvoicePaidEvent,
  transactionRepository: LedgerTransactionRepository,
  accountRepository: LedgerAccountRepository,
  eventPublisher: LedgerEventPublisher,
  logger: LedgerLogger
) {
  const existing = await transactionRepository.findTransactionBySourceReference({
    organizationId: event.organizationId,
    sourceId: event.payload.invoiceId,
    sourceType: INVOICE_PAYMENT_SOURCE_TYPE,
  });

  if (existing) {
    logger.info?.(
      {
        eventId: event.eventId,
        invoiceId: event.payload.invoiceId,
        organizationId: event.organizationId,
        transactionId: existing.id,
      },
      "ledger subscriber ignored replayed invoice.paid event"
    );
    return;
  }

  const incomeAccount = await findIncomeAccount(accountRepository, event.organizationId);

  if (!incomeAccount) {
    throw new Error("No active income account is available for invoice settlement");
  }

  const transaction = await transactionRepository.createTransaction({
    accountId: incomeAccount.id,
    amount: event.payload.amount,
    createdBy: event.userId,
    date: event.payload.paidAt.slice(0, 10),
    description: buildIncomeTransactionDescription(event.payload.invoiceId),
    merchantRaw: buildIncomeTransactionMerchant(event.payload.invoiceId),
    organizationId: event.organizationId,
    reviewStatus: "reviewed",
    sourceId: event.payload.invoiceId,
    sourceType: INVOICE_PAYMENT_SOURCE_TYPE,
  });

  await eventPublisher.publish(
    createEvent("transaction.created", event.organizationId, event.userId, {
      accountId: transaction.accountId,
      amount: transaction.amount,
      categoryId: transaction.categoryId ?? null,
      date: transaction.date,
      description: transaction.description ?? "",
      merchantRaw: transaction.merchantRaw ?? null,
      transactionId: transaction.id,
    })
  );
}

export function createLedgerEventProcessor(
  transactionRepository: LedgerTransactionRepository,
  accountRepository: LedgerAccountRepository,
  eventPublisher: LedgerEventPublisher,
  logger: LedgerLogger
): LedgerEventProcessor {
  return {
    async process(event) {
      switch (event.eventType) {
        case "invoice.paid":
          await processInvoicePaidEvent(
            event,
            transactionRepository,
            accountRepository,
            eventPublisher,
            logger
          );
          return;

        default:
          logger.info?.(
            {
              eventId: event.eventId,
              eventType: event.eventType,
              organizationId: event.organizationId,
            },
            "ledger subscriber ignored unsupported event type"
          );
      }
    },
  };
}

export { INVOICE_PAYMENT_SOURCE_TYPE };
