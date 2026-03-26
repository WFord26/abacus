"use client";

import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@wford26/ui";

import { AccountBalanceBadge } from "./account-balance-badge";

import type { AccountType } from "@wford26/shared-types";

export type AccountTableRow = {
  balance: number;
  code: string | null;
  id: string;
  isOptimistic?: boolean;
  name: string;
  type: AccountType;
};

function formatType(type: AccountType) {
  return type[0]?.toUpperCase() + type.slice(1);
}

export function AccountsTable({
  accounts,
  canManageAccounts,
  isLoading,
  onDelete,
  onEdit,
}: Readonly<{
  accounts: AccountTableRow[];
  canManageAccounts: boolean;
  isLoading: boolean;
  onDelete: (account: AccountTableRow) => void;
  onEdit: (account: AccountTableRow) => void;
}>) {
  if (isLoading) {
    return (
      <div className="rounded-3xl border border-neutral-200/70 bg-white/80 p-6 text-sm text-neutral-600">
        Loading accounts...
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-neutral-300 bg-white/75 p-8 text-center">
        <p className="text-lg font-semibold text-neutral-900">No accounts yet</p>
        <p className="mt-2 text-sm text-neutral-600">
          Add your first ledger account to start categorizing transactions and tracking balances.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-neutral-200/70 bg-white/85 shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Balance</TableHead>
            {canManageAccounts ? <TableHead className="text-right">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((account) => (
            <TableRow key={account.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-primary-500/10 text-center text-sm font-semibold leading-10 text-primary-700">
                    {account.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900">{account.name}</p>
                    {account.isOptimistic ? (
                      <p className="text-xs uppercase tracking-[0.18em] text-primary-600">
                        Pending sync
                      </p>
                    ) : null}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-neutral-700">{formatType(account.type)}</TableCell>
              <TableCell className="font-mono text-xs text-neutral-600">
                {account.code ?? "—"}
              </TableCell>
              <TableCell>
                <AccountBalanceBadge balance={account.balance} />
              </TableCell>
              {canManageAccounts ? (
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => onEdit(account)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => onDelete(account)}>
                      Delete
                    </Button>
                  </div>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
