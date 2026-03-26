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

import type { Category } from "@wford26/shared-types";

export const categoryColorPalette = [
  "#0f766e",
  "#1d4ed8",
  "#2563eb",
  "#475569",
  "#7c3aed",
  "#9333ea",
  "#b45309",
  "#c2410c",
  "#dc2626",
  "#db2777",
  "#65a30d",
  "#16a34a",
] as const;

const categoryFormSchema = z.object({
  color: z
    .enum(categoryColorPalette)
    .nullable()
    .or(z.literal(""))
    .transform((value) => (value === "" ? null : value)),
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  parentId: z.string().uuid().nullable(),
});

type CategoryFormValues = {
  color: string | null;
  name: string;
  parentId: string | null;
};

type ParentOption = {
  id: string;
  label: string;
};

function toInitialValues(
  category?: Pick<Category, "color" | "name" | "parentId"> | null
): CategoryFormValues {
  return {
    color: category?.color ?? null,
    name: category?.name ?? "",
    parentId: category?.parentId ?? null,
  };
}

export function CategoryForm({
  category,
  isSubmitting,
  onCancel,
  onSubmit,
  parentOptions,
}: Readonly<{
  category?: Pick<Category, "color" | "name" | "parentId"> | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (values: CategoryFormValues) => Promise<void> | void;
  parentOptions: ParentOption[];
}>) {
  const [values, setValues] = useState<CategoryFormValues>(() => toInitialValues(category));
  const [errors, setErrors] = useState<Partial<Record<keyof CategoryFormValues, string>>>({});

  useEffect(() => {
    setValues(toInitialValues(category));
    setErrors({});
  }, [category]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = categoryFormSchema.safeParse({
      color: values.color ?? "",
      name: values.name.trim(),
      parentId: values.parentId,
    });

    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      setErrors({
        ...(fieldErrors.color?.[0] ? { color: fieldErrors.color[0] } : {}),
        ...(fieldErrors.name?.[0] ? { name: fieldErrors.name[0] } : {}),
        ...(fieldErrors.parentId?.[0] ? { parentId: fieldErrors.parentId[0] } : {}),
      });
      return;
    }

    setErrors({});
    await onSubmit(result.data);
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="category-name">Name</Label>
        <Input
          id="category-name"
          placeholder="Software & subscriptions"
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

      <div className="space-y-2">
        <Label htmlFor="category-parent">Parent category</Label>
        <Select
          value={values.parentId ?? "__none__"}
          onValueChange={(value) =>
            setValues((current) => ({
              ...current,
              parentId: value === "__none__" ? null : value,
            }))
          }
        >
          <SelectTrigger id="category-parent">
            <SelectValue placeholder="Choose an optional parent" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No parent</SelectItem>
            {parentOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.parentId ? <p className="text-sm text-red-600">{errors.parentId}</p> : null}
      </div>

      <div className="space-y-3">
        <Label>Color</Label>
        <div className="grid grid-cols-6 gap-2">
          <button
            className={[
              "flex h-11 items-center justify-center rounded-2xl border text-xs font-medium transition",
              values.color === null
                ? "border-primary-500 bg-primary-50 text-primary-700"
                : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-400",
            ].join(" ")}
            type="button"
            onClick={() =>
              setValues((current) => ({
                ...current,
                color: null,
              }))
            }
          >
            None
          </button>
          {categoryColorPalette.map((color) => (
            <button
              key={color}
              aria-label={`Choose ${color}`}
              className={[
                "h-11 rounded-2xl border-2 transition",
                values.color === color
                  ? "border-neutral-900 shadow-lg shadow-neutral-900/15"
                  : "border-white hover:scale-[1.02]",
              ].join(" ")}
              style={{ backgroundColor: color }}
              type="button"
              onClick={() =>
                setValues((current) => ({
                  ...current,
                  color,
                }))
              }
            />
          ))}
        </div>
        <p className="text-xs text-neutral-500">
          Choose from the shared 12-color bookkeeping palette.
        </p>
        {errors.color ? <p className="text-sm text-red-600">{errors.color}</p> : null}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting ? "Saving..." : category ? "Save changes" : "Create category"}
        </Button>
      </div>
    </form>
  );
}
