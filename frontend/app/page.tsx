import Link from "next/link";
import { AndroidDownloadCard } from "@/components/AndroidDownloadCard";
import { LandingThemeToggle } from "@/components/LandingThemeToggle";

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--omlu-page-background)] text-[var(--omlu-text-primary)]">
      {/* Header */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 pt-6 sm:px-8">
        <span className="text-xl font-black tracking-tight text-orange-600">OMLU</span>
        <LandingThemeToggle />
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-5 py-12 sm:px-8 sm:py-16">
        {/* Hero Section */}
        <section className="max-w-3xl py-4 sm:py-8">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.25em] text-orange-600">
            OMLU
          </p>
          <h1 className="text-4xl font-black tracking-tight text-[var(--omlu-text-primary)] sm:text-6xl">
            From table to kitchen to payment.
          </h1>
          <p className="mt-6 text-lg leading-8 text-[var(--omlu-text-secondary)] sm:text-xl sm:leading-9">
            OMLU connects QR ordering, live kitchen activity, staff operations, billing, and restaurant management in one connected system.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--omlu-primary-action)] px-7 text-sm font-black text-[var(--omlu-primary-action-text)] shadow-sm transition hover:brightness-95 active:scale-[0.98]"
            >
              Restaurant Login
            </Link>
            <Link
              href="/register"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-7 text-sm font-black text-[var(--omlu-text-primary)] transition hover:bg-[var(--omlu-hover-background)] active:scale-[0.98]"
            >
              Create Restaurant
            </Link>
          </div>

          <div className="mt-8 inline-flex items-center gap-3 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-4 py-3 text-xs font-semibold text-[var(--omlu-text-secondary)] shadow-sm">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            No customer app required. Guests simply scan the QR code on their table, browse the menu, and place their order.
          </div>
        </section>

        {/* Feature Grid Section */}
        <section aria-labelledby="connected-system-title">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">
            ONE CONNECTED RESTAURANT SYSTEM
          </p>
          <h2 id="connected-system-title" className="mt-2 text-3xl font-black tracking-tight text-[var(--omlu-text-primary)] sm:text-4xl">
            Everything happening in your restaurant. Connected.
          </h2>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 shadow-sm">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h3 className="text-lg font-black text-[var(--omlu-text-primary)]">QR Ordering</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--omlu-text-secondary)]">
                Customers scan their table QR, browse your live menu, and order directly from their phone.
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 shadow-sm">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8" />
                </svg>
              </div>
              <h3 className="text-lg font-black text-[var(--omlu-text-primary)]">Tables</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--omlu-text-secondary)]">
                See which tables are available, ordering, active, waiting for a bill, or completed.
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 shadow-sm">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-black text-[var(--omlu-text-primary)]">Kitchen</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--omlu-text-secondary)]">
                Orders move directly to your kitchen so your team can prepare and track them in real time.
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 shadow-sm">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-black text-[var(--omlu-text-primary)]">Staff Operations</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--omlu-text-secondary)]">
                Give your team the access they need while owners and managers stay in control.
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 shadow-sm sm:col-span-2 lg:col-span-2">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-black text-[var(--omlu-text-primary)]">Billing</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--omlu-text-secondary)]">
                Review orders, issue bills, print receipts, record payments, and complete the table from the same workflow.
              </p>
            </div>
          </div>
        </section>

        {/* Service Flow Section */}
        <section aria-labelledby="service-flow-title" className="rounded-3xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 sm:p-10 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">
            BUILT FOR REAL RESTAURANT SERVICE
          </p>
          <h2 id="service-flow-title" className="mt-2 text-3xl font-black tracking-tight text-[var(--omlu-text-primary)] sm:text-4xl">
            One order. One connected journey.
          </h2>

          <div className="mt-8 flex flex-wrap items-center gap-2 font-black text-sm text-[var(--omlu-text-primary)] sm:text-base">
            <span className="rounded-lg bg-[var(--omlu-elevated-surface)] border border-[var(--omlu-border)] px-3 py-2 shadow-xs">Scan QR</span>
            <span className="text-orange-500">→</span>
            <span className="rounded-lg bg-[var(--omlu-elevated-surface)] border border-[var(--omlu-border)] px-3 py-2 shadow-xs">Place Order</span>
            <span className="text-orange-500">→</span>
            <span className="rounded-lg bg-[var(--omlu-elevated-surface)] border border-[var(--omlu-border)] px-3 py-2 shadow-xs">Kitchen</span>
            <span className="text-orange-500">→</span>
            <span className="rounded-lg bg-[var(--omlu-elevated-surface)] border border-[var(--omlu-border)] px-3 py-2 shadow-xs">Serve</span>
            <span className="text-orange-500">→</span>
            <span className="rounded-lg bg-[var(--omlu-elevated-surface)] border border-[var(--omlu-border)] px-3 py-2 shadow-xs">Request Bill</span>
            <span className="text-orange-500">→</span>
            <span className="rounded-lg bg-[var(--omlu-elevated-surface)] border border-[var(--omlu-border)] px-3 py-2 shadow-xs">Payment</span>
            <span className="text-orange-500">→</span>
            <span className="rounded-lg bg-orange-600 text-white px-3 py-2 shadow-xs">Table Ready</span>
          </div>

          <p className="mt-6 text-sm leading-7 text-[var(--omlu-text-secondary)] sm:text-base">
            OMLU keeps the entire service flow connected from the moment a customer sits down until the table is ready for the next guest.
          </p>
        </section>

        {/* Android Download Section */}
        <AndroidDownloadCard variant="landing" />

        {/* Final CTA Section */}
        <section className="rounded-3xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-8 text-center sm:p-12 shadow-sm" aria-labelledby="final-cta-title">
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
              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-[var(--omlu-primary-action)] px-7 text-sm font-black text-[var(--omlu-primary-action-text)] hover:brightness-95 active:scale-[0.98]"
            >
              Create Restaurant
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[var(--omlu-border-strong)] px-7 text-sm font-black hover:bg-[var(--omlu-hover-background)] active:scale-[0.98]"
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
