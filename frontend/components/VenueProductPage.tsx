import Link from "next/link";
import { LandingHeader } from "@/components/LandingHeader";
import { LandingThemeToggle } from "@/components/LandingThemeToggle";
import { PublicFooter } from "@/components/PublicFooter";

export type VenueProduct = {
  label: string;
  title: string;
  description: string;
  registrationHref: string;
  workflows: { title: string; description: string }[];
  audiences: string[];
  previewTitle: string;
  previewItems: { label: string; detail: string; status: string }[];
  pricingTitle: string;
  pricingDescription: string;
};

export function VenueProductPage({ product }: { product: VenueProduct }) {
  return (
    <div className="min-h-screen bg-[var(--omlu-page-background)] text-[var(--omlu-text-primary)]">
      <LandingHeader themeToggle={<LandingThemeToggle />} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-5 py-14 sm:px-8 sm:py-20">
        <section className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="text-sm font-black uppercase tracking-widest text-orange-700">{product.label}</p>
            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">{product.title}</h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[var(--omlu-text-secondary)]">{product.description}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Link href={product.registrationHref} className="inline-flex min-h-12 items-center justify-center rounded-lg bg-[var(--omlu-primary-action)] px-6 text-sm font-bold text-[var(--omlu-primary-action-text)] hover:brightness-95">Get Started</Link><Link href="/login" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-[var(--omlu-border-strong)] px-6 text-sm font-bold hover:bg-[var(--omlu-hover-background)]">Sign In</Link></div>
          </div>
          <ProductPreview title={product.previewTitle} items={product.previewItems} />
        </section>

        <section aria-labelledby="workflow-title">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-700">Connected workflows</p>
          <h2 id="workflow-title" className="mt-2 text-3xl font-black tracking-tight">From order to oversight, in one place.</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{product.workflows.map((workflow) => <article key={workflow.title} className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6"><div className="mb-5 flex size-9 items-center justify-center rounded-lg bg-orange-100 font-black text-orange-700 dark:bg-orange-950 dark:text-orange-300">✓</div><h3 className="font-black">{workflow.title}</h3><p className="mt-2 text-sm leading-6 text-[var(--omlu-text-secondary)]">{workflow.description}</p></article>)}</div>
        </section>

        <section className="grid gap-8 rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-7 sm:p-10 lg:grid-cols-[2fr_3fr]" aria-labelledby="audience-title">
          <div><p className="text-xs font-black uppercase tracking-[0.2em] text-orange-700">Who it is for</p><h2 id="audience-title" className="mt-2 text-3xl font-black tracking-tight">Built around the teams doing the work.</h2></div>
          <ul className="grid gap-3 sm:grid-cols-2">{product.audiences.map((audience) => <li key={audience} className="flex min-h-14 items-center rounded-xl bg-[var(--omlu-muted-surface)] px-4 text-sm font-bold"><span aria-hidden="true" className="mr-3 text-orange-600">●</span>{audience}</li>)}</ul>
        </section>

        <section id="pricing" className="scroll-mt-24 text-center" aria-labelledby="venue-pricing-title">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-700">Pricing</p><h2 id="venue-pricing-title" className="mt-2 text-3xl font-black tracking-tight">{product.pricingTitle}</h2><p className="mx-auto mt-4 max-w-2xl leading-7 text-[var(--omlu-text-secondary)]">{product.pricingDescription}</p><div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row"><Link href={product.registrationHref} className="inline-flex min-h-12 items-center justify-center rounded-lg bg-[var(--omlu-primary-action)] px-6 text-sm font-bold text-[var(--omlu-primary-action-text)] hover:brightness-95">Register</Link><Link href="/pricing" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-[var(--omlu-border-strong)] px-6 text-sm font-bold hover:bg-[var(--omlu-hover-background)]">View Pricing</Link></div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

function ProductPreview({ title, items }: { title: string; items: VenueProduct["previewItems"] }) {
  return <div className="rounded-2xl border border-[var(--omlu-border)] bg-zinc-950 p-3 shadow-xl" aria-label={`${title} interface preview`}><div className="rounded-xl bg-zinc-900 p-5 text-white"><div className="flex items-center justify-between border-b border-zinc-700 pb-4"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-400">Live workspace</p><p className="mt-1 font-black">{title}</p></div><span className="rounded-full bg-emerald-950 px-3 py-1 text-xs font-bold text-emerald-300">Open</span></div><div className="mt-4 grid gap-3">{items.map((item) => <div key={item.label} className="grid grid-cols-[1fr_auto] gap-4 rounded-lg border border-zinc-700 bg-zinc-800 p-4"><div><p className="text-sm font-bold">{item.label}</p><p className="mt-1 text-xs text-zinc-400">{item.detail}</p></div><span className="self-center rounded-md bg-orange-950 px-2 py-1 text-xs font-bold text-orange-300">{item.status}</span></div>)}</div></div></div>;
}
