"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from "@wford26/ui";
import { useEffect, useMemo, useState } from "react";

import type { Customer } from "@wford26/shared-types";

type CustomerDraft = {
  city: string;
  country: string;
  email: string;
  line1: string;
  name: string;
  phone: string;
  postalCode: string;
  region: string;
};

export type CustomerPayload = {
  address?: Record<string, string | null> | null;
  email?: string | null;
  name: string;
  phone?: string | null;
};

type CustomerDialogProps = {
  customer?: Customer | null;
  open: boolean;
  pending?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CustomerPayload) => Promise<void> | void;
};

function toDraft(customer?: Customer | null): CustomerDraft {
  return {
    city: customer?.address?.city ?? "",
    country: customer?.address?.country ?? "",
    email: customer?.email ?? "",
    line1: customer?.address?.line1 ?? "",
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    postalCode: customer?.address?.postalCode ?? "",
    region: customer?.address?.region ?? "",
  };
}

function buildPayload(draft: CustomerDraft): CustomerPayload {
  const trimmedAddress = {
    city: draft.city.trim(),
    country: draft.country.trim(),
    line1: draft.line1.trim(),
    postalCode: draft.postalCode.trim(),
    region: draft.region.trim(),
  };
  const hasAddress = Object.values(trimmedAddress).some(Boolean);

  return {
    name: draft.name.trim(),
    ...(draft.email.trim() ? { email: draft.email.trim() } : { email: null }),
    ...(draft.phone.trim() ? { phone: draft.phone.trim() } : { phone: null }),
    ...(hasAddress
      ? {
          address: {
            city: trimmedAddress.city || null,
            country: trimmedAddress.country || null,
            line1: trimmedAddress.line1 || null,
            postalCode: trimmedAddress.postalCode || null,
            region: trimmedAddress.region || null,
          },
        }
      : { address: null }),
  };
}

export function CustomerDialog({
  customer,
  open,
  pending = false,
  onOpenChange,
  onSubmit,
}: Readonly<CustomerDialogProps>) {
  const [draft, setDraft] = useState<CustomerDraft>(() => toDraft(customer));
  const modeLabel = useMemo(() => (customer ? "Edit customer" : "Add customer"), [customer]);

  useEffect(() => {
    if (open) {
      setDraft(toDraft(customer));
    }
  }, [customer, open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(buildPayload(draft));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{modeLabel}</DialogTitle>
          <DialogDescription>
            Store customer contact details here so invoices and PDF exports stay consistent.
          </DialogDescription>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-neutral-900" htmlFor="customer-name">
              Name
            </label>
            <Input
              required
              disabled={pending}
              id="customer-name"
              value={draft.name}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-neutral-900" htmlFor="customer-email">
                Email
              </label>
              <Input
                disabled={pending}
                id="customer-email"
                type="email"
                value={draft.email}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-neutral-900" htmlFor="customer-phone">
                Phone
              </label>
              <Input
                disabled={pending}
                id="customer-phone"
                value={draft.phone}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-neutral-900" htmlFor="customer-line1">
              Billing address
            </label>
            <Input
              disabled={pending}
              id="customer-line1"
              placeholder="Street address"
              value={draft.line1}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  line1: event.target.value,
                }))
              }
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium text-neutral-900" htmlFor="customer-city">
                City
              </label>
              <Input
                disabled={pending}
                id="customer-city"
                value={draft.city}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    city: event.target.value,
                  }))
                }
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-neutral-900" htmlFor="customer-region">
                State
              </label>
              <Input
                disabled={pending}
                id="customer-region"
                value={draft.region}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    region: event.target.value,
                  }))
                }
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-neutral-900" htmlFor="customer-postal">
                Postal code
              </label>
              <Input
                disabled={pending}
                id="customer-postal"
                value={draft.postalCode}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    postalCode: event.target.value,
                  }))
                }
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-neutral-900" htmlFor="customer-country">
                Country
              </label>
              <Input
                disabled={pending}
                id="customer-country"
                value={draft.country}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    country: event.target.value,
                  }))
                }
              />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              disabled={pending}
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button disabled={pending || !draft.name.trim()} type="submit">
              {pending ? "Saving..." : customer ? "Save changes" : "Create customer"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
