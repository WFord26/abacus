import { createHash } from "node:crypto";

import { createEvent } from "@wford26/event-contracts";

import { InvoicingServiceError } from "../lib/errors";
import { renderInvoicePdf } from "../lib/pdf";

import type { InvoicingEventPublisher } from "../lib/events";
import type { InvoicingPdfStorage } from "../lib/storage";
import type { InvoicingRepository } from "../repositories/invoicing.repo";
import type {
  Customer,
  CustomerListItem,
  Invoice,
  InvoiceDetail,
  InvoicePdfResponse,
  InvoiceStatus,
} from "@wford26/shared-types";

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function computeTotals(input: {
  lineItems: Array<{ quantity: number; unitPrice: number }>;
  taxRate: number;
}) {
  const subtotal = roundCurrency(
    input.lineItems.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0)
  );
  const tax = roundCurrency((subtotal * input.taxRate) / 100);
  const total = roundCurrency(subtotal + tax);

  return {
    subtotal,
    tax,
    total,
  };
}

function assertInvoiceExists(invoice: InvoiceDetail | null): InvoiceDetail {
  if (!invoice) {
    throw new InvoicingServiceError("INVOICE_NOT_FOUND", "Invoice not found", 404);
  }

  return invoice;
}

function assertCustomerExists(customer: Customer | null): Customer {
  if (!customer) {
    throw new InvoicingServiceError("CUSTOMER_NOT_FOUND", "Customer not found", 404);
  }

  return customer;
}

function buildPdfCacheKey(invoice: InvoiceDetail) {
  const hash = createHash("sha1").update(invoice.updatedAt).digest("hex").slice(0, 12);
  return `invoices/${invoice.organizationId}/${invoice.id}/invoice-${invoice.id}-${hash}.pdf`;
}

function buildPdfFilename(invoice: InvoiceDetail) {
  return `${invoice.invoiceNumber}.pdf`;
}

export type InvoicingService = {
  createCustomer(input: {
    address?: Record<string, string | null> | null;
    email?: string | null;
    name: string;
    organizationId: string;
    phone?: string | null;
  }): Promise<Customer>;
  createInvoice(input: {
    customerId: string;
    dueDate?: string | null;
    issueDate?: string | null;
    lineItems: Array<{ description: string; quantity: number; unitPrice: number }>;
    notes?: string | null;
    organizationId: string;
    taxRate: number;
    userId: string;
  }): Promise<InvoiceDetail>;
  deleteCustomer(customerId: string, organizationId: string): Promise<{ deleted: true }>;
  deleteInvoice(invoiceId: string, organizationId: string): Promise<{ deleted: true }>;
  getInvoice(invoiceId: string, organizationId: string): Promise<InvoiceDetail>;
  getInvoicePdf(invoiceId: string, organizationId: string): Promise<InvoicePdfResponse>;
  listCustomers(organizationId: string): Promise<CustomerListItem[]>;
  listInvoices(
    organizationId: string,
    filters: { customerId?: string; status?: InvoiceStatus }
  ): Promise<Invoice[]>;
  markInvoicePaid(input: {
    invoiceId: string;
    organizationId: string;
    userId: string;
  }): Promise<InvoiceDetail>;
  sendInvoice(invoiceId: string, organizationId: string): Promise<InvoiceDetail>;
  updateCustomer(
    customerId: string,
    organizationId: string,
    input: {
      address?: Record<string, string | null> | null;
      email?: string | null;
      name?: string;
      phone?: string | null;
    }
  ): Promise<Customer>;
  updateInvoice(
    invoiceId: string,
    organizationId: string,
    input: {
      customerId?: string;
      dueDate?: string | null;
      issueDate?: string | null;
      lineItems?: Array<{ description: string; quantity: number; unitPrice: number }>;
      notes?: string | null;
      status?: InvoiceStatus;
      taxRate?: number;
    }
  ): Promise<InvoiceDetail>;
};

export function createInvoicingService(
  repository: InvoicingRepository,
  storage: InvoicingPdfStorage,
  eventPublisher: InvoicingEventPublisher
): InvoicingService {
  return {
    async createCustomer(input) {
      return repository.createCustomer(input);
    },

    async createInvoice(input) {
      assertCustomerExists(
        await repository.findCustomerById(input.customerId, input.organizationId)
      );
      const totals = computeTotals({
        lineItems: input.lineItems,
        taxRate: input.taxRate,
      });
      const invoice = await repository.createInvoice({
        customerId: input.customerId,
        lineItems: input.lineItems.map((line) => ({
          ...line,
          amount: roundCurrency(line.quantity * line.unitPrice),
        })),
        organizationId: input.organizationId,
        subtotal: totals.subtotal,
        tax: totals.tax,
        taxRate: input.taxRate,
        total: totals.total,
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
        ...(input.issueDate !== undefined ? { issueDate: input.issueDate } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      });

      await eventPublisher.publish(
        createEvent("invoice.created", input.organizationId, input.userId, {
          customerId: invoice.customerId,
          invoiceId: invoice.id,
          total: invoice.total,
        })
      );

      return invoice;
    },

    async deleteCustomer(customerId, organizationId) {
      assertCustomerExists(await repository.findCustomerById(customerId, organizationId));
      const invoiceCount = await repository.countInvoicesForCustomer(customerId, organizationId);

      if (invoiceCount > 0) {
        throw new InvoicingServiceError(
          "CUSTOMER_HAS_INVOICES",
          "Customers with invoices cannot be deleted",
          409
        );
      }

      await repository.deleteCustomer(customerId, organizationId);
      return {
        deleted: true as const,
      };
    },

    async deleteInvoice(invoiceId, organizationId) {
      const invoice = assertInvoiceExists(
        await repository.findInvoiceById(invoiceId, organizationId)
      );

      if (invoice.status !== "draft") {
        throw new InvoicingServiceError(
          "INVOICE_DELETE_CONFLICT",
          "Only draft invoices can be deleted",
          409
        );
      }

      await repository.deleteInvoice(invoiceId, organizationId);
      return {
        deleted: true as const,
      };
    },

    async getInvoice(invoiceId, organizationId) {
      return assertInvoiceExists(await repository.findInvoiceById(invoiceId, organizationId));
    },

    async getInvoicePdf(invoiceId, organizationId) {
      const invoice = assertInvoiceExists(
        await repository.findInvoiceById(invoiceId, organizationId)
      );
      const key = buildPdfCacheKey(invoice);

      if (!(await storage.hasObject(key))) {
        const pdf = await renderInvoicePdf(invoice);
        await storage.putObject({
          body: pdf,
          contentType: "application/pdf",
          key,
        });
      }

      const download = await storage.createDownloadUrl({
        filename: buildPdfFilename(invoice),
        key,
      });

      return {
        downloadUrl: download.url,
        downloadUrlExpiresAt: download.expiresAt,
      };
    },

    async listCustomers(organizationId) {
      return repository.listCustomersForOrganization(organizationId);
    },

    async listInvoices(organizationId, filters) {
      return repository.listInvoicesForOrganization(organizationId, filters);
    },

    async markInvoicePaid(input) {
      const invoice = assertInvoiceExists(
        await repository.findInvoiceById(input.invoiceId, input.organizationId)
      );

      if (invoice.status !== "sent") {
        throw new InvoicingServiceError(
          "INVOICE_PAYMENT_CONFLICT",
          "Only sent invoices can be marked paid",
          409
        );
      }

      const updated = await repository.updateInvoice(input.invoiceId, input.organizationId, {
        status: "paid",
      });

      await eventPublisher.publish(
        createEvent("invoice.paid", input.organizationId, input.userId, {
          amount: updated.total,
          customerId: updated.customerId,
          invoiceId: updated.id,
          paidAt: new Date().toISOString(),
        })
      );

      return updated;
    },

    async sendInvoice(invoiceId, organizationId) {
      const invoice = assertInvoiceExists(
        await repository.findInvoiceById(invoiceId, organizationId)
      );

      if (invoice.status !== "draft") {
        throw new InvoicingServiceError(
          "INVOICE_SEND_CONFLICT",
          "Only draft invoices can be sent",
          409
        );
      }

      return repository.updateInvoice(invoiceId, organizationId, {
        status: "sent",
      });
    },

    async updateCustomer(customerId, organizationId, input) {
      assertCustomerExists(await repository.findCustomerById(customerId, organizationId));
      return repository.updateCustomer(customerId, organizationId, input);
    },

    async updateInvoice(invoiceId, organizationId, input) {
      const existing = assertInvoiceExists(
        await repository.findInvoiceById(invoiceId, organizationId)
      );

      if (existing.status === "void") {
        throw new InvoicingServiceError(
          "INVOICE_EDIT_CONFLICT",
          "Voided invoices cannot be edited",
          409
        );
      }

      if (input.status === "void") {
        return repository.updateInvoice(invoiceId, organizationId, {
          status: "void",
        });
      }

      if (existing.status !== "draft") {
        throw new InvoicingServiceError(
          "INVOICE_EDIT_CONFLICT",
          "Only draft invoices can be edited",
          409
        );
      }

      if (input.customerId) {
        assertCustomerExists(await repository.findCustomerById(input.customerId, organizationId));
      }

      const nextLineItems = input.lineItems ?? existing.lineItems;
      const nextTaxRate = input.taxRate ?? existing.taxRate;
      const totals = computeTotals({
        lineItems: nextLineItems,
        taxRate: nextTaxRate,
      });

      return repository.updateInvoice(invoiceId, organizationId, {
        ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
        ...(input.issueDate !== undefined ? { issueDate: input.issueDate } : {}),
        ...(input.lineItems !== undefined
          ? {
              lineItems: input.lineItems.map((line) => ({
                ...line,
                amount: roundCurrency(line.quantity * line.unitPrice),
              })),
            }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        subtotal: totals.subtotal,
        tax: totals.tax,
        taxRate: nextTaxRate,
        total: totals.total,
      });
    },
  };
}
