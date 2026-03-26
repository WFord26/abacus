"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@wford26/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiClientError, apiClient } from "../../src/lib/api-client";
import { setStoredAuthSession } from "../../src/lib/auth-storage";

import type { AuthTokens, Organization, User } from "@wford26/shared-types";

type AuthSessionResponse = {
  organization: Organization;
  tokens: AuthTokens;
  user: User;
};

export default function MagicLinkPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Signing you in...");

  useEffect(() => {
    let cancelled = false;

    async function consumeMagicLink() {
      const token =
        typeof window === "undefined"
          ? null
          : new URLSearchParams(window.location.search).get("token");

      if (!token) {
        setMessage("This sign-in link is missing its token.");
        return;
      }

      try {
        const session = await apiClient<AuthSessionResponse>("/auth/magic-link/consume", {
          body: { token },
          method: "POST",
          retryOnAuthFailure: false,
        });

        if (cancelled) {
          return;
        }

        setStoredAuthSession({
          accessToken: session.tokens.accessToken,
          organization: session.organization,
          user: session.user,
        });
        router.replace("/");
      } catch (caughtError) {
        if (cancelled) {
          return;
        }

        const message =
          caughtError instanceof ApiClientError ? caughtError.message : "Unable to sign you in.";

        setMessage(message);
        router.replace("/login?magic_link=expired");
      }
    }

    void consumeMagicLink();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="glass-panel w-full max-w-md border-0">
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.26em] text-primary-600">Email Sign-In</p>
          <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">
            Magic link
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-neutral-600 dark:text-neutral-300">{message}</p>
        </CardContent>
      </Card>
    </main>
  );
}
