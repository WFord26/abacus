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

type TransactionFormValues = {
  accountId: string;
  amount: string;
  categoryId: string | null;
  date: string;
  description: string;
  merchantRaw: string;
};

type AccountOption = {
  id: string;
  label: string;
};

type CategoryOption = {
  id: string;
  label: string;
};

const transactionFormSchema = z.object({
  accountId: z.string().uuid("Choose an account"),
  amount: z
    .number({
      invalid_type_error: "Amount is required",
      required_error: "Amount is required",
    })
    .finite("Amount must be a valid number")
    .refine((value) => value !== 0, {
      message: "Amount must be non-zero",
    }),
  categoryId: z.string().uuid().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  description: z.string().trim().max(500, "Description is too long"),
  merchantRaw: z.string().trim().max(255, "Merchant is too long"),
});

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function toInitialValues(): TransactionFormValues {
  return {
    accountId: "",
    amount: "",
    categoryId: null,
    date: todayIsoDate(),
    description: "",
    merchantRaw: "",
  };
}

export function TransactionForm({
  accounts,
  categories,
  isSubmitting,
  onCancel,
  onSubmit,
}: Readonly<{
  accounts: AccountOption[];
  categories: CategoryOption[];
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: {
    accountId: string;
    amount: number;
    categoryId: string | null;
    date: string;
    description: string | null;
    merchantRaw: string | null;
  }) => Promise<void> | void;
}>) {
  const [values, setValues] = useState<TransactionFormValues>(() => toInitialValues());
  const [errors, setErrors] = useState<Partial<Record<keyof TransactionFormValues, string>>>({});

  useEffect(() => {
    setValues(toInitialValues());
    setErrors({});
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedAmount = values.amount === "" ? Number.NaN : Number(values.amount);
    const result = transactionFormSchema.safeParse({
      accountId: values.accountId,
      amount: parsedAmount,
      categoryId: values.categoryId,
      date: values.date,
      description: values.description.trim(),
      merchantRaw: values.merchantRaw.trim(),
    });

    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      setErrors({
        ...(fieldErrors.accountId?.[0] ? { accountId: fieldErrors.accountId[0] } : {}),
        ...(fieldErrors.amount?.[0] ? { amount: fieldErrors.amount[0] } : {}),
        ...(fieldErrors.categoryId?.[0] ? { categoryId: fieldErrors.categoryId[0] } : {}),
        ...(fieldErrors.date?.[0] ? { date: fieldErrors.date[0] } : {}),
        ...(fieldErrors.description?.[0] ? { description: fieldErrors.description[0] } : {}),
        ...(fieldErrors.merchantRaw?.[0] ? { merchantRaw: fieldErrors.merchantRaw[0] } : {}),
      });
      return;
    }

    setErrors({});
    await onSubmit({
      accountId: result.data.accountId,
      amount: result.data.amount,
      categoryId: result.data.categoryId,
      date: result.data.date,
      description: result.data.description === "" ? null : result.data.description,
      merchantRaw: result.data.merchantRaw === "" ? null : result.data.merchantRaw,
    });
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="transaction-account">Account</Label>
          <Select
            value={values.accountId || "__none__"}
            onValueChange={(value) =>
              setValues((current) => ({
                ...current,
                accountId: value === "__none__" ? "" : value,
              }))
            }
          >
            <SelectTrigger id="transaction-account">
              <SelectValue placeholder="Choose an account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Choose an account</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.accountId ? <p className="text-sm text-red-600">{errors.accountId}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="transaction-date">Date</Label>
          <Input
            id="transaction-date"
            type="date"
            value={values.date}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                date: event.target.value,
              }))
            }
          />
          {errors.date ? <p className="text-sm text-red-600">{errors.date}</p> : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="transaction-amount">Amount</Label>
          <Input
            id="transaction-amount"
            inputMode="decimal"
            placeholder="-48.27"
            value={values.amount}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                amount: event.target.value,
              }))
            }
          />
          {errors.amount ? <p className="text-sm text-red-600">{errors.amount}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="transaction-category">Category</Label>
          <Select
            value={values.categoryId ?? "__none__"}
            onValueChange={(value) =>
              setValues((current) => ({
                ...current,
                categoryId: value === "__none__" ? null : value,
              }))
            }
          >
            <SelectTrigger id="transaction-category">
              <SelectValue placeholder="Optional category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No category</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.categoryId ? <p className="text-sm text-red-600">{errors.categoryId}</p> : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="transaction-merchant">Merchant</Label>
        <Input
          id="transaction-merchant"
          placeholder="Northwind Coffee"
          value={values.merchantRaw}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              merchantRaw: event.target.value,
            }))
          }
        />
        {errors.merchantRaw ? <p className="text-sm text-red-600">{errors.merchantRaw}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="transaction-description">Description</Label>
        <textarea
          id="transaction-description"
          className="min-h-[110px] w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          placeholder="Monthly workspace software renewal"
          value={values.description}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
        />
        {errors.description ? <p className="text-sm text-red-600">{errors.description}</p> : null}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting ? "Saving..." : "Create transaction"}
        </Button>
      </div>
    </form>
  );
}
