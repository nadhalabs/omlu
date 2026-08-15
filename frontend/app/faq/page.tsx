import type { Metadata } from "next";
import Link from "next/link";
import { LandingThemeToggle } from "@/components/LandingThemeToggle";
import { FAQ_ITEMS } from "./faqContent";

const description =
  "Answers to common questions about OMLU restaurant software, QR ordering, kitchen display, staff operations and billing.";

export const metadata: Metadata = {
  title: "FAQ | OMLU",
  description,
  alternates: { canonical: "https://omlu.in/faq" },
  openGraph: {
    title: "FAQ | OMLU",
    description,
    type: "website",
    url: "https://omlu.in/faq",
  },
};

export default function FaqPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--omlu-page-background)] text-[var(--omlu-text-primary)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />

      <header className="border-b border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-4 py-3 sm:px-8">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
          <Link href="/" className="text-lg font-black tracking-tight" aria-label="OMLU Home">
            <span className="text-orange-600" aria-hidden="true">●</span> OMLU
          </Link>
          <nav aria-label="Public navigation" className="flex items-center gap-2 sm:gap-4">
            <Link href="/login" className="hidden text-sm font-bold text-[var(--omlu-text-secondary)] hover:text-[var(--omlu-text-primary)] sm:inline-flex">
              Sign In
            </Link>
            <Link href="/register" className="inline-flex min-h-11 items-center rounded-xl bg-[var(--omlu-primary-action)] px-4 text-sm font-black text-[var(--omlu-primary-action-text)] hover:brightness-95">
              Create Restaurant
            </Link>
            <LandingThemeToggle />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-8 sm:py-16">
        <section className="max-w-3xl" aria-labelledby="faq-title">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-700 dark:text-orange-400">FAQ</p>
          <h1 id="faq-title" className="mt-3 text-balance text-4xl font-black tracking-tight sm:text-5xl">
            Questions about OMLU?
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--omlu-text-secondary)] sm:text-lg">
            Everything you need to know about ordering, kitchen operations, staff workflows and billing with OMLU.
          </p>
          <p className="mt-3 text-sm font-bold text-[var(--omlu-text-primary)]">
            A simpler way to run your restaurant every day.
          </p>
        </section>

        <section aria-label="Frequently asked questions" className="mt-10 grid gap-3 sm:mt-14">
          {FAQ_ITEMS.map((item, index) => (
            <details
              key={item.question}
              open={index === 0}
              className="group rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] shadow-sm"
            >
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left font-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--omlu-focus-ring)] sm:px-6 [&::-webkit-details-marker]:hidden">
                <span>{item.question}</span>
                <span aria-hidden="true" className="shrink-0 text-xl text-orange-600 group-open:rotate-45">+</span>
              </summary>
              <p className="max-w-3xl px-5 pb-5 text-sm leading-7 text-[var(--omlu-text-secondary)] sm:px-6 sm:pb-6 sm:text-base">
                {item.answer}
              </p>
            </details>
          ))}
        </section>

        <section className="mt-12 rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 sm:flex sm:items-center sm:justify-between sm:gap-8 sm:p-8" aria-labelledby="faq-start-title">
          <div>
            <h2 id="faq-start-title" className="text-xl font-black sm:text-2xl">Ready to set up your restaurant?</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--omlu-text-secondary)]">Create your restaurant account and continue through OMLU’s guided setup.</p>
          </div>
          <Link href="/register" className="mt-5 inline-flex min-h-12 w-full shrink-0 items-center justify-center rounded-xl bg-[var(--omlu-primary-action)] px-6 text-sm font-black text-[var(--omlu-primary-action-text)] hover:brightness-95 sm:mt-0 sm:w-auto">
            Create Restaurant
          </Link>
        </section>
      </main>

      <footer className="border-t border-[var(--omlu-border)] px-4 py-7 text-sm text-[var(--omlu-text-secondary)] sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row">
          <span>OMLU · Built by Nadha Labs</span>
          <div className="flex items-center gap-4 font-semibold">
            <Link href="/" className="hover:text-orange-600">Home</Link>
            <Link href="/privacy" className="hover:text-orange-600">Privacy</Link>
            <Link href="/terms" className="hover:text-orange-600">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
