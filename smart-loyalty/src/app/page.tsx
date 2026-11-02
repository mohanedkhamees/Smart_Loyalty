export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-sm font-semibold text-white"
            >
              SL
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight text-foreground">
                Smart Loyalty
              </p>
              <p className="text-xs text-muted">Phase 1A foundation</p>
            </div>
          </div>
          <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">
            Docs-ready
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-16">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.14em] text-accent">
          Digital stamp cards
        </p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          Smart Loyalty
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
          Multi-tenant SaaS foundation for independent stamp card programs.
          Business dashboards, staff tools, and customer join flows come in
          later phases.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          <ShellCard
            title="Documentation"
            body="Phase 0 specs live in /docs at the repository root."
          />
          <ShellCard
            title="Application"
            body="This Next.js app will host marketing, auth, dashboard, and staff surfaces."
          />
          <ShellCard
            title="Next up"
            body="Phase 1B adds Prisma, Supabase Auth, and tenant isolation — not started yet."
          />
        </div>
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex w-full max-w-5xl px-6 py-4 text-xs text-muted">
          Smart Loyalty · Repository foundation only · No auth or database yet
        </div>
      </footer>
    </div>
  );
}

function ShellCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
