"use client";

import { Badge, Button } from "@wford26/ui";
import { Fragment } from "react";

import type { CategoryTreeNode } from "@wford26/shared-types";

function CategoryRow({
  canManageCategories,
  expandedIds,
  level,
  node,
  onDelete,
  onEdit,
  onToggle,
}: Readonly<{
  canManageCategories: boolean;
  expandedIds: Set<string>;
  level: number;
  node: CategoryTreeNode;
  onDelete: (category: CategoryTreeNode) => void;
  onEdit: (category: CategoryTreeNode) => void;
  onToggle: (categoryId: string) => void;
}>) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);

  return (
    <Fragment>
      <div
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-[1.5rem] border border-neutral-200/70 bg-white/85 px-4 py-3 shadow-sm"
        style={{ marginLeft: `${level * 18}px` }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <button
              className={[
                "flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold transition",
                hasChildren
                  ? "border-neutral-200 bg-neutral-50 text-neutral-700 hover:border-neutral-400"
                  : "cursor-default border-transparent bg-transparent text-neutral-300",
              ].join(" ")}
              disabled={!hasChildren}
              type="button"
              onClick={() => onToggle(node.id)}
            >
              {hasChildren ? (isExpanded ? "−" : "+") : "•"}
            </button>
            <span
              className="h-4 w-4 rounded-full border border-white shadow-sm"
              style={{ backgroundColor: node.color ?? "#cbd5e1" }}
            />
            <div className="min-w-0">
              <p className="truncate font-medium text-neutral-900">{node.name}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {node.color ? (
                  <Badge variant="secondary">{node.color.toUpperCase()}</Badge>
                ) : (
                  <Badge variant="secondary">No color</Badge>
                )}
                {!node.isActive ? <Badge variant="warning">Inactive</Badge> : null}
                {hasChildren ? (
                  <Badge variant="secondary">
                    {node.children.length} child{node.children.length === 1 ? "" : "ren"}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {canManageCategories ? (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => onEdit(node)}>
              Edit
            </Button>
            <Button size="sm" variant="destructive" onClick={() => onDelete(node)}>
              Delete
            </Button>
          </div>
        ) : null}
      </div>

      {hasChildren && isExpanded
        ? node.children.map((child) => (
            <CategoryRow
              key={child.id}
              canManageCategories={canManageCategories}
              expandedIds={expandedIds}
              level={level + 1}
              node={child}
              onDelete={onDelete}
              onEdit={onEdit}
              onToggle={onToggle}
            />
          ))
        : null}
    </Fragment>
  );
}

export function CategoriesTree({
  canManageCategories,
  categories,
  expandedIds,
  isLoading,
  onDelete,
  onEdit,
  onToggle,
}: Readonly<{
  canManageCategories: boolean;
  categories: CategoryTreeNode[];
  expandedIds: Set<string>;
  isLoading: boolean;
  onDelete: (category: CategoryTreeNode) => void;
  onEdit: (category: CategoryTreeNode) => void;
  onToggle: (categoryId: string) => void;
}>) {
  if (isLoading) {
    return (
      <div className="rounded-3xl border border-neutral-200/70 bg-white/80 p-6 text-sm text-neutral-600">
        Loading categories...
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-neutral-300 bg-white/75 p-8 text-center">
        <p className="text-lg font-semibold text-neutral-900">No categories yet</p>
        <p className="mt-2 text-sm text-neutral-600">
          Add your first category to start organizing transaction review and reporting.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {categories.map((category) => (
        <CategoryRow
          key={category.id}
          canManageCategories={canManageCategories}
          expandedIds={expandedIds}
          level={0}
          node={category}
          onDelete={onDelete}
          onEdit={onEdit}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}
