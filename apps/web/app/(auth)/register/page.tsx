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

export default function RegisterPage() {
  const { error, isLoading, register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    name: "",
    password: "",
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      await register(form.name, form.email, form.password);
      startTransition(() => {
        router.replace("/");
      });
    } catch {
      // Surface the provider error state in the UI.
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="glass-panel w-full max-w-md border-0">
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.26em] text-primary-600">New workspace</p>
          <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">
            Create your account
          </CardTitle>
          <CardDescription className="text-base text-neutral-600 dark:text-neutral-300">
            Registration is ready for the identity service flow and personal-organization bootstrap.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
              {isLoading ? "Creating account..." : "Create account"}
            </Button>
          </form>

          <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-300">
            Already have an account?{" "}
            <Link className="font-semibold text-primary-600" href="/login">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
