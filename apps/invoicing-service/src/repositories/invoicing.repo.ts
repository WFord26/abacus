import { Prisma } from "@prisma/client";

import type { PrismaClient } from "@prisma/client";
import type {
  Customer,
  CustomerListItem,
  Invoice,
  InvoiceDetail,
  InvoiceLine,
  InvoiceStatus,
} from "@wford26/shared-types";

type CustomerRecord = Customer;
type CustomerListRecord = CustomerListItem;
type InvoiceRecord = Invoice;
type InvoiceDetailRecord = InvoiceDetail;
type InvoiceLineRecord = InvoiceLine;

type RawCustomerSummaryRow = {
  address: Prisma.JsonValue | null;
  createdAt: Date;
  email: string | null;
  id: string;
  invoiceCount: bigint | number;
  name: string;
  organizationId: string;
  outstandingBalance: Prisma.Decimal | null;
  phone: string | null;
  updatedAt: Date;
};

export type InvoicingRepository = {
  countInvoicesForCustomer(customerId: string, organizationId: string): Promise<number>;
  createCustomer(input: {
    address?: Record<string, string | null> | null;
    email?: string | null;
    name: string;
    organizationId: string;
    phone?: string | null;
  }): Promise<CustomerRecord>;
  createInvoice(input: {
    customerId: string;
    dueDate?: string | null;
    issueDate?: string | null;
    lineItems: Array<{ description: string; quantity: number; unitPrice: number; amount: number }>;
    notes?: string | null;
    organizationId: string;
    subtotal: number;
    tax: number;
    taxRate: number;
    total: number;
  }): Promise<InvoiceDetailRecord>;
  deleteCustomer(customerId: string, organizationId: string): Promise<void>;
  deleteInvoice(invoiceId: string, organizationId: string): Promise<void>;
  findCustomerById(customerId: string, organizationId: string): Promise<CustomerRecord | null>;
  findInvoiceById(invoiceId: string, organizationId: string): Promise<InvoiceDetailRecord | null>;
  listCustomersForOrganization(organizationId: string): Promise<CustomerListRecord[]>;
  listInvoicesForOrganization(
    organizationId: string,
    filters: { customerId?: string; status?: InvoiceStatus }
  ): Promise<InvoiceRecord[]>;
  updateCustomer(
    customerId: string,
    organizationId: string,
    input: {
      address?: Record<string, string | null> | null;
      email?: string | null;
      name?: string;
      phone?: string | null;
    }
  ): Promise<CustomerRecord>;
  updateInvoice(
    invoiceId: string,
    organizationId: string,
    input: {
      customerId?: string;
      dueDate?: string | null;
      issueDate?: string | null;
      lineItems?: Array<{
        description: string;
        quantity: number;
        unitPrice: number;
        amount: number;
      }>;
      notes?: string | null;
      status?: InvoiceStatus;
      subtotal?: number;
      tax?: number;
      taxRate?: number;
      total?: number;
    }
  ): Promise<InvoiceDetailRecord>;
};

function toCustomerRecord(customer: {
  address: Prisma.JsonValue | null;
  createdAt: Date;
  email: string | null;
  id: string;
  name: string;
  organizationId: string;
  phone: string | null;
  updatedAt: Date;
}): CustomerRecord {
  return {
    address:
      customer.address && typeof customer.address === "object" && !Array.isArray(customer.address)
        ? (customer.address as Record<string, string | null>)
        : null,
    createdAt: customer.createdAt.toISOString(),
    email: customer.email,
    id: customer.id,
    name: customer.name,
    organizationId: customer.organizationId,
    phone: customer.phone,
    updatedAt: customer.updatedAt.toISOString(),
  };
}

function toInvoiceLineRecord(line: {
  amount: Prisma.Decimal;
  description: string;
  id: string;
  invoiceId: string | null;
  quantity: Prisma.Decimal | null;
  unitPrice: Prisma.Decimal;
}): InvoiceLineRecord {
  return {
    amount: Number(line.amount),
    description: line.description,
    id: line.id,
    invoiceId: line.invoiceId ?? "",
    quantity: Number(line.quantity ?? 0),
    unitPrice: Number(line.unitPrice),
  };
}

function toInvoiceRecord(invoice: {
  createdAt: Date;
  customerId: string | null;
  dueDate: Date | null;
  id: string;
  invoiceLines?: Array<{
    amount: Prisma.Decimal;
    description: string;
    id: string;
    invoiceId: string | null;
    quantity: Prisma.Decimal | null;
    unitPrice: Prisma.Decimal;
  }>;
  invoiceNumber: string;
  issueDate: Date | null;
  notes: string | null;
  organizationId: string;
  status: string;
  subtotal: Prisma.Decimal | null;
  tax: Prisma.Decimal | null;
  taxRate: Prisma.Decimal | null;
  total: Prisma.Decimal | null;
  updatedAt: Date;
}): InvoiceRecord {
  return {
    createdAt: invoice.createdAt.toISOString(),
    customerId: invoice.customerId ?? "",
    dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate?.toISOString().slice(0, 10) ?? null,
    notes: invoice.notes,
    organizationId: invoice.organizationId,
    status: invoice.status as InvoiceStatus,
    subtotal: Number(invoice.subtotal ?? 0),
    tax: Number(invoice.tax ?? 0),
    taxRate: Number(invoice.taxRate ?? 0),
    total: Number(invoice.total ?? 0),
    updatedAt: invoice.updatedAt.toISOString(),
    ...(invoice.invoiceLines ? { lineItems: invoice.invoiceLines.map(toInvoiceLineRecord) } : {}),
  };
}

function toInvoiceDetailRecord(invoice: {
  createdAt: Date;
  customer: {
    address: Prisma.JsonValue | null;
    createdAt: Date;
    email: string | null;
    id: string;
    name: string;
    organizationId: string;
    phone: string | null;
    updatedAt: Date;
  } | null;
  customerId: string | null;
  dueDate: Date | null;
  id: string;
  invoiceLines: Array<{
    amount: Prisma.Decimal;
    description: string;
    id: string;
    invoiceId: string | null;
    quantity: Prisma.Decimal | null;
    unitPrice: Prisma.Decimal;
  }>;
  invoiceNumber: string;
  issueDate: Date | null;
  notes: string | null;
  organizationId: string;
  status: string;
  subtotal: Prisma.Decimal | null;
  tax: Prisma.Decimal | null;
  taxRate: Prisma.Decimal | null;
  total: Prisma.Decimal | null;
  updatedAt: Date;
}): InvoiceDetailRecord {
  return {
    ...toInvoiceRecord(invoice),
    customer: invoice.customer ? toCustomerRecord(invoice.customer) : null,
    customerId: invoice.customerId ?? "",
    lineItems: invoice.invoiceLines.map(toInvoiceLineRecord),
  };
}

function parseInvoiceSequence(invoiceNumber: string) {
  const match = /^INV-(\d+)$/.exec(invoiceNumber);
  return match ? Number(match[1]) : 0;
}

function toDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export function createPrismaInvoicingRepository(db: PrismaClient): InvoicingRepository {
  return {
    async countInvoicesForCustomer(customerId, organizationId) {
      return db.invoice.count({
        where: {
          customerId,
          organizationId,
        },
      });
    },

    async createCustomer(input) {
      const customer = await db.customer.create({
        data: {
          ...(input.address !== undefined ? { address: input.address ?? Prisma.JsonNull } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          name: input.name,
          organizationId: input.organizationId,
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
        },
      });

      return toCustomerRecord(customer);
    },

    async createInvoice(input) {
      return db.$transaction(async (tx) => {
        const latestInvoice = await tx.invoice.findFirst({
          orderBy: [{ createdAt: "desc" }],
          select: {
            invoiceNumber: true,
          },
          where: {
            organizationId: input.organizationId,
          },
        });
        const nextSequence = parseInvoiceSequence(latestInvoice?.invoiceNumber ?? "INV-0000") + 1;
        const invoice = await tx.invoice.create({
          data: {
            customerId: input.customerId,
            dueDate: toDate(input.dueDate),
            invoiceNumber: `INV-${String(nextSequence).padStart(4, "0")}`,
            issueDate: toDate(input.issueDate),
            notes: input.notes ?? null,
            organizationId: input.organizationId,
            subtotal: input.subtotal,
            tax: input.tax,
            taxRate: input.taxRate,
            total: input.total,
            invoiceLines: {
              createMany: {
                data: input.lineItems.map((line) => ({
                  amount: line.amount,
                  description: line.description,
                  quantity: line.quantity,
                  unitPrice: line.unitPrice,
                })),
              },
            },
          },
          include: {
            customer: true,
            invoiceLines: true,
          },
        });

        return toInvoiceDetailRecord(invoice);
      });
    },

    async deleteCustomer(customerId, organizationId) {
      await db.customer.deleteMany({
        where: {
          id: customerId,
          organizationId,
        },
      });
    },

    async deleteInvoice(invoiceId, organizationId) {
      await db.$transaction(async (tx) => {
        await tx.invoiceLine.deleteMany({
          where: {
            invoiceId,
          },
        });
        await tx.invoice.deleteMany({
          where: {
            id: invoiceId,
            organizationId,
          },
        });
      });
    },

    async findCustomerById(customerId, organizationId) {
      const customer = await db.customer.findFirst({
        where: {
          id: customerId,
          organizationId,
        },
      });

      return customer ? toCustomerRecord(customer) : null;
    },

    async findInvoiceById(invoiceId, organizationId) {
      const invoice = await db.invoice.findFirst({
        include: {
          customer: true,
          invoiceLines: {
            orderBy: {
              id: "asc",
            },
          },
        },
        where: {
          id: invoiceId,
          organizationId,
        },
      });

      return invoice ? toInvoiceDetailRecord(invoice) : null;
    },

    async listCustomersForOrganization(organizationId) {
      const rows = await db.$queryRaw<RawCustomerSummaryRow[]>(Prisma.sql`
        SELECT
          customer.id AS id,
          customer.organization_id AS "organizationId",
          customer.name AS name,
          customer.email AS email,
          customer.phone AS phone,
          customer.address AS address,
          customer.created_at AS "createdAt",
          customer.updated_at AS "updatedAt",
          COUNT(invoice.id) AS "invoiceCount",
          COALESCE(SUM(CASE WHEN invoice.status = 'sent' THEN invoice.total ELSE 0 END), 0) AS "outstandingBalance"
        FROM invoicing.customers AS customer
        LEFT JOIN invoicing.invoices AS invoice
          ON invoice.customer_id = customer.id
         AND invoice.organization_id = customer.organization_id
        WHERE customer.organization_id = ${organizationId}::uuid
        GROUP BY customer.id
        ORDER BY customer.created_at ASC
      `);

      return rows.map((row) => ({
        ...toCustomerRecord(row),
        invoiceCount: Number(row.invoiceCount),
        outstandingBalance: Number(row.outstandingBalance ?? 0),
      }));
    },

    async listInvoicesForOrganization(organizationId, filters) {
      const invoices = await db.invoice.findMany({
        include: {
          invoiceLines: {
            orderBy: {
              id: "asc",
            },
          },
        },
        orderBy: [{ createdAt: "desc" }],
        where: {
          organizationId,
          ...(filters.customerId ? { customerId: filters.customerId } : {}),
          ...(filters.status ? { status: filters.status } : {}),
        },
      });

      return invoices.map(toInvoiceRecord);
    },

    async updateCustomer(customerId, organizationId, input) {
      await db.customer.updateMany({
        data: {
          ...(input.address !== undefined ? { address: input.address ?? Prisma.JsonNull } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
        },
        where: {
          id: customerId,
          organizationId,
        },
      });

      const customer = await db.customer.findFirst({
        where: {
          id: customerId,
          organizationId,
        },
      });

      if (!customer) {
        throw new Error("Customer not found after update");
      }

      return toCustomerRecord(customer);
    },

    async updateInvoice(invoiceId, organizationId, input) {
      return db.$transaction(async (tx) => {
        if (input.lineItems) {
          await tx.invoiceLine.deleteMany({
            where: {
              invoiceId,
            },
          });
        }

        await tx.invoice.updateMany({
          data: {
            ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
            ...(input.dueDate !== undefined ? { dueDate: toDate(input.dueDate) } : {}),
            ...(input.issueDate !== undefined ? { issueDate: toDate(input.issueDate) } : {}),
            ...(input.notes !== undefined ? { notes: input.notes } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.subtotal !== undefined ? { subtotal: input.subtotal } : {}),
            ...(input.tax !== undefined ? { tax: input.tax } : {}),
            ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
            ...(input.total !== undefined ? { total: input.total } : {}),
          },
          where: {
            id: invoiceId,
            organizationId,
          },
        });

        if (input.lineItems) {
          await tx.invoiceLine.createMany({
            data: input.lineItems.map((line) => ({
              amount: line.amount,
              description: line.description,
              invoiceId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
            })),
          });
        }

        const invoice = await tx.invoice.findFirst({
          include: {
            customer: true,
            invoiceLines: {
              orderBy: {
                id: "asc",
              },
            },
          },
          where: {
            id: invoiceId,
            organizationId,
          },
        });

        if (!invoice) {
          throw new Error("Invoice not found after update");
        }

        return toInvoiceDetailRecord(invoice);
      });
    },
  };
}
