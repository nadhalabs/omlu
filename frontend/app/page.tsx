import Link from "next/link";
import { AndroidDownloadCard } from "@/components/AndroidDownloadCard";
import { LandingThemeToggle } from "@/components/LandingThemeToggle";
import { ConnectedOperations } from "@/components/ConnectedOperations";
import { ConnectedWorkflow } from "@/components/ConnectedWorkflow";

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--omlu-page-background)] text-[var(--omlu-text-primary)]">
      {/* Navigation Header */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6 sm:px-8">
        <Link href="/" className="text-xl font-black tracking-tight text-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded-md">
          OMLU
        </Link>
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/login"
            className="text-xs font-bold text-[var(--omlu-text-secondary)] transition hover:text-[var(--omlu-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded-md px-2 py-1"
          >
            Restaurant Login
          </Link>
          <Link
            href="/register"
            className="inline-flex min-h-9 items-center justify-center rounded-lg bg-[var(--omlu-primary-action)] px-4 text-xs font-bold text-[var(--omlu-primary-action-text)] shadow-xs transition hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            Create Restaurant
          </Link>
          <LandingThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-24 px-6 py-8 sm:px-8 sm:py-16">
        {/* Hero Section */}
        <section className="mx-auto flex max-w-3xl flex-col items-center text-center py-6 sm:py-12">
          <p className="omlu-animate-hero-1 text-xs font-bold uppercase tracking-[0.2em] text-orange-600">
            Restaurant Operations Platform
          </p>
          
          <h1 className="omlu-animate-hero-2 mt-4 text-4xl font-black tracking-tight text-[var(--omlu-text-primary)] sm:text-6xl sm:leading-[1.12]">
            From table to kitchen to payment.
          </h1>

          <p className="omlu-animate-hero-3 mt-6 max-w-2xl text-base leading-7 text-[var(--omlu-text-secondary)] sm:text-lg sm:leading-8">
            OMLU connects QR ordering, live kitchen activity, staff operations, billing, and restaurant management in one connected system.
          </p>

          <div className="omlu-animate-hero-4 mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/register"
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--omlu-primary-action)] px-7 text-sm font-bold text-[var(--omlu-primary-action-text)] shadow-xs transition hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              Create Restaurant
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--omlu-border-strong)] bg-transparent px-7 text-sm font-bold text-[var(--omlu-text-primary)] transition hover:bg-[var(--omlu-hover-background)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              Restaurant Login
            </Link>
          </div>

          <div className="omlu-animate-hero-5 mt-8 inline-flex items-center gap-2.5 rounded-lg border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-3.5 py-2 text-xs font-medium text-[var(--omlu-text-secondary)]">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
            <span>No customer app required. Guests scan table QR, browse menu, and order directly.</span>
          </div>
        </section>

        {/* Connected Operations Module Overview */}
        <section aria-label="Connected Operations System">
          <ConnectedOperations />
        </section>

        {/* Core Feature Capabilities Grid */}
        <section aria-labelledby="connected-system-title">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">
              ONE CONNECTED RESTAURANT SYSTEM
            </p>
            <h2 id="connected-system-title" className="mt-2 text-2xl font-black tracking-tight text-[var(--omlu-text-primary)] sm:text-3xl">
              Everything happening in your restaurant. Connected.
            </h2>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {/* QR Ordering */}
            <div className="group rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 transition-all duration-200 hover:border-[var(--omlu-border-strong)]">
              <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h3 className="text-base font-black text-[var(--omlu-text-primary)]">QR Ordering</h3>
              <p className="mt-2 text-xs leading-5 text-[var(--omlu-text-secondary)]">
                Customers scan their table QR, browse your live menu, and order directly from their phone.
              </p>
            </div>

            {/* Tables */}
            <div className="group rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 transition-all duration-200 hover:border-[var(--omlu-border-strong)]">
              <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8" />
                </svg>
              </div>
              <h3 className="text-base font-black text-[var(--omlu-text-primary)]">Tables</h3>
              <p className="mt-2 text-xs leading-5 text-[var(--omlu-text-secondary)]">
                See which tables are available, ordering, active, waiting for a bill, or completed.
              </p>
            </div>

            {/* Kitchen */}
            <div className="group rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 transition-all duration-200 hover:border-[var(--omlu-border-strong)]">
              <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-base font-black text-[var(--omlu-text-primary)]">Kitchen</h3>
              <p className="mt-2 text-xs leading-5 text-[var(--omlu-text-secondary)]">
                Orders move directly to your kitchen so your team can prepare and track them in real time.
              </p>
            </div>

            {/* Staff Operations */}
            <div className="group rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 transition-all duration-200 hover:border-[var(--omlu-border-strong)]">
              <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-base font-black text-[var(--omlu-text-primary)]">Staff Operations</h3>
              <p className="mt-2 text-xs leading-5 text-[var(--omlu-text-secondary)]">
                Give your team the access they need while owners and managers stay in control.
              </p>
            </div>

            {/* Billing */}
            <div className="group rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 sm:col-span-2 lg:col-span-2 transition-all duration-200 hover:border-[var(--omlu-border-strong)]">
              <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-base font-black text-[var(--omlu-text-primary)]">Billing</h3>
              <p className="mt-2 text-xs leading-5 text-[var(--omlu-text-secondary)]">
                Review orders, issue bills, print receipts, record payments, and complete the table from the same workflow.
              </p>
            </div>
          </div>
        </section>

        {/* Connected Journey Step-by-Step Workflow */}
        <ConnectedWorkflow />

        {/* Android Download Section */}
        <AndroidDownloadCard variant="landing" />

        {/* Final CTA Section */}
        <section className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-8 text-center sm:p-12" aria-labelledby="final-cta-title">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">
            OMLU RESTAURANT OPERATIONS
          </p>
          <h2 id="final-cta-title" className="mt-2 text-2xl font-black tracking-tight text-[var(--omlu-text-primary)] sm:text-3xl">
            Ready to run your restaurant with OMLU?
          </h2>
          <p className="mt-3 text-sm text-[var(--omlu-text-secondary)] max-w-xl mx-auto leading-6">
            Bring your tables, orders, kitchen, staff, and billing into one connected workspace.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--omlu-primary-action)] px-7 text-sm font-bold text-[var(--omlu-primary-action-text)] transition hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              Create Restaurant
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--omlu-border-strong)] bg-transparent px-7 text-sm font-bold text-[var(--omlu-text-primary)] transition hover:bg-[var(--omlu-hover-background)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              Restaurant Login
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--omlu-border)] px-6 py-8 text-center text-xs font-medium text-[var(--omlu-text-secondary)]">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
          <span>OMLU · Restaurant operations, connected.</span>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/faq"
              className="hover:text-orange-600 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded"
            >
              FAQ
            </Link>
            <Link href="/terms" className="hover:text-orange-600 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-orange-600 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded">Privacy Policy</Link>
            <Link href="/refunds" className="hover:text-orange-600 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded">Refund Policy</Link>
            <Link href="/acceptable-use" className="hover:text-orange-600 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded">Acceptable Use</Link>
            <Link href="/service-policy" className="hover:text-orange-600 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded">Service Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
