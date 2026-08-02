import Link from "next/link";
import { AndroidDownloadCard } from "@/components/AndroidDownloadCard";
import { LandingThemeToggle } from "@/components/LandingThemeToggle";

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--omlu-page-background)] text-[var(--omlu-text-primary)]">
      <header className="mx-auto flex w-full max-w-6xl justify-end px-5 pt-5 sm:px-8"><LandingThemeToggle /></header>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-5 py-12 sm:px-8 sm:py-16">
        <section className="max-w-2xl py-8 sm:py-14">
          <p className="mb-3 text-sm font-black uppercase tracking-widest text-orange-700">
            OMLU
          </p>
          <h1 className="text-4xl font-black tracking-tight text-[var(--omlu-text-primary)] sm:text-5xl">
            OMLU
          </h1>
          <p className="mt-5 text-lg leading-8 text-[var(--omlu-text-secondary)]">
            Restaurant ordering, table service, kitchen, billing, and staff
            management in one system.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-lg bg-[var(--omlu-primary-action)] px-6 text-sm font-bold text-[var(--omlu-primary-action-text)] transition hover:brightness-95"
            >
              Restaurant Login
            </Link>
            <Link
              href="/register"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-6 text-sm font-bold text-[var(--omlu-text-primary)] transition hover:bg-[var(--omlu-hover-background)]"
            >
              Create Restaurant
            </Link>
          </div>

          <p className="mt-8 max-w-lg text-sm leading-6 text-[var(--omlu-text-secondary)]">
            Customers should scan the QR code placed on their table to view the
            menu and order.
          </p>
        </section>

        <section aria-labelledby="features-title">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-700">One connected workspace</p>
          <h2 id="features-title" className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Built for every part of restaurant service</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {["Tables and QR ordering", "Kitchen activity", "Staff operations", "Billing and status"].map((feature) => <div key={feature} className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-5 text-sm font-bold shadow-sm">{feature}</div>)}
          </div>
        </section>

        <AndroidDownloadCard variant="landing" />

        <section className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-7 text-center sm:p-9" aria-labelledby="final-cta-title">
          <h2 id="final-cta-title" className="text-2xl font-black">Ready to run service with OMLU?</h2>
          <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row"><Link href="/login" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-[var(--omlu-primary-action)] px-6 text-sm font-bold text-[var(--omlu-primary-action-text)] hover:brightness-95">Restaurant Login</Link><Link href="/register" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-[var(--omlu-border-strong)] px-6 text-sm font-bold hover:bg-[var(--omlu-hover-background)]">Create Restaurant</Link></div>
        </section>
      </main>
      <footer className="border-t border-[var(--omlu-border)] px-6 py-7 text-center text-xs font-semibold text-[var(--omlu-text-secondary)]">OMLU · Restaurant ordering and operations</footer>
    </div>
  );
}
