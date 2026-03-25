"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "../contexts/auth-context";

export function AuthGuard({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { bootstrapAvailable, isBootstrapStatusLoading, isLoading, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isBootstrapStatusLoading && !user) {
      if (bootstrapAvailable) {
        router.replace("/bootstrap");
        return;
      }

      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [bootstrapAvailable, isBootstrapStatusLoading, isLoading, pathname, router, user]);

  if (isLoading || isBootstrapStatusLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="glass-panel rounded-3xl px-6 py-4 text-sm text-neutral-600 dark:text-neutral-300">
          Loading your workspace...
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
