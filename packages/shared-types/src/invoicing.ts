export type InvoiceStatus = "draft" | "sent" | "paid" | "void";

export type PaymentRecordStatus = "pending" | "paid" | "failed";

export type Customer = {
  id: string;
  organizationId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: Record<string, string | null> | null;
  createdAt: string;
  updatedAt: string;
};

export type InvoiceLine = {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

export type Invoice = {
  id: string;
  organizationId: string;
  customerId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  issueDate?: string | null;
  dueDate?: string | null;
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems?: InvoiceLine[];
};

export type CustomerListItem = Customer & {
  invoiceCount: number;
  outstandingBalance: number;
};

export type InvoiceDetail = Invoice & {
  customer: Customer | null;
  lineItems: InvoiceLine[];
};

export type InvoicePdfResponse = {
  downloadUrl: string;
  downloadUrlExpiresAt: string;
};

export type PaymentRecord = {
  id: string;
  organizationId: string;
  invoiceId: string;
  amount: number;
  status: PaymentRecordStatus;
  paidAt?: string | null;
  createdAt: string;
};
