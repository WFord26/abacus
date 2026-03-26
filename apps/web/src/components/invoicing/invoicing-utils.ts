"use client";

import type { InvoiceStatus } from "@wford26/shared-types";

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value);
}

export function formatDisplayDate(value?: string | null) {
  if (!value) {
    return "Not set";
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(parsed);
}

export function formatStatusLabel(status: InvoiceStatus) {
  return status[0]?.toUpperCase() + status.slice(1);
}

export function getInvoiceStatusVariant(status: InvoiceStatus) {
  switch (status) {
    case "draft":
      return "secondary";
    case "sent":
      return "default";
    case "paid":
      return "success";
    case "void":
      return "destructive";
    default:
      return "secondary";
  }
}

export function buildInvoiceDateInputValue(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function addUtcDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);

  return buildInvoiceDateInputValue(date);
}
