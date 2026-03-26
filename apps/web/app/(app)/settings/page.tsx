import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@wford26/ui";
import Link from "next/link";

export default function SettingsPage() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.25fr_0.95fr]">
      <Card className="glass-panel panel-grid rise-in overflow-hidden border-0">
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.26em] text-primary-600">Workspace</p>
          <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">Settings</CardTitle>
          <CardDescription className="max-w-2xl text-base text-neutral-700 dark:text-neutral-300">
            Tune the core bookkeeping structure for the active organization. Accounts are now live,
            and category management can plug into the same frame next.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Card className="rounded-3xl border border-neutral-200/70 bg-white/85 shadow-sm">
            <CardHeader>
              <p className="text-xs uppercase tracking-[0.22em] text-neutral-600">Ledger</p>
              <CardTitle className="text-xl">Accounts</CardTitle>
              <CardDescription>
                Add, edit, and remove chart-of-accounts entries with live balance badges.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/settings/accounts">Open accounts</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-dashed border-neutral-300 bg-white/70 shadow-sm">
            <CardHeader>
              <p className="text-xs uppercase tracking-[0.22em] text-neutral-600">Ledger</p>
              <CardTitle className="text-xl">Categories</CardTitle>
              <CardDescription>
                Nested category management is the next settings slice to land here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button disabled variant="outline">
                Categories next
              </Button>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      <Card className="glass-panel rise-in border-0">
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.22em] text-neutral-600 dark:text-neutral-400">
            Status
          </p>
          <CardTitle className="text-xl text-neutral-900 dark:text-neutral-50">
            Settings surface is live
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
          <p>
            The authenticated shell now has a real ledger settings foothold instead of a pure
            placeholder.
          </p>
          <p>
            Accounts are the first writable settings view, and the surrounding layout is ready for
            categories and organization controls to follow.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
