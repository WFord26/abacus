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
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../../contexts/auth-context";
import { ApiClientError, apiClient } from "../../lib/api-client";

import { CategoriesTree } from "./categories-tree";
import { CategoryForm } from "./category-form";

import type { Category, CategoryTreeNode, Role } from "@wford26/shared-types";

type ToastState = {
  description: string;
  title: string;
};

const mutationRoles: Role[] = ["owner", "admin", "accountant"];
type CategoryMutationValues = {
  color: string | null;
  name: string;
  parentId: string | null;
};

function flattenCategories(
  categories: CategoryTreeNode[],
  level = 0
): Array<CategoryTreeNode & { level: number }> {
  return categories.flatMap((category) => [
    {
      ...category,
      level,
    },
    ...flattenCategories(category.children, level + 1),
  ]);
}

function collectDescendantIds(category: CategoryTreeNode): Set<string> {
  const ids = new Set<string>();

  for (const child of category.children) {
    ids.add(child.id);
    for (const descendantId of collectDescendantIds(child)) {
      ids.add(descendantId);
    }
  }

  return ids;
}

function collectExpandableIds(categories: CategoryTreeNode[]): Set<string> {
  const ids = new Set<string>();

  for (const category of categories) {
    if (category.children.length > 0) {
      ids.add(category.id);
      for (const childId of collectExpandableIds(category.children)) {
        ids.add(childId);
      }
    }
  }

  return ids;
}

function buildMutationErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiClientError) {
    return error.message;
  }

  return fallback;
}

export function CategoriesSettingsPage() {
  const queryClient = useQueryClient();
  const { organization, organizations } = useAuth();
  const [categoryToDelete, setCategoryToDelete] = useState<CategoryTreeNode | null>(null);
  const [editingCategory, setEditingCategory] = useState<CategoryTreeNode | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const activeRole = useMemo(
    () =>
      organizations.find((membership) => membership.organization.id === organization?.id)?.role ??
      null,
    [organization?.id, organizations]
  );
  const canManageCategories = useMemo(
    () => (activeRole ? mutationRoles.includes(activeRole) : false),
    [activeRole]
  );
  const categoriesQueryKey = useMemo(
    () => ["categories-settings", organization?.id ?? "unknown"],
    [organization?.id]
  );
  const categoriesQuery = useQuery({
    enabled: Boolean(organization?.id),
    queryFn: () => apiClient<CategoryTreeNode[]>("/categories"),
    queryKey: categoriesQueryKey,
  });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const categories = categoriesQuery.data ?? [];
  const flatCategories = useMemo(() => flattenCategories(categories), [categories]);

  useEffect(() => {
    if (categories.length === 0) {
      return;
    }

    setExpandedIds((current) => {
      if (current.size > 0) {
        return current;
      }

      return collectExpandableIds(categories);
    });
  }, [categories]);

  const parentOptions = useMemo(() => {
    const blockedIds = editingCategory ? collectDescendantIds(editingCategory) : new Set<string>();

    if (editingCategory) {
      blockedIds.add(editingCategory.id);
    }

    return flatCategories
      .filter((category) => !blockedIds.has(category.id))
      .map((category) => ({
        id: category.id,
        label: `${"· ".repeat(category.level)}${category.name}`,
      }));
  }, [editingCategory, flatCategories]);

  const createMutation = useMutation({
    mutationFn: async (values: CategoryMutationValues) =>
      apiClient<Category>("/categories", {
        body: values,
        method: "POST",
      }),
    onError: (error) => {
      setToast({
        description: buildMutationErrorMessage(error, "Unable to create category"),
        title: "Category not created",
      });
    },
    onSuccess: () => {
      setIsDialogOpen(false);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: categoriesQueryKey,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: CategoryMutationValues & { categoryId: string }) =>
      apiClient<Category>(`/categories/${input.categoryId}`, {
        body: {
          color: input.color,
          name: input.name,
          parentId: input.parentId,
        },
        method: "PATCH",
      }),
    onError: (error) => {
      setToast({
        description: buildMutationErrorMessage(error, "Unable to update category"),
        title: "Category not updated",
      });
    },
    onSuccess: () => {
      setIsDialogOpen(false);
      setEditingCategory(null);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: categoriesQueryKey,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (categoryId: string) =>
      apiClient<{ deleted: true }>(`/categories/${categoryId}`, {
        method: "DELETE",
      }),
    onError: (error) => {
      setToast({
        description: buildMutationErrorMessage(
          error,
          "Unable to delete category because transactions are still assigned to it."
        ),
        title: "Delete failed",
      });
    },
    onSuccess: () => {
      setCategoryToDelete(null);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: categoriesQueryKey,
      });
    },
  });

  const activeCount = flatCategories.filter((category) => category.isActive).length;
  const inactiveCount = flatCategories.length - activeCount;

  return (
    <ToastProvider>
      <div className="grid gap-4 xl:grid-cols-[1.7fr_0.72fr]">
        <Card className="glass-panel panel-grid rise-in overflow-hidden border-0">
          <CardHeader className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.26em] text-primary-600">
                Ledger settings
              </p>
              <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">
                Categories
              </CardTitle>
              <CardDescription className="max-w-2xl text-base text-neutral-700 dark:text-neutral-300">
                Organize reporting and review workflows with nested categories, deliberate color
                cues, and parent-child grouping that matches the ledger tree.
              </CardDescription>
            </div>
            {canManageCategories ? (
              <Button
                className="w-full md:w-auto"
                onClick={() => {
                  setEditingCategory(null);
                  setIsDialogOpen(true);
                }}
              >
                Add category
              </Button>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {categoriesQuery.isError ? (
              <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                Unable to load categories right now. Please refresh and try again.
              </div>
            ) : null}
            <CategoriesTree
              canManageCategories={canManageCategories}
              categories={categories}
              expandedIds={expandedIds}
              isLoading={categoriesQuery.isLoading}
              onDelete={(category) => setCategoryToDelete(category)}
              onEdit={(category) => {
                setEditingCategory(category);
                setIsDialogOpen(true);
              }}
              onToggle={(categoryId) =>
                setExpandedIds((current) => {
                  const next = new Set(current);

                  if (next.has(categoryId)) {
                    next.delete(categoryId);
                  } else {
                    next.add(categoryId);
                  }

                  return next;
                })
              }
            />
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card className="glass-panel rise-in border-0">
            <CardHeader>
              <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                Tree health
              </p>
              <CardTitle className="text-xl text-neutral-900 dark:text-neutral-50">
                {flatCategories.length} categories
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
              <p>{activeCount} active categories are available for live assignment.</p>
              <p>{inactiveCount} inactive categories remain visible for historical continuity.</p>
            </CardContent>
          </Card>

          <Card className="glass-panel rise-in border-0">
            <CardHeader>
              <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                Controls
              </p>
              <CardTitle className="text-xl text-neutral-900 dark:text-neutral-50">
                Nested editing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
              <p>
                Expand parent categories to inspect child branches, then re-parent or recolor them
                from the editor.
              </p>
              <p>
                The palette is intentionally constrained so the settings surface stays visually
                consistent once category chips appear elsewhere in the app.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);

          if (!open) {
            setEditingCategory(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? "Edit category" : "Add category"}</DialogTitle>
            <DialogDescription>
              {editingCategory
                ? "Update the name, color, or parent assignment for this branch of the category tree."
                : "Create a new category and optionally nest it under an existing parent."}
            </DialogDescription>
          </DialogHeader>
          <CategoryForm
            category={editingCategory}
            isSubmitting={createMutation.isPending || updateMutation.isPending}
            parentOptions={parentOptions}
            onCancel={() => {
              setIsDialogOpen(false);
              setEditingCategory(null);
            }}
            onSubmit={async (values) => {
              if (editingCategory) {
                await updateMutation.mutateAsync({
                  categoryId: editingCategory.id,
                  ...values,
                });
                return;
              }

              await createMutation.mutateAsync(values);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(categoryToDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setCategoryToDelete(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete category</DialogTitle>
            <DialogDescription>
              Remove {categoryToDelete?.name ?? "this category"} from the active tree. If
              transactions are still assigned, the ledger service will reject the delete and we’ll
              keep the category visible.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCategoryToDelete(null)}>
              Cancel
            </Button>
            <Button
              disabled={deleteMutation.isPending || !categoryToDelete}
              variant="destructive"
              onClick={async () => {
                if (!categoryToDelete) {
                  return;
                }

                await deleteMutation.mutateAsync(categoryToDelete.id);
              }}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete category"}
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
