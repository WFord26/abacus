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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { useAuth } from "../../../src/contexts/auth-context";

export default function LoginPage() {
  const { error, isLoading, login } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await login(form.email, form.password);
      const nextPath =
        typeof window === "undefined"
          ? "/"
          : (new URLSearchParams(window.location.search).get("next") ?? "/");

      startTransition(() => {
        router.replace(nextPath);
      });
    } catch {
      // Surface the provider error state in the UI.
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="glass-panel w-full max-w-md border-0">
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.26em] text-primary-600">Phase 1</p>
          <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">
            Sign in to Abacus
          </CardTitle>
          <CardDescription className="text-base text-neutral-600 dark:text-neutral-300">
            This shell is wired for the upcoming identity service routes and token flow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                placeholder="owner@studio.co"
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
                placeholder="••••••••••••"
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
              {isLoading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-300">
            Need an account?{" "}
            <Link className="font-semibold text-primary-600" href="/register">
              Create one
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
