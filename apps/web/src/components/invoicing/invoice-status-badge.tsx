"use client";

import { Badge } from "@wford26/ui";

import { formatStatusLabel, getInvoiceStatusVariant } from "./invoicing-utils";

import type { InvoiceStatus } from "@wford26/shared-types";

export function InvoiceStatusBadge({ status }: Readonly<{ status: InvoiceStatus }>) {
  return <Badge variant={getInvoiceStatusVariant(status)}>{formatStatusLabel(status)}</Badge>;
}
