"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@wford26/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";

import { useAuth } from "../../../src/contexts/auth-context";

export default function BootstrapPage() {
  const {
    bootstrapAdmin,
    bootstrapAvailable,
    clearError,
    error,
    isBootstrapStatusLoading,
    isLoading,
    user,
  } = useAuth();
  const router = useRouter();
  const [shouldRouteToSetup, setShouldRouteToSetup] = useState(false);
  const [form, setForm] = useState({
    email: "",
    name: "",
    password: "",
  });

  useEffect(() => {
    clearError();
  }, [clearError]);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(shouldRouteToSetup ? "/setup" : "/");
    }
  }, [isLoading, router, shouldRouteToSetup, user]);

  useEffect(() => {
    if (!isBootstrapStatusLoading && !bootstrapAvailable && !user) {
      router.replace("/login");
    }
  }, [bootstrapAvailable, isBootstrapStatusLoading, router, user]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShouldRouteToSetup(true);

    try {
      await bootstrapAdmin(form.name, form.email, form.password);
      startTransition(() => {
        router.replace("/setup");
      });
    } catch {
      setShouldRouteToSetup(false);
      // Surface the provider error state in the UI.
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="glass-panel w-full max-w-2xl border-0">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-primary-600">
                First-run setup
              </p>
              <CardTitle className="mt-2 text-3xl text-neutral-900 dark:text-neutral-50">
                Create the first admin account
              </CardTitle>
            </div>
            <Badge variant="warning">Bootstrap mode</Badge>
          </div>
          <CardDescription className="max-w-xl text-base text-neutral-600 dark:text-neutral-300">
            This environment does not have any registered auth accounts yet. Create the first owner
            account to unlock the rest of the app, then continue into workspace setup.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  placeholder="Avery Chen"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  placeholder="admin@studio.co"
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  placeholder="Create a strong password"
                  type="password"
                  value={form.password}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, password: event.target.value }))
                  }
                />
              </div>

              {error ? (
                <p className="rounded-2xl bg-error/10 px-3 py-2 text-sm text-error">{error}</p>
              ) : null}

              <Button className="w-full" disabled={isLoading} type="submit">
                {isLoading ? "Creating first admin..." : "Create first admin"}
              </Button>
            </form>
          </div>

          <div className="space-y-4 rounded-[1.75rem] border border-neutral-200/70 bg-white/70 p-5 dark:border-neutral-800 dark:bg-neutral-950/40">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
                What happens next
              </p>
              <h2 className="mt-2 text-xl font-semibold text-neutral-900 dark:text-neutral-50">
                Owner access and a personal workspace
              </h2>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
                The first admin is created through the one-time bootstrap API, signed in
                immediately, and routed into the same workspace setup flow as a normal new account.
              </p>
            </div>

            <div className="rounded-2xl bg-primary-500/8 px-4 py-4 text-sm text-neutral-700 dark:text-neutral-200">
              After the first account exists, this page closes automatically and the app falls back
              to normal sign-in and registration.
            </div>

            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              Already initialized?{" "}
              <Link className="font-semibold text-primary-600" href="/login">
                Go to sign in
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
