"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@wford26/ui";
import { useMemo, useState } from "react";

import { useAuth } from "../../contexts/auth-context";
import { ApiClientError, apiClient } from "../../lib/api-client";

import { AccountForm } from "./account-form";
import { AccountsTable, type AccountTableRow } from "./accounts-table";

import type { Account, AccountType, Role } from "@wford26/shared-types";

type AccountBalanceResponse = {
  accountId: string;
  asOf: string;
  balance: number;
  currency: "USD";
};

type ToastState = {
  description: string;
  title: string;
};

const mutationRoles: Role[] = ["owner", "admin", "accountant"];
type AccountsMutationContext = {
  previousAccounts: AccountTableRow[];
};

async function fetchAccountsWithBalances() {
  const accounts = await apiClient<Account[]>("/accounts");
  const balances = await Promise.all(
    accounts.map(async (account) => {
      const balance = await apiClient<AccountBalanceResponse>(`/accounts/${account.id}/balance`);
      return [account.id, balance] as const;
    })
  );
  const balanceMap = new Map(balances);

  return accounts.map((account) => ({
    balance: balanceMap.get(account.id)?.balance ?? 0,
    code: account.code ?? null,
    id: account.id,
    name: account.name,
    type: account.type,
  }));
}

function buildMutationErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return fallback;
}

export function AccountsSettingsPage() {
  const queryClient = useQueryClient();
  const { organization, organizations } = useAuth();
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<AccountTableRow | null>(null);
  const [editingAccount, setEditingAccount] = useState<AccountTableRow | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const activeRole = useMemo(
    () =>
      organizations.find((membership) => membership.organization.id === organization?.id)?.role ??
      null,
    [organization?.id, organizations]
  );
  const canManageAccounts = useMemo(
    () => (activeRole ? mutationRoles.includes(activeRole) : false),
    [activeRole]
  );
  const accountsQueryKey = useMemo(
    () => ["accounts-settings", organization?.id ?? "unknown"],
    [organization?.id]
  );
  const accountsQuery = useQuery({
    enabled: Boolean(organization?.id),
    queryFn: fetchAccountsWithBalances,
    queryKey: accountsQueryKey,
  });

  const createMutation = useMutation<
    Account,
    unknown,
    { code: string | null; name: string; type: AccountType },
    AccountsMutationContext
  >({
    mutationFn: async (values: { code: string | null; name: string; type: AccountType }) =>
      apiClient<Account>("/accounts", {
        body: values,
        method: "POST",
      }),
    onError: (error, _values, context) => {
      if (context?.previousAccounts) {
        queryClient.setQueryData(accountsQueryKey, context.previousAccounts);
      }

      setToast({
        description: buildMutationErrorMessage(error, "Unable to create account"),
        title: "Account not created",
      });
    },
    onMutate: async (values) => {
      await queryClient.cancelQueries({
        queryKey: accountsQueryKey,
      });

      const previousAccounts = queryClient.getQueryData<AccountTableRow[]>(accountsQueryKey) ?? [];
      const optimisticAccount: AccountTableRow = {
        balance: 0,
        code: values.code,
        id: `temp-${Date.now()}`,
        isOptimistic: true,
        name: values.name,
        type: values.type,
      };

      queryClient.setQueryData<AccountTableRow[]>(accountsQueryKey, [
        optimisticAccount,
        ...previousAccounts,
      ]);

      return {
        previousAccounts,
      };
    },
    onSuccess: () => {
      setDialogMode(null);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: accountsQueryKey,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: { accountId: string; code: string | null; name: string }) =>
      apiClient<Account>(`/accounts/${input.accountId}`, {
        body: {
          code: input.code,
          name: input.name,
        },
        method: "PATCH",
      }),
    onError: (error) => {
      setToast({
        description: buildMutationErrorMessage(error, "Unable to update account"),
        title: "Account not updated",
      });
    },
    onSuccess: () => {
      setDialogMode(null);
      setEditingAccount(null);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: accountsQueryKey,
      });
    },
  });

  const deleteMutation = useMutation<{ deleted: true }, unknown, string, AccountsMutationContext>({
    mutationFn: async (accountId: string) =>
      apiClient<{ deleted: true }>(`/accounts/${accountId}`, {
        method: "DELETE",
      }),
    onError: (error, _accountId, context) => {
      if (context?.previousAccounts) {
        queryClient.setQueryData(accountsQueryKey, context.previousAccounts);
      }

      setToast({
        description: buildMutationErrorMessage(
          error,
          "Unable to delete account because it still has ledger activity."
        ),
        title: "Delete failed",
      });
    },
    onMutate: async (accountId) => {
      await queryClient.cancelQueries({
        queryKey: accountsQueryKey,
      });

      const previousAccounts = queryClient.getQueryData<AccountTableRow[]>(accountsQueryKey) ?? [];

      queryClient.setQueryData<AccountTableRow[]>(
        accountsQueryKey,
        previousAccounts.filter((account) => account.id !== accountId)
      );

      return {
        previousAccounts,
      };
    },
    onSuccess: () => {
      setAccountToDelete(null);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: accountsQueryKey,
      });
    },
  });

  const accountRows = accountsQuery.data ?? [];
  const totalBalance = accountRows.reduce((sum, account) => sum + account.balance, 0);

  return (
    <ToastProvider>
      <div className="grid gap-4 xl:grid-cols-[1.65fr_0.75fr]">
        <Card className="glass-panel panel-grid rise-in overflow-hidden border-0">
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.26em] text-primary-600">
                Ledger settings
              </p>
              <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">
                Accounts
              </CardTitle>
              <CardDescription className="max-w-2xl text-base text-neutral-700 dark:text-neutral-300">
                Manage the chart of accounts for this workspace, track balances, and keep account
                codes tidy before transaction volume ramps up.
              </CardDescription>
            </div>
            {canManageAccounts ? (
              <Button
                className="w-full md:w-auto"
                onClick={() => {
                  setEditingAccount(null);
                  setDialogMode("create");
                }}
              >
                Add account
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {accountsQuery.isError ? (
              <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                Unable to load accounts right now. Please refresh and try again.
              </div>
            ) : null}
            <AccountsTable
              accounts={accountRows}
              canManageAccounts={canManageAccounts}
              isLoading={accountsQuery.isLoading}
              onDelete={(account) => setAccountToDelete(account)}
              onEdit={(account) => {
                setEditingAccount(account);
                setDialogMode("edit");
              }}
            />
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="glass-panel rise-in border-0">
            <CardHeader>
              <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                Workspace totals
              </p>
              <CardTitle className="text-xl text-neutral-900 dark:text-neutral-50">
                {new Intl.NumberFormat("en-US", {
                  currency: "USD",
                  style: "currency",
                }).format(totalBalance)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
              <p>
                {accountRows.length} active account{accountRows.length === 1 ? "" : "s"} loaded for{" "}
                {organization?.name ?? "this workspace"}.
              </p>
              <p>
                Balances come from the live ledger endpoints, so cash and credit rows already match
                the backend computation rules.
              </p>
            </CardContent>
          </Card>

          <Card className="glass-panel rise-in border-0">
            <CardHeader>
              <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                Controls
              </p>
              <CardTitle className="text-xl text-neutral-900 dark:text-neutral-50">
                Mutation access
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
              <p>
                Current role:{" "}
                <span className="font-semibold text-neutral-900 dark:text-neutral-50">
                  {activeRole ?? "viewer"}
                </span>
              </p>
              <p>
                {canManageAccounts
                  ? "You can add, update, and delete accounts from this page."
                  : "This role can review balances but cannot create, edit, or delete accounts."}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={dialogMode === "create" || dialogMode === "edit"}
        onOpenChange={(open) => {
          if (!open) {
            setDialogMode(null);
            setEditingAccount(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogMode === "create" ? "Add account" : "Edit account"}</DialogTitle>
            <DialogDescription>
              {dialogMode === "create"
                ? "Create a new account with an optional chart code and a required ledger type."
                : "Update the account name or code. Account type stays fixed after creation."}
            </DialogDescription>
          </DialogHeader>
          <AccountForm
            account={editingAccount}
            isSubmitting={createMutation.isPending || updateMutation.isPending}
            mode={dialogMode === "edit" ? "edit" : "create"}
            onCancel={() => {
              setDialogMode(null);
              setEditingAccount(null);
            }}
            onSubmit={async (values) => {
              if (dialogMode === "edit" && editingAccount) {
                await updateMutation.mutateAsync({
                  accountId: editingAccount.id,
                  code: values.code,
                  name: values.name,
                });
                return;
              }

              await createMutation.mutateAsync(values);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(accountToDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setAccountToDelete(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete account</DialogTitle>
            <DialogDescription>
              Remove {accountToDelete?.name ?? "this account"} from the active chart. If it still
              has transactions, the ledger service will block deletion and we&apos;ll restore it in
              the table.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAccountToDelete(null)}>
              Cancel
            </Button>
            <Button
              disabled={deleteMutation.isPending || !accountToDelete}
              variant="destructive"
              onClick={async () => {
                if (!accountToDelete) {
                  return;
                }

                await deleteMutation.mutateAsync(accountToDelete.id);
              }}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete account"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {toast ? (
        <Toast
          duration={4000}
          open={Boolean(toast)}
          onOpenChange={(open) => {
            if (!open) {
              setToast(null);
            }
          }}
        >
          <div>
            <ToastTitle>{toast.title}</ToastTitle>
            <ToastDescription>{toast.description}</ToastDescription>
          </div>
        </Toast>
      ) : null}
      <ToastViewport />
    </ToastProvider>
  );
}
