"use client";

import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wford26/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { startTransition, useMemo, useState } from "react";

import { useAuth } from "../contexts/auth-context";

const navigationItems = [
  { href: "/", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/expenses", label: "Expenses" },
  { href: "/receipts", label: "Receipts" },
  { href: "/invoices", label: "Invoices" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

function getInitials(name?: string | null, email?: string | null) {
  if (name) {
    return name
      .split(" ")
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2);
  }

  return email?.slice(0, 2).toUpperCase() ?? "AB";
}

export function AppShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { logout, organization, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  const userInitials = useMemo(
    () => getInitials(user?.name, user?.email),
    [user?.email, user?.name]
  );

  async function handleLogout() {
    await logout();
    startTransition(() => {
      router.replace("/login");
    });
  }

  return (
    <div className="min-h-screen px-4 py-4 md:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-7xl gap-4">
        <aside
          className={[
            "glass-panel fixed inset-y-4 left-4 z-20 w-72 rounded-[2rem] p-4 shadow-2xl shadow-primary-900/10 transition-transform md:static md:translate-x-0",
            isSidebarOpen ? "translate-x-0" : "-translate-x-[120%]",
          ].join(" ")}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-600">
                Abacus
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                Finance shell
              </h1>
            </div>
            <Button
              className="md:hidden"
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => setIsSidebarOpen(false)}
            >
              x
            </Button>
          </div>

          <nav className="mt-8 space-y-2">
            {navigationItems.map((item) => {
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  className={[
                    "flex items-center rounded-2xl px-4 py-3 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary-500 text-white shadow-lg shadow-primary-500/25"
                      : "text-neutral-700 hover:bg-white/70 dark:text-neutral-200 dark:hover:bg-neutral-800/50",
                  ].join(" ")}
                  href={item.href}
                  onClick={() => setIsSidebarOpen(false)}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 rounded-3xl bg-neutral-950 px-4 py-5 text-neutral-50">
            <p className="text-xs uppercase tracking-[0.24em] text-primary-300">Phase 1</p>
            <p className="mt-3 text-sm text-neutral-300">
              Gateway, auth shell, and onboarding paths now have a home in the app.
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="glass-panel flex items-center justify-between rounded-[2rem] px-4 py-3 shadow-lg shadow-primary-900/5 md:px-6">
            <div className="flex items-center gap-3">
              <Button
                className="md:hidden"
                size="icon"
                type="button"
                variant="outline"
                onClick={() => setIsSidebarOpen(true)}
              >
                =
              </Button>
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
                  Active organization
                </p>
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {organization?.name ?? "No organization selected"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
              >
                {resolvedTheme === "dark" ? "Light mode" : "Dark mode"}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-3 rounded-full border border-neutral-200 bg-white/70 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900/60">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>{userInitials}</AvatarFallback>
                    </Avatar>
                    <span className="hidden text-left md:block">
                      <span className="block text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                        {user?.name ?? user?.email ?? "Workspace user"}
                      </span>
                      <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                        {user?.email ?? "No email yet"}
                      </span>
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Account</DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <Link href="/settings">Settings</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <main className="min-h-[70vh] rounded-[2rem]">{children}</main>
        </div>
      </div>
    </div>
  );
}
