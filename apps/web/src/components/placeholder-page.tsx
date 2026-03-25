import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@wford26/ui";

export function PlaceholderPage({
  description,
  eyebrow,
  title,
}: Readonly<{
  description: string;
  eyebrow: string;
  title: string;
}>) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
      <Card className="glass-panel border-0">
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.26em] text-primary-600">{eyebrow}</p>
          <CardTitle className="text-3xl text-neutral-900 dark:text-neutral-50">{title}</CardTitle>
          <CardDescription className="max-w-2xl text-base text-neutral-600 dark:text-neutral-300">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {["Service wiring", "Auth-aware navigation", "Typed client plumbing"].map(
            (label, index) => (
              <div
                key={label}
                className="rounded-3xl border border-neutral-200/70 bg-white/70 p-4 dark:border-neutral-700 dark:bg-neutral-900/55"
              >
                <p className="text-xs uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
                  Block {index + 1}
                </p>
                <p className="mt-2 text-lg font-semibold text-neutral-900 dark:text-neutral-50">
                  {label}
                </p>
              </div>
            )
          )}
        </CardContent>
      </Card>

      <Card className="glass-panel border-0">
        <CardHeader>
          <p className="text-xs uppercase tracking-[0.22em] text-neutral-500 dark:text-neutral-400">
            Next up
          </p>
          <CardTitle className="text-xl text-neutral-900 dark:text-neutral-50">
            Wire live service flows
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-neutral-600 dark:text-neutral-300">
          <p>
            The UI shell is ready for identity routes, dashboard queries, and gateway-backed data
            loading.
          </p>
          <p>
            As the services come online, these sections can switch from placeholders to real
            workspace views without reworking the layout foundation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
