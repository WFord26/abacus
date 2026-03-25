import { randomUUID } from "node:crypto";

import type { ReviewStatus } from "@wford26/shared-types";

export interface BaseEvent {
  eventId: string;
  eventType: string;
  organizationId: string;
  userId: string;
  occurredAt: string;
  version: "1.0";
}

export interface TransactionCreatedEvent extends BaseEvent {
  eventType: "transaction.created";
  payload: {
    transactionId: string;
    accountId: string;
    amount: number;
    date: string;
    description: string;
    merchantRaw: string | null;
    categoryId: string | null;
  };
}

export interface TransactionUpdatedEvent extends BaseEvent {
  eventType: "transaction.updated";
  payload: {
    transactionId: string;
    changes: Partial<{
      amount: number;
      categoryId: string | null;
      date: string;
      merchantRaw: string | null;
      reviewStatus: ReviewStatus;
      description: string | null;
    }>;
  };
}

export interface ExpenseCategorizedEvent extends BaseEvent {
  eventType: "expense.categorized";
  payload: {
    transactionId: string;
    categoryId: string;
    ruleApplied: boolean;
  };
}

export interface AccountReconciledEvent extends BaseEvent {
  eventType: "account.reconciled";
  payload: {
    reconciliationSessionId: string;
    accountId: string;
    period: string;
  };
}

export interface ReceiptUploadedEvent extends BaseEvent {
  eventType: "receipt.uploaded";
  payload: {
    documentId: string;
    s3Key: string;
    linkedTransactionId: string | null;
  };
}

export interface InvoiceCreatedEvent extends BaseEvent {
  eventType: "invoice.created";
  payload: {
    invoiceId: string;
    customerId: string;
    total: number;
  };
}

export interface InvoicePaidEvent extends BaseEvent {
  eventType: "invoice.paid";
  payload: {
    invoiceId: string;
    customerId: string;
    amount: number;
    paidAt: string;
  };
}

export type AbacusEvent =
  | TransactionCreatedEvent
  | TransactionUpdatedEvent
  | ExpenseCategorizedEvent
  | AccountReconciledEvent
  | ReceiptUploadedEvent
  | InvoiceCreatedEvent
  | InvoicePaidEvent;

export function createEvent<T extends AbacusEvent>(
  type: T["eventType"],
  organizationId: string,
  userId: string,
  payload: T["payload"]
): T {
  return {
    eventId: randomUUID(),
    eventType: type,
    organizationId,
    userId,
    occurredAt: new Date().toISOString(),
    version: "1.0",
    payload,
  } as T;
}
