import Image from "next/image";
import Link from "next/link";
import { LandingHeader } from "@/components/LandingHeader";
import { LandingThemeToggle } from "@/components/LandingThemeToggle";
import { PublicFooter } from "@/components/PublicFooter";

const products = [
  { name: "OMLU for Restaurants", description: "Restaurant ordering, table operations, kitchen, billing, staff and reporting in one connected workspace.", href: "/restaurants", cta: "Explore Restaurants", features: ["Table & QR ordering", "Kitchen & billing", "Staff & reporting"] },
  { name: "OMLU for Cinemas", description: "Seat-based concession ordering, screens and seats, concession KDS, customer tracking and cinema operations.", href: "/cinemas", cta: "Explore Cinemas", features: ["Seat-based ordering", "Concession KDS", "Screens & customer tracking"] },
];

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[var(--omlu-page-background)] text-[var(--omlu-text-primary)]">
      <LandingHeader themeToggle={<LandingThemeToggle />} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-5 py-10 sm:px-8 sm:py-14">
        <section className="grid items-center gap-10 py-8 sm:py-14 lg:grid-cols-[minmax(0,9fr)_minmax(0,11fr)] lg:gap-12">
          <div className="min-w-0 max-w-2xl">
            <p className="mb-3 text-sm font-black uppercase tracking-widest text-orange-700">One operations platform</p>
            <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Run every part of your venue with OMLU.</h1>
            <p className="mt-5 text-lg leading-8 text-[var(--omlu-text-secondary)]">Connected ordering, service, staff and reporting workflows built for the way restaurants and cinemas operate.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/get-started" className="inline-flex h-12 items-center justify-center rounded-lg bg-[var(--omlu-primary-action)] px-6 text-sm font-bold text-[var(--omlu-primary-action-text)] hover:brightness-95">Get Started</Link><Link href="/login" className="inline-flex h-12 items-center justify-center rounded-lg border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-6 text-sm font-bold hover:bg-[var(--omlu-hover-background)]">Sign In</Link></div>
          </div>
          <div className="flex min-w-0 justify-center lg:justify-end"><Image src="/images/omlu-landing.png" alt="OMLU connected venue operations" width={1536} height={1024} priority sizes="(min-width: 1024px) 55vw, 100vw" className="h-auto w-full max-w-[720px] object-contain" /></div>
        </section>

        <section id="product" className="scroll-mt-24" aria-labelledby="product-title">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-700">Choose your product</p>
          <h2 id="product-title" className="mt-2 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">One platform, shaped around your operation.</h2>
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {products.map((product) => <article key={product.name} className="flex flex-col rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 shadow-sm sm:p-8"><h3 className="text-2xl font-black tracking-tight">{product.name}</h3><p className="mt-3 leading-7 text-[var(--omlu-text-secondary)]">{product.description}</p><ul className="mt-6 grid gap-3 text-sm font-bold sm:grid-cols-3">{product.features.map((feature) => <li key={feature} className="rounded-lg bg-[var(--omlu-muted-surface)] px-3 py-3">{feature}</li>)}</ul><Link href={product.href} className="mt-7 inline-flex min-h-12 w-fit items-center justify-center rounded-lg bg-[var(--omlu-primary-action)] px-5 text-sm font-bold text-[var(--omlu-primary-action-text)] hover:brightness-95">{product.cta}<span aria-hidden="true" className="ml-2">→</span></Link></article>)}
          </div>
        </section>

        <section id="pricing" className="scroll-mt-24 rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-6 py-10 text-center sm:px-10 sm:py-14" aria-labelledby="landing-pricing-title">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Pricing</p><h2 id="landing-pricing-title" className="mx-auto mt-3 max-w-2xl text-3xl font-black tracking-tight">Plans that fit the way your venue operates.</h2><p className="mx-auto mt-4 max-w-2xl leading-7 text-[var(--omlu-text-secondary)]">Start with the product built for your team, with assisted setup available when you need it.</p><Link href="/pricing" className="mt-7 inline-flex min-h-12 items-center justify-center rounded-lg border border-[var(--omlu-border-strong)] px-6 text-sm font-bold hover:bg-[var(--omlu-hover-background)]">View Pricing</Link>
        </section>

        <section className="rounded-2xl bg-zinc-950 p-7 text-center text-white sm:p-10" aria-labelledby="final-cta-title"><h2 id="final-cta-title" className="text-2xl font-black">Bring your venue operations together.</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-300">Choose your venue type and create the OMLU workspace that fits your team.</p><div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><Link href="/get-started" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-orange-600 px-6 text-sm font-bold text-white hover:bg-orange-700">Get Started</Link><Link href="/login" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-zinc-700 px-6 text-sm font-bold hover:bg-zinc-900">Sign In</Link></div></section>
      </main>
      <PublicFooter />
    </div>
  );
}
