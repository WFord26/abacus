"use client";

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wford26/ui";
import { useEffect, useState } from "react";
import { z } from "zod";

import type { Account, AccountType } from "@wford26/shared-types";

const accountTypes = ["cash", "credit", "expense", "income", "liability", "equity"] as const;

const createAccountSchema = z.object({
  code: z.string().trim().max(20, "Code must be 20 characters or fewer").nullable(),
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  type: z.enum(accountTypes),
});

const updateAccountSchema = createAccountSchema.omit({
  type: true,
});

type AccountFormValues = {
  code: string | null;
  name: string;
  type: AccountType;
};

function toInitialValues(
  account?: Pick<Account, "code" | "name" | "type"> | null
): AccountFormValues {
  return {
    code: account?.code ?? null,
    name: account?.name ?? "",
    type: account?.type ?? "cash",
  };
}

export function AccountForm({
  account,
  isSubmitting,
  mode,
  onCancel,
  onSubmit,
}: Readonly<{
  account?: Pick<Account, "code" | "name" | "type"> | null;
  isSubmitting: boolean;
  mode: "create" | "edit";
  onCancel: () => void;
  onSubmit: (values: AccountFormValues) => Promise<void> | void;
}>) {
  const [values, setValues] = useState<AccountFormValues>(() => toInitialValues(account));
  const [errors, setErrors] = useState<Partial<Record<keyof AccountFormValues, string>>>({});

  useEffect(() => {
    setValues(toInitialValues(account));
    setErrors({});
  }, [account, mode]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextValues = {
      ...values,
      code: values.code?.trim() ? values.code.trim() : null,
      name: values.name.trim(),
    };

    if (mode === "create") {
      const result = createAccountSchema.safeParse(nextValues);

      if (!result.success) {
        const fieldErrors = result.error.flatten().fieldErrors;
        setErrors({
          ...(fieldErrors.code?.[0] ? { code: fieldErrors.code[0] } : {}),
          ...(fieldErrors.name?.[0] ? { name: fieldErrors.name[0] } : {}),
          ...(fieldErrors.type?.[0] ? { type: fieldErrors.type[0] } : {}),
        });
        return;
      }
    } else {
      const result = updateAccountSchema.safeParse(nextValues);

      if (!result.success) {
        const fieldErrors = result.error.flatten().fieldErrors;
        setErrors({
          ...(fieldErrors.code?.[0] ? { code: fieldErrors.code[0] } : {}),
          ...(fieldErrors.name?.[0] ? { name: fieldErrors.name[0] } : {}),
        });
        return;
      }
    }

    setErrors({});
    await onSubmit(nextValues);
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor={`${mode}-account-name`}>Name</Label>
        <Input
          id={`${mode}-account-name`}
          placeholder="Operations Checking"
          value={values.name}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              name: event.target.value,
            }))
          }
        />
        {errors.name ? <p className="text-sm text-red-600">{errors.name}</p> : null}
      </div>

      {mode === "create" ? (
        <div className="space-y-2">
          <Label htmlFor={`${mode}-account-type`}>Type</Label>
          <Select
            value={values.type}
            onValueChange={(value) =>
              setValues((current) => ({
                ...current,
                type: value as AccountType,
              }))
            }
          >
            <SelectTrigger id={`${mode}-account-type`}>
              <SelectValue placeholder="Choose an account type" />
            </SelectTrigger>
            <SelectContent>
              {accountTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type[0]?.toUpperCase()}
                  {type.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.type ? <p className="text-sm text-red-600">{errors.type}</p> : null}
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Type</Label>
          <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-700">
            {values.type[0]?.toUpperCase()}
            {values.type.slice(1)}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={`${mode}-account-code`}>Code</Label>
        <Input
          id={`${mode}-account-code`}
          placeholder="1000"
          value={values.code ?? ""}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              code: event.target.value,
            }))
          }
        />
        <p className="text-xs text-neutral-500">
          Optional short code for chart-of-accounts grouping.
        </p>
        {errors.code ? <p className="text-sm text-red-600">{errors.code}</p> : null}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting ? "Saving..." : mode === "create" ? "Create account" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
