"use client";

import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wford26/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { startTransition, useEffect, useMemo, useState } from "react";

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

function formatRoleLabel(role: string | null) {
  if (!role) {
    return null;
  }

  return role[0]?.toUpperCase() + role.slice(1);
}

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

function isActiveRoute(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const {
    hasResolvedOrganizations,
    isLoading,
    isOrganizationsLoading,
    logout,
    organization,
    organizations,
    switchOrganization,
    user,
  } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  const userInitials = useMemo(
    () => getInitials(user?.name, user?.email),
    [user?.email, user?.name]
  );
  const activeMemberships = useMemo(
    () =>
      organizations
        .filter((membership) => membership.status === "active")
        .sort((left, right) => left.organization.name.localeCompare(right.organization.name)),
    [organizations]
  );
  const pendingMemberships = useMemo(
    () => organizations.filter((membership) => membership.status === "pending"),
    [organizations]
  );
  const activeRole = useMemo(
    () =>
      organizations.find((membership) => membership.organization.id === organization?.id)?.role ??
      null,
    [organization?.id, organizations]
  );
  const activeOrganizationId = useMemo(
    () => organization?.id ?? activeMemberships[0]?.organization.id ?? "",
    [activeMemberships, organization?.id]
  );
  const activeRoleLabel = useMemo(() => formatRoleLabel(activeRole), [activeRole]);
  const pendingInviteLabel = useMemo(() => {
    if (pendingMemberships.length === 0) {
      return null;
    }

    return `${pendingMemberships.length} pending invite${pendingMemberships.length === 1 ? "" : "s"}`;
  }, [pendingMemberships.length]);
  const isOrganizationStatePending = Boolean(user) && !hasResolvedOrganizations;

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [pathname]);

  async function handleLogout() {
    await logout();
    startTransition(() => {
      router.replace("/login");
    });
  }

  async function handleOrganizationChange(value: string) {
    if (!value || value === organization?.id) {
      return;
    }

    try {
      await switchOrganization(value);
    } catch {
      // Surface provider errors through the shared auth state.
    }
  }

  return (
    <div className="min-h-screen px-4 py-4 md:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-7xl gap-4">
        {isSidebarOpen ? (
          <button
            aria-label="Close navigation menu"
            className="fixed inset-0 z-10 bg-neutral-950/35 backdrop-blur-sm md:hidden"
            type="button"
            onClick={() => setIsSidebarOpen(false)}
          />
        ) : null}

        <aside
          className={[
            "glass-panel panel-grid fixed inset-y-4 left-4 z-20 w-72 overflow-hidden rounded-[2rem] p-4 shadow-2xl shadow-primary-900/10 transition-transform md:static md:translate-x-0",
            isSidebarOpen ? "translate-x-0" : "-translate-x-[120%]",
          ].join(" ")}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary-600">
                Abacus
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                Finance cockpit
              </h1>
              <p className="mt-2 max-w-[14rem] text-sm text-neutral-700 dark:text-neutral-300">
                Navigate the active workspace, switch contexts, and keep your finance flow moving.
              </p>
            </div>
            <Button
              className="md:hidden"
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => setIsSidebarOpen(false)}
            >
              Close
            </Button>
          </div>

          <div className="mt-8 rounded-[1.6rem] border border-white/60 bg-white/65 p-4 dark:border-neutral-800 dark:bg-neutral-950/45">
            <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
              Session
            </p>
            <p className="mt-2 truncate text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              {organization?.name ?? "Workspace pending"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {isOrganizationStatePending ? (
                <Badge variant="secondary">Syncing workspace</Badge>
              ) : activeRoleLabel ? (
                <Badge variant="secondary">{activeRoleLabel}</Badge>
              ) : (
                <Badge variant="warning">Setup required</Badge>
              )}
              {pendingInviteLabel ? <Badge variant="warning">{pendingInviteLabel}</Badge> : null}
            </div>
          </div>

          <nav className="mt-8 space-y-2">
            <p className="px-3 text-[11px] uppercase tracking-[0.24em] text-neutral-600 dark:text-neutral-400">
              Navigation
            </p>
            {navigationItems.map((item) => {
              const isActive = isActiveRoute(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  className={[
                    "group flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary-500 text-white shadow-lg shadow-primary-500/25"
                      : "text-neutral-800 hover:bg-white/80 dark:text-neutral-200 dark:hover:bg-neutral-800/50",
                  ].join(" ")}
                  href={item.href}
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <span>{item.label}</span>
                  <span
                    className={[
                      "h-2 w-2 rounded-full transition-colors",
                      isActive
                        ? "bg-white/90"
                        : "bg-neutral-300 group-hover:bg-primary-400 dark:bg-neutral-600",
                    ].join(" ")}
                  />
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 rounded-3xl bg-neutral-950 px-4 py-5 text-neutral-50">
            <p className="text-xs uppercase tracking-[0.24em] text-primary-300">Phase 1</p>
            <p className="mt-3 text-sm text-neutral-300">
              Identity, onboarding, and shell context are all live. Ledger pages can plug into this
              frame without more layout work.
            </p>
            <div className="mt-4 flex items-center justify-between text-xs text-neutral-400">
              <span>{activeMemberships.length} active workspaces</span>
              <span>{user?.email ?? "Signed in"}</span>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="glass-panel rise-in flex flex-col gap-4 rounded-[2rem] px-4 py-4 shadow-lg shadow-primary-900/5 md:px-6">
            <div className="flex items-center justify-between gap-3">
              <Button
                className="md:hidden"
                size="sm"
                type="button"
                variant="outline"
                onClick={() => setIsSidebarOpen(true)}
              >
                Menu
              </Button>

              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                  Active organization
                </p>
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <p className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                    {organization?.name ?? "No active workspace"}
                  </p>
                  {activeRoleLabel ? (
                    <Badge className="hidden md:inline-flex" variant="secondary">
                      {activeRoleLabel}
                    </Badge>
                  ) : null}
                  {pendingInviteLabel ? (
                    <Badge className="hidden md:inline-flex" variant="warning">
                      {pendingInviteLabel}
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  className="hidden sm:inline-flex"
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
                        <span className="block text-xs text-neutral-600 dark:text-neutral-400">
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
                    {activeMemberships.length === 0 ? (
                      <DropdownMenuItem asChild>
                        <Link href="/setup">Finish setup</Link>
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout}>Sign out</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
                    Workspace switcher
                  </p>
                  {isOrganizationStatePending || isOrganizationsLoading ? (
                    <span className="text-xs text-neutral-600 dark:text-neutral-400">
                      Syncing workspaces...
                    </span>
                  ) : null}
                </div>
                {activeMemberships.length > 0 ? (
                  <Select
                    disabled={isLoading || isOrganizationsLoading || isOrganizationStatePending}
                    value={activeOrganizationId}
                    onValueChange={handleOrganizationChange}
                  >
                    <SelectTrigger className="mt-2 h-12 rounded-2xl border-neutral-200 bg-white/80 dark:border-neutral-700 dark:bg-neutral-950/50">
                      <SelectValue placeholder="Select a workspace" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeMemberships.map((membership) => (
                        <SelectItem key={membership.id} value={membership.organization.id}>
                          {membership.organization.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : isOrganizationStatePending ? (
                  <div className="mt-2 rounded-2xl border border-dashed border-neutral-300 px-4 py-3 text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-300">
                    Loading workspace memberships...
                  </div>
                ) : (
                  <div className="mt-2 rounded-2xl border border-dashed border-neutral-300 px-4 py-3 text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-300">
                    No active workspace yet. Create one in setup or accept an invite first.
                  </div>
                )}
              </div>

              {pendingMemberships.length > 0 ? (
                <div className="rounded-2xl border border-primary-200 bg-primary-500/10 px-4 py-3 text-sm text-neutral-800 dark:border-primary-800 dark:text-neutral-200">
                  <p className="font-medium">Pending memberships ready</p>
                  <p className="mt-1 text-xs text-neutral-700 dark:text-neutral-300">
                    Accept or decline them from settings when those controls land.
                  </p>
                </div>
              ) : null}
            </div>
          </header>

          <main className="min-h-[70vh] rounded-[2rem]">
            {activeMemberships.length === 0 && !isOrganizationStatePending ? (
              <div className="glass-panel rise-in mb-4 rounded-[2rem] border-0 px-5 py-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-primary-600">
                      Workspace required
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-neutral-900 dark:text-neutral-50">
                      Finish setup to unlock the app shell
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm text-neutral-700 dark:text-neutral-300">
                      You&apos;re signed in, but there isn&apos;t an active organization in this
                      session yet. Create a workspace or accept an invite to continue.
                    </p>
                  </div>
                  <Button asChild>
                    <Link href="/setup">Open setup</Link>
                  </Button>
                </div>
              </div>
            ) : null}

            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
