"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@wford26/ui";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";

import { useAuth } from "../../../src/contexts/auth-context";

export default function SetupPage() {
  const { clearError, createOrganization, error, isLoading, organization, user } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    businessType: "",
    name: "",
  });

  useEffect(() => {
    clearError();
  }, [clearError]);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login?next=%2Fsetup");
    }
  }, [isLoading, router, user]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await createOrganization(form.name, form.businessType.trim() || undefined);
      startTransition(() => {
        router.replace("/");
      });
    } catch {
      // Surface the provider error state in the UI.
    }
  }

  function handleContinue() {
    startTransition(() => {
      router.replace("/");
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="glass-panel w-full max-w-2xl border-0">
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.26em] text-primary-600">Workspace setup</p>
          <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">
            Finish your first workspace
          </CardTitle>
          <CardDescription className="max-w-xl text-base text-neutral-600 dark:text-neutral-300">
            Your personal workspace is already ready to use. Create a dedicated business workspace
            now, or continue with your current workspace and come back later from settings.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="workspace-name">Workspace name</Label>
                <Input
                  id="workspace-name"
                  placeholder="Northwind Studio"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="business-type">Business type</Label>
                <Input
                  id="business-type"
                  placeholder="Agency, consultancy, ecommerce..."
                  value={form.businessType}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, businessType: event.target.value }))
                  }
                />
              </div>

              {error ? (
                <p className="rounded-2xl bg-error/10 px-3 py-2 text-sm text-error">{error}</p>
              ) : null}

              <Button
                className="w-full"
                disabled={isLoading || form.name.trim().length === 0}
                type="submit"
              >
                {isLoading ? "Creating workspace..." : "Create workspace"}
              </Button>
            </form>
          </div>

          <div className="space-y-4 rounded-[1.75rem] border border-neutral-200/70 bg-white/70 p-5 dark:border-neutral-800 dark:bg-neutral-950/40">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
                Current session
              </p>
              <h2 className="mt-2 text-xl font-semibold text-neutral-900 dark:text-neutral-50">
                {organization?.name ?? "Personal workspace"}
              </h2>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
                Signed in as {user?.name ?? user?.email ?? "your account"}.
              </p>
            </div>

            <div className="rounded-2xl bg-primary-500/8 px-4 py-4 text-sm text-neutral-700 dark:text-neutral-200">
              Creating a new workspace will make it your active organization immediately, so the
              main app opens in the right context.
            </div>

            <Button
              className="w-full"
              disabled={isLoading}
              type="button"
              variant="outline"
              onClick={handleContinue}
            >
              Continue with {organization?.name ?? "my personal workspace"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
