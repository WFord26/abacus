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
import { startTransition, useEffect, useState } from "react";

import { useAuth } from "../../../src/contexts/auth-context";
import { ApiClientError, apiClient } from "../../../src/lib/api-client";

export default function LoginPage() {
  const {
    bootstrapAvailable,
    clearError,
    error,
    isBootstrapStatusLoading,
    isLoading,
    login,
    user,
  } = useAuth();
  const router = useRouter();
  const [searchParams] = useState(() =>
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search)
  );
  const [nextPath] = useState(() => {
    if (typeof window === "undefined") {
      return "/";
    }

    return new URLSearchParams(window.location.search).get("next") ?? "/";
  });
  const [form, setForm] = useState({
    email: searchParams.get("email") ?? "",
    password: "",
  });
  const [isMagicLinkLoading, setIsMagicLinkLoading] = useState(false);
  const [magicLinkMessage, setMagicLinkMessage] = useState<string | null>(
    searchParams.get("verified") === "1"
      ? "Email verified. You can sign in now."
      : searchParams.get("magic_link") === "expired"
        ? "That magic link has expired. Request a fresh one below."
        : null
  );

  useEffect(() => {
    clearError();
  }, [clearError]);

  useEffect(() => {
    if (!isLoading && !isBootstrapStatusLoading && !user && bootstrapAvailable) {
      router.replace("/bootstrap");
    }
  }, [bootstrapAvailable, isBootstrapStatusLoading, isLoading, router, user]);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(nextPath);
    }
  }, [isLoading, nextPath, router, user]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await login(form.email, form.password);
      startTransition(() => {
        router.replace(nextPath);
      });
    } catch {
      // Surface the provider error state in the UI.
    }
  }

  async function handleMagicLinkRequest() {
    if (!form.email.trim()) {
      setMagicLinkMessage("Enter your email first and we’ll send the link there.");
      return;
    }

    setIsMagicLinkLoading(true);
    setMagicLinkMessage(null);

    try {
      await apiClient<{ accepted: boolean }>("/auth/magic-link/request", {
        body: { email: form.email.trim() },
        method: "POST",
        retryOnAuthFailure: false,
      });

      setMagicLinkMessage("If that account exists, a sign-in link is on the way.");
    } catch (caughtError) {
      setMagicLinkMessage(
        caughtError instanceof ApiClientError
          ? caughtError.message
          : "We couldn't send the magic link right now."
      );
    } finally {
      setIsMagicLinkLoading(false);
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
            Pick up where you left off with your organization, reports, and finance workflows.
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

            {magicLinkMessage ? (
              <p className="rounded-2xl bg-primary-500/10 px-3 py-2 text-sm text-primary-700">
                {magicLinkMessage}
              </p>
            ) : null}

            <Button className="w-full" disabled={isLoading} type="submit">
              {isLoading ? "Signing in..." : "Sign in"}
            </Button>

            <Button
              className="w-full"
              disabled={isMagicLinkLoading}
              type="button"
              variant="outline"
              onClick={() => void handleMagicLinkRequest()}
            >
              {isMagicLinkLoading ? "Sending link..." : "Email me a magic link"}
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
