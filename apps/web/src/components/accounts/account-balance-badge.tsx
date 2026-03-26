"use client";

import { Badge } from "@wford26/ui";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  currency: "USD",
  style: "currency",
});

export function AccountBalanceBadge({
  balance,
}: Readonly<{
  balance: number;
}>) {
  return (
    <Badge
      className="rounded-full border border-primary-200/80 bg-primary-50 px-3 py-1 text-primary-700"
      variant="secondary"
    >
      {currencyFormatter.format(balance)}
    </Badge>
  );
}
