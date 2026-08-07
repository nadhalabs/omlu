import Link from "next/link";
import { AndroidDownloadCard } from "@/components/AndroidDownloadCard";
import { LandingThemeToggle } from "@/components/LandingThemeToggle";
import { ConnectedOperations } from "@/components/ConnectedOperations";
import { ConnectedWorkflow } from "@/components/ConnectedWorkflow";

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--omlu-page-background)] text-[var(--omlu-text-primary)]">
      {/* Header */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-6 sm:px-8">
        <span className="text-xl font-black tracking-tight text-orange-600">OMLU</span>
        <LandingThemeToggle />
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-5 py-12 sm:px-8 sm:py-16">
        {/* Hero Section & Connected Operations Module System */}
        <section className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div className="max-w-2xl py-4 sm:py-6">
            <p className="omlu-animate-hero-1 mb-3 text-xs font-black uppercase tracking-[0.25em] text-orange-600">
              OMLU
            </p>
            <h1 className="omlu-animate-hero-2 text-4xl font-black tracking-tight text-[var(--omlu-text-primary)] sm:text-6xl sm:leading-[1.1]">
              From table to kitchen to payment.
            </h1>
            <p className="omlu-animate-hero-3 mt-6 text-lg leading-8 text-[var(--omlu-text-secondary)] sm:text-xl sm:leading-9">
              OMLU connects QR ordering, live kitchen activity, staff operations, billing, and restaurant management in one connected system.
            </p>

            <div className="omlu-animate-hero-4 mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--omlu-primary-action)] px-7 text-sm font-black text-[var(--omlu-primary-action-text)] shadow-sm transition hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                Restaurant Login
              </Link>
              <Link
                href="/register"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-7 text-sm font-black text-[var(--omlu-text-primary)] transition hover:bg-[var(--omlu-hover-background)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                Create Restaurant
              </Link>
            </div>

            <div className="omlu-animate-hero-5 mt-8 inline-flex items-center gap-3 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-4 py-3 text-xs font-semibold text-[var(--omlu-text-secondary)] shadow-xs">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              No customer app required. Guests simply scan the QR code on their table, browse the menu, and place their order.
            </div>
          </div>

          {/* Connected Restaurant Operations System */}
          <div className="w-full">
            <ConnectedOperations />
          </div>
        </section>

        {/* Feature Grid Section with production-safe capability labels */}
        <section aria-labelledby="connected-system-title">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">
            ONE CONNECTED RESTAURANT SYSTEM
          </p>
          <h2 id="connected-system-title" className="mt-2 text-3xl font-black tracking-tight text-[var(--omlu-text-primary)] sm:text-4xl">
            Everything happening in your restaurant. Connected.
          </h2>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {/* QR Ordering */}
            <div className="group rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-orange-500/30 hover:shadow-xl">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 transition-transform duration-300 group-hover:scale-110">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h3 className="text-lg font-black text-[var(--omlu-text-primary)]">QR Ordering</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--omlu-text-secondary)]">
                Customers scan their table QR, browse your live menu, and order directly from their phone.
              </p>
              <div className="mt-4 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-3 text-xs font-bold text-[var(--omlu-text-secondary)]">
                <div className="flex items-center justify-between">
                  <span>Guest Web Access</span>
                  <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black text-emerald-600">Scan & Order</span>
                </div>
              </div>
            </div>

            {/* Tables */}
            <div className="group rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-orange-500/30 hover:shadow-xl">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 transition-transform duration-300 group-hover:scale-110">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8" />
                </svg>
              </div>
              <h3 className="text-lg font-black text-[var(--omlu-text-primary)]">Tables</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--omlu-text-secondary)]">
                See which tables are available, ordering, active, waiting for a bill, or completed.
              </p>
              <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-3 text-xs font-bold">
                <span className="text-[var(--omlu-text-primary)]">Table Management</span>
                <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] font-black text-orange-600">Lifecycle View</span>
              </div>
            </div>

            {/* Kitchen */}
            <div className="group rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-orange-500/30 hover:shadow-xl">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 transition-transform duration-300 group-hover:scale-110">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-black text-[var(--omlu-text-primary)]">Kitchen</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--omlu-text-secondary)]">
                Orders move directly to your kitchen so your team can prepare and track them in real time.
              </p>
              <div className="mt-4 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-3 text-xs font-bold text-[var(--omlu-text-primary)]">
                <div className="flex items-center justify-between">
                  <span>Kitchen Display System</span>
                  <span className="text-orange-600 font-black">Direct Dispatch</span>
                </div>
              </div>
            </div>

            {/* Staff Operations */}
            <div className="group rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-orange-500/30 hover:shadow-xl">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 transition-transform duration-300 group-hover:scale-110">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-black text-[var(--omlu-text-primary)]">Staff Operations</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--omlu-text-secondary)]">
                Give your team the access they need while owners and managers stay in control.
              </p>
              <div className="mt-4 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-3 text-xs font-bold text-[var(--omlu-text-secondary)]">
                <span>Role-Based Operational Views</span>
              </div>
            </div>

            {/* Billing */}
            <div className="group rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 shadow-sm sm:col-span-2 lg:col-span-2 transition-all duration-300 hover:-translate-y-1 hover:border-orange-500/30 hover:shadow-xl">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 transition-transform duration-300 group-hover:scale-110">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-black text-[var(--omlu-text-primary)]">Billing</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--omlu-text-secondary)]">
                Review orders, issue bills, print receipts, record payments, and complete the table from the same workflow.
              </p>
              <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-3 text-xs font-bold">
                <span className="text-[var(--omlu-text-primary)]">Orders & Receipts</span>
                <span className="text-emerald-600 font-black">Payment Completion</span>
              </div>
            </div>
          </div>
        </section>

        {/* Connected Journey Section */}
        <ConnectedWorkflow />

        {/* Android Download Section */}
        <AndroidDownloadCard variant="landing" />

        {/* Final CTA Section */}
        <section className="rounded-3xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-8 text-center sm:p-12 shadow-sm transition-all duration-300 hover:shadow-xl" aria-labelledby="final-cta-title">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">
            OMLU RESTAURANT OPERATIONS
          </p>
          <h2 id="final-cta-title" className="mt-2 text-3xl font-black tracking-tight text-[var(--omlu-text-primary)] sm:text-4xl">
            Ready to run your restaurant with OMLU?
          </h2>
          <p className="mt-3 text-base text-[var(--omlu-text-secondary)]">
            Bring your tables, orders, kitchen, staff, and billing into one connected workspace.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--omlu-primary-action)] px-7 text-sm font-black text-[var(--omlu-primary-action-text)] hover:brightness-95 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              Create Restaurant
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--omlu-border-strong)] px-7 text-sm font-black hover:bg-[var(--omlu-hover-background)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              Restaurant Login
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--omlu-border)] px-6 py-8 text-center text-xs font-semibold text-[var(--omlu-text-secondary)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <span>OMLU · Restaurant operations, connected.</span>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/terms" className="hover:text-orange-600 underline">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-orange-600 underline">Privacy Policy</Link>
            <Link href="/refunds" className="hover:text-orange-600 underline">Refund Policy</Link>
            <Link href="/acceptable-use" className="hover:text-orange-600 underline">Acceptable Use</Link>
            <Link href="/service-policy" className="hover:text-orange-600 underline">Service Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
