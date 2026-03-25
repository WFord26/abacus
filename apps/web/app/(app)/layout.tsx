import { AppShell } from "../../src/components/app-shell";
import { AuthGuard } from "../../src/components/auth-guard";

export default function AuthenticatedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
