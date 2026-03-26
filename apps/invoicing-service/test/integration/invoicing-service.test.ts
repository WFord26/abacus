import { randomUUID } from "node:crypto";

import { signToken } from "@wford26/auth-sdk";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { buildInvoicingServiceApp } from "../../src/app";

import type { InvoicingEventPublisher } from "../../src/lib/events";
import type { InvoicingPdfStorage } from "../../src/lib/storage";
import type { InvoicingRepository } from "../../src/repositories/invoicing.repo";
import type {
  Customer,
  CustomerListItem,
  InvoiceDetail,
  InvoiceStatus,
} from "@wford26/shared-types";

const JWT_SECRET = "invoicing-test-secret";
const organizationId = randomUUID();
const userId = randomUUID();

type StoredInvoice = {
  createdAt: string;
  customerId: string;
  dueDate: string | null;
  id: string;
  invoiceNumber: string;
  issueDate: string | null;
  lineItems: InvoiceDetail["lineItems"];
  notes: string | null;
  organizationId: string;
  status: InvoiceStatus;
  subtotal: number;
  tax: number;
  taxRate: number;
  total: number;
  updatedAt: string;
};

type TestState = {
  createdPdfKeys: string[];
  customers: Map<string, Customer>;
  events: Array<{ eventType: string; payload: Record<string, unknown> }>;
  invoices: Map<string, StoredInvoice>;
  pdfObjects: Map<string, Buffer>;
};

function createCustomerRecord(input: {
  email?: string | null;
  id?: string;
  name: string;
  organizationId: string;
}) {
  const timestamp = new Date().toISOString();

  return {
    address: null,
    createdAt: timestamp,
    email: input.email ?? null,
    id: input.id ?? randomUUID(),
    name: input.name,
    organizationId: input.organizationId,
    phone: null,
    updatedAt: timestamp,
  } satisfies Customer;
}

function toInvoiceDetail(state: TestState, invoice: StoredInvoice): InvoiceDetail {
  return {
    createdAt: invoice.createdAt,
    customer: state.customers.get(invoice.customerId) ?? null,
    customerId: invoice.customerId,
    dueDate: invoice.dueDate,
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    lineItems: invoice.lineItems,
    notes: invoice.notes,
    organizationId: invoice.organizationId,
    status: invoice.status,
    subtotal: invoice.subtotal,
    tax: invoice.tax,
    taxRate: invoice.taxRate,
    total: invoice.total,
    updatedAt: invoice.updatedAt,
  };
}

function createRepository(state: TestState): InvoicingRepository {
  return {
    async countInvoicesForCustomer(customerId, requestedOrganizationId) {
      return Array.from(state.invoices.values()).filter(
        (invoice) =>
          invoice.customerId === customerId && invoice.organizationId === requestedOrganizationId
      ).length;
    },

    async createCustomer(input) {
      const customer = createCustomerRecord({
        name: input.name,
        organizationId: input.organizationId,
        ...(input.email !== undefined ? { email: input.email } : {}),
      });
      state.customers.set(customer.id, {
        ...customer,
        address: input.address ?? null,
        phone: input.phone ?? null,
      });
      return state.customers.get(customer.id)!;
    },

    async createInvoice(input) {
      const existingNumbers = Array.from(state.invoices.values())
        .filter((invoice) => invoice.organizationId === input.organizationId)
        .map((invoice) => Number(invoice.invoiceNumber.replace("INV-", "")))
        .sort((left, right) => right - left);
      const nextNumber = (existingNumbers[0] ?? 0) + 1;
      const invoiceId = randomUUID();
      const timestamp = new Date().toISOString();
      const stored: StoredInvoice = {
        createdAt: timestamp,
        customerId: input.customerId,
        dueDate: input.dueDate ?? null,
        id: invoiceId,
        invoiceNumber: `INV-${String(nextNumber).padStart(4, "0")}`,
        issueDate: input.issueDate ?? null,
        lineItems: input.lineItems.map((line) => ({
          amount: line.amount,
          description: line.description,
          id: randomUUID(),
          invoiceId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        })),
        notes: input.notes ?? null,
        organizationId: input.organizationId,
        status: "draft",
        subtotal: input.subtotal,
        tax: input.tax,
        taxRate: input.taxRate,
        total: input.total,
        updatedAt: timestamp,
      };
      state.invoices.set(invoiceId, stored);
      return toInvoiceDetail(state, stored);
    },

    async deleteCustomer(customerId) {
      state.customers.delete(customerId);
    },

    async deleteInvoice(invoiceId) {
      state.invoices.delete(invoiceId);
    },

    async findCustomerById(customerId, requestedOrganizationId) {
      const customer = state.customers.get(customerId) ?? null;
      return customer && customer.organizationId === requestedOrganizationId ? customer : null;
    },

    async findInvoiceById(invoiceId, requestedOrganizationId) {
      const invoice = state.invoices.get(invoiceId) ?? null;
      return invoice && invoice.organizationId === requestedOrganizationId
        ? toInvoiceDetail(state, invoice)
        : null;
    },

    async listCustomersForOrganization(requestedOrganizationId) {
      return Array.from(state.customers.values())
        .filter((customer) => customer.organizationId === requestedOrganizationId)
        .map((customer) => {
          const customerInvoices = Array.from(state.invoices.values()).filter(
            (invoice) =>
              invoice.organizationId === requestedOrganizationId &&
              invoice.customerId === customer.id
          );

          return {
            ...customer,
            invoiceCount: customerInvoices.length,
            outstandingBalance: customerInvoices
              .filter((invoice) => invoice.status === "sent")
              .reduce((sum, invoice) => sum + invoice.total, 0),
          } satisfies CustomerListItem;
        });
    },

    async listInvoicesForOrganization(requestedOrganizationId, filters) {
      return Array.from(state.invoices.values())
        .filter((invoice) => invoice.organizationId === requestedOrganizationId)
        .filter((invoice) =>
          filters.customerId ? invoice.customerId === filters.customerId : true
        )
        .filter((invoice) => (filters.status ? invoice.status === filters.status : true))
        .map((invoice) => toInvoiceDetail(state, invoice));
    },

    async updateCustomer(customerId, _organizationId, input) {
      const existing = state.customers.get(customerId)!;
      const updated = {
        ...existing,
        ...input,
        updatedAt: new Date().toISOString(),
      };
      state.customers.set(customerId, updated);
      return updated;
    },

    async updateInvoice(invoiceId, _organizationId, input) {
      const existing = state.invoices.get(invoiceId)!;
      const updated: StoredInvoice = {
        ...existing,
        ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
        ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
        ...(input.issueDate !== undefined ? { issueDate: input.issueDate } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.subtotal !== undefined ? { subtotal: input.subtotal } : {}),
        ...(input.tax !== undefined ? { tax: input.tax } : {}),
        ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
        ...(input.total !== undefined ? { total: input.total } : {}),
        ...(input.lineItems !== undefined
          ? {
              lineItems: input.lineItems.map((line) => ({
                amount: line.amount,
                description: line.description,
                id: randomUUID(),
                invoiceId,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
              })),
            }
          : {}),
        updatedAt: new Date().toISOString(),
      };
      state.invoices.set(invoiceId, updated);
      return toInvoiceDetail(state, updated);
    },
  };
}

function createStorage(state: TestState): InvoicingPdfStorage {
  return {
    bucketName: "test-invoices",

    async createDownloadUrl(input) {
      return {
        expiresAt: "2026-03-25T13:00:00.000Z",
        url: `https://downloads.test/${encodeURIComponent(input.key)}?filename=${encodeURIComponent(input.filename)}`,
      };
    },

    async hasObject(key) {
      return state.pdfObjects.has(key);
    },

    async putObject(input) {
      state.createdPdfKeys.push(input.key);
      state.pdfObjects.set(input.key, input.body);
    },
  };
}

function createPublisher(state: TestState): InvoicingEventPublisher {
  return {
    async publish(event) {
      state.events.push({
        eventType: event.eventType,
        payload: event.payload as Record<string, unknown>,
      });
    },
  };
}

function createAccessToken() {
  return signToken(
    {
      email: "admin@example.com",
      organizationId,
      role: "admin",
      userId,
    },
    JWT_SECRET,
    "1h"
  );
}

describe("invoicing service routes", () => {
  let state: TestState;

  beforeEach(() => {
    state = {
      createdPdfKeys: [],
      customers: new Map(),
      events: [],
      invoices: new Map(),
      pdfObjects: new Map(),
    };
  });

  it("creates, lists, updates, and deletes customers", async () => {
    const app = buildInvoicingServiceApp({
      eventPublisher: createPublisher(state),
      jwtSecret: JWT_SECRET,
      repository: createRepository(state),
      storage: createStorage(state),
    });

    await app.ready();

    const createResponse = await request(app.server)
      .post("/customers")
      .set("authorization", `Bearer ${createAccessToken()}`)
      .send({
        email: "hello@example.com",
        name: "Acme Co",
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data.name).toBe("Acme Co");

    const customerId = createResponse.body.data.id as string;
    const listResponse = await request(app.server)
      .get("/customers")
      .set("authorization", `Bearer ${createAccessToken()}`);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data[0]).toMatchObject({
      email: "hello@example.com",
      invoiceCount: 0,
      name: "Acme Co",
      outstandingBalance: 0,
    });

    const patchResponse = await request(app.server)
      .patch(`/customers/${customerId}`)
      .set("authorization", `Bearer ${createAccessToken()}`)
      .send({
        phone: "555-555-1212",
      });

    expect(patchResponse.status).toBe(200);
    expect(patchResponse.body.data.phone).toBe("555-555-1212");

    const deleteResponse = await request(app.server)
      .delete(`/customers/${customerId}`)
      .set("authorization", `Bearer ${createAccessToken()}`);

    expect(deleteResponse.status).toBe(200);
    expect(deleteResponse.body.data.deleted).toBe(true);

    await app.close();
  });

  it("creates invoices with auto-numbering and blocks deleting non-draft invoices", async () => {
    const customer = createCustomerRecord({
      name: "Orbit Labs",
      organizationId,
    });
    state.customers.set(customer.id, customer);
    const app = buildInvoicingServiceApp({
      eventPublisher: createPublisher(state),
      jwtSecret: JWT_SECRET,
      repository: createRepository(state),
      storage: createStorage(state),
    });

    await app.ready();

    const createResponse = await request(app.server)
      .post("/invoices")
      .set("authorization", `Bearer ${createAccessToken()}`)
      .send({
        customerId: customer.id,
        dueDate: "2026-04-15",
        issueDate: "2026-03-25",
        lineItems: [
          {
            description: "Retainer",
            quantity: 2,
            unitPrice: 50,
          },
        ],
        taxRate: 10,
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.data).toMatchObject({
      invoiceNumber: "INV-0001",
      status: "draft",
      subtotal: 100,
      tax: 10,
      taxRate: 10,
      total: 110,
    });

    const invoiceId = createResponse.body.data.id as string;
    const sendResponse = await request(app.server)
      .post(`/invoices/${invoiceId}/send`)
      .set("authorization", `Bearer ${createAccessToken()}`);

    expect(sendResponse.status).toBe(200);
    expect(sendResponse.body.data.status).toBe("sent");

    const deleteResponse = await request(app.server)
      .delete(`/invoices/${invoiceId}`)
      .set("authorization", `Bearer ${createAccessToken()}`);

    expect(deleteResponse.status).toBe(409);
    expect(deleteResponse.body.error.code).toBe("INVOICE_DELETE_CONFLICT");

    await app.close();
  });

  it("marks sent invoices paid and publishes the invoice.paid event", async () => {
    const customer = createCustomerRecord({
      name: "Northwind",
      organizationId,
    });
    state.customers.set(customer.id, customer);
    const invoiceId = randomUUID();
    state.invoices.set(invoiceId, {
      createdAt: "2026-03-25T12:00:00.000Z",
      customerId: customer.id,
      dueDate: "2026-04-01",
      id: invoiceId,
      invoiceNumber: "INV-0007",
      issueDate: "2026-03-25",
      lineItems: [
        {
          amount: 2400,
          description: "Project fee",
          id: randomUUID(),
          invoiceId,
          quantity: 1,
          unitPrice: 2400,
        },
      ],
      notes: null,
      organizationId,
      status: "sent",
      subtotal: 2400,
      tax: 0,
      taxRate: 0,
      total: 2400,
      updatedAt: "2026-03-25T12:00:00.000Z",
    });
    const app = buildInvoicingServiceApp({
      eventPublisher: createPublisher(state),
      jwtSecret: JWT_SECRET,
      repository: createRepository(state),
      storage: createStorage(state),
    });

    await app.ready();

    const response = await request(app.server)
      .post(`/invoices/${invoiceId}/mark-paid`)
      .set("authorization", `Bearer ${createAccessToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("paid");
    expect(state.events).toContainEqual(
      expect.objectContaining({
        eventType: "invoice.paid",
        payload: expect.objectContaining({
          amount: 2400,
          customerId: customer.id,
          invoiceId,
        }),
      })
    );

    await app.close();
  });

  it("returns a cached PDF download URL and only renders the file once per invoice version", async () => {
    const customer = createCustomerRecord({
      name: "Bluebird",
      organizationId,
    });
    state.customers.set(customer.id, customer);
    const invoiceId = randomUUID();
    state.invoices.set(invoiceId, {
      createdAt: "2026-03-25T12:00:00.000Z",
      customerId: customer.id,
      dueDate: "2026-04-01",
      id: invoiceId,
      invoiceNumber: "INV-0012",
      issueDate: "2026-03-25",
      lineItems: [
        {
          amount: 300,
          description: "Subscription",
          id: randomUUID(),
          invoiceId,
          quantity: 3,
          unitPrice: 100,
        },
      ],
      notes: "Thanks for your business",
      organizationId,
      status: "draft",
      subtotal: 300,
      tax: 0,
      taxRate: 0,
      total: 300,
      updatedAt: "2026-03-25T12:00:00.000Z",
    });
    const app = buildInvoicingServiceApp({
      eventPublisher: createPublisher(state),
      jwtSecret: JWT_SECRET,
      repository: createRepository(state),
      storage: createStorage(state),
    });

    await app.ready();

    const firstResponse = await request(app.server)
      .get(`/invoices/${invoiceId}/pdf`)
      .set("authorization", `Bearer ${createAccessToken()}`);
    const secondResponse = await request(app.server)
      .get(`/invoices/${invoiceId}/pdf`)
      .set("authorization", `Bearer ${createAccessToken()}`);

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.data.downloadUrl).toContain("https://downloads.test/");
    expect(secondResponse.status).toBe(200);
    expect(state.createdPdfKeys).toHaveLength(1);

    await app.close();
  });
});
