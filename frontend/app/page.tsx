import Image from "next/image";
import Link from "next/link";
import { AndroidDownloadCard } from "@/components/AndroidDownloadCard";
import { LandingHeader } from "@/components/LandingHeader";
import { LandingThemeToggle } from "@/components/LandingThemeToggle";
import { LandingDemoForm } from "@/components/LandingDemoForm";

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[var(--omlu-page-background)] text-[var(--omlu-text-primary)]">
      <LandingHeader productHref="#product" themeToggle={<LandingThemeToggle />} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-5 py-10 sm:px-8 sm:py-14">
        <section className="grid items-center gap-10 py-8 sm:py-14 lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)] lg:gap-12">
          <div className="min-w-0 max-w-2xl">
            <p className="mb-3 text-sm font-black uppercase tracking-widest text-orange-700">
              Restaurant operations
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
          </div>

          <div className="flex min-w-0 justify-center lg:justify-end">
            <Image
              src="/images/omlu-landing.png"
              alt="OMLU restaurant ordering and operations"
              width={1536}
              height={1024}
              priority
              sizes="(min-width: 1024px) 55vw, 100vw"
              className="h-auto w-full max-w-[720px] object-contain"
            />
          </div>
        </section>

        <section id="product" className="scroll-mt-24" aria-labelledby="features-title">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-700">One connected workspace</p>
          <h2 id="features-title" className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Built for every part of restaurant service</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {["Tables and QR ordering", "Kitchen activity", "Staff operations", "Billing and status"].map((feature) => <div key={feature} className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-5 text-sm font-bold shadow-sm">{feature}</div>)}
          </div>
        </section>

        <section id="pricing" className="scroll-mt-24 rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-6 py-10 text-center sm:px-10 sm:py-14" aria-labelledby="landing-pricing-title">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Pricing</p>
          <h2 id="landing-pricing-title" className="mx-auto mt-3 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">Plans that fit the way you operate.</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[var(--omlu-text-secondary)] sm:text-base">Whether you&apos;re running one restaurant or growing across multiple outlets, OMLU keeps ordering, kitchen, staff and billing connected.</p>
          <Link href="/pricing" className="mt-7 inline-flex min-h-12 items-center justify-center rounded-lg bg-[var(--omlu-primary-action)] px-6 text-sm font-bold text-[var(--omlu-primary-action-text)] transition hover:brightness-95">View Pricing</Link>
          <p className="mt-4 text-xs font-semibold text-[var(--omlu-text-muted)]">Assisted setup and onboarding available.</p>
        </section>

        <LandingDemoForm />

        <AndroidDownloadCard variant="landing" />

        <section className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-7 text-center sm:p-9" aria-labelledby="final-cta-title">
          <h2 id="final-cta-title" className="text-2xl font-black">Ready to run service with OMLU?</h2>
          <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row"><Link href="/login" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-[var(--omlu-primary-action)] px-6 text-sm font-bold text-[var(--omlu-primary-action-text)] hover:brightness-95">Restaurant Login</Link><Link href="/register" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-[var(--omlu-border-strong)] px-6 text-sm font-bold hover:bg-[var(--omlu-hover-background)]">Create Restaurant</Link></div>
        </section>
      </main>
      <footer className="border-t border-[var(--omlu-border)] px-6 py-7 text-center text-xs font-semibold text-[var(--omlu-text-secondary)]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <span>OMLU · Restaurant ordering and operations</span>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/faq" className="hover:text-orange-600 underline">FAQ</Link>
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
