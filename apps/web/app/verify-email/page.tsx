"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@wford26/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ApiClientError, apiClient } from "../../src/lib/api-client";
import { getStoredAuthSession, setStoredAuthSession } from "../../src/lib/auth-storage";

import type { User } from "@wford26/shared-types";

type EmailVerificationResponse = {
  user: User;
  verified: true;
};

export default function VerifyEmailPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    let cancelled = false;

    async function verifyEmail() {
      const token =
        typeof window === "undefined"
          ? null
          : new URLSearchParams(window.location.search).get("token");

      if (!token) {
        setMessage("This verification link is missing its token.");
        return;
      }

      try {
        const result = await apiClient<EmailVerificationResponse>(
          "/auth/email-verification/consume",
          {
            body: { token },
            method: "POST",
            retryOnAuthFailure: false,
          }
        );

        if (cancelled) {
          return;
        }

        const session = getStoredAuthSession();

        if (session?.user?.id === result.user.id) {
          setStoredAuthSession({
            ...session,
            user: result.user,
          });
          router.replace("/");
          return;
        }

        router.replace("/login?verified=1");
      } catch (caughtError) {
        if (cancelled) {
          return;
        }

        setMessage(
          caughtError instanceof ApiClientError
            ? caughtError.message
            : "Unable to verify your email."
        );
      }
    }

    void verifyEmail();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="glass-panel w-full max-w-md border-0">
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.26em] text-primary-600">Account Security</p>
          <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">
            Verify email
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-neutral-600 dark:text-neutral-300">{message}</p>
        </CardContent>
      </Card>
    </main>
  );
}
