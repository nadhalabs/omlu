"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { PublicThemeControl } from "@/components/PublicThemeControl";
import { legalConfig } from "@/lib/legalConfig";

interface LegalLayoutProps {
  title: string;
  subtitle: string;
  effectiveDate?: string;
  lastUpdatedDate?: string;
  activePath: string;
  toc?: { id: string; label: string }[];
  summary?: ReactNode;
  children: ReactNode;
}

const POLICY_NAV = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refunds", label: "Refund & Cancellation" },
  { href: "/acceptable-use", label: "Acceptable Use Policy" },
  { href: "/service-policy", label: "Service & Support Policy" },
];

function DocumentNav({ activePath, mobile = false }: { activePath: string; mobile?: boolean }) {
  return (
    <nav aria-label="Legal documents" className={mobile ? "lg:hidden" : "hidden lg:block"}>
      {!mobile && <p className="mb-4 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--omlu-text-muted)]">Legal documents</p>}
      <ul className={mobile ? "flex snap-x gap-2 overflow-x-auto pb-2" : "space-y-1"}>
        {POLICY_NAV.map((item) => {
          const active = activePath === item.href;
          return <li key={item.href} className={mobile ? "shrink-0 snap-start" : ""}><Link href={item.href} aria-current={active ? "page" : undefined} className={`block rounded-lg text-sm font-bold transition-colors ${mobile ? "whitespace-nowrap border px-3 py-2.5" : "px-3 py-2.5"} ${active ? "border-orange-300 bg-[var(--omlu-accent-soft)] text-orange-700 dark:text-orange-300" : "border-[var(--omlu-border)] text-[var(--omlu-text-secondary)] hover:bg-[var(--omlu-muted-surface)] hover:text-[var(--omlu-text-primary)]"}`}>{item.label}</Link></li>;
        })}
      </ul>
    </nav>
  );
}

function TableOfContents({ toc, activeId, mobile = false }: { toc: { id: string; label: string }[]; activeId: string; mobile?: boolean }) {
  const list = <ul className={mobile ? "mt-2 border-t border-[var(--omlu-border)] pt-2" : "max-h-[calc(100vh-10rem)] space-y-0.5 overflow-y-auto pr-2"}>{toc.map((item) => <li key={item.id}><a href={`#${item.id}`} aria-current={activeId === item.id ? "location" : undefined} className={`block border-l-2 py-1.5 pl-3 text-xs leading-5 transition-colors ${activeId === item.id ? "border-orange-500 font-bold text-orange-700 dark:text-orange-300" : "border-transparent text-[var(--omlu-text-muted)] hover:border-[var(--omlu-border-strong)] hover:text-[var(--omlu-text-primary)]"}`}>{item.label}</a></li>)}</ul>;
  if (mobile) return <details className="group rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-4 py-2 lg:hidden"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-bold">On this page <span aria-hidden="true" className="text-lg text-orange-600 group-open:rotate-45">+</span></summary>{list}</details>;
  return <nav aria-label="Table of contents" className="hidden lg:block"><p className="mb-4 text-[11px] font-black uppercase tracking-[0.18em] text-[var(--omlu-text-muted)]">On this page</p>{list}</nav>;
}

export default function LegalLayout({ title, subtitle, effectiveDate = legalConfig.effectiveDate, lastUpdatedDate = legalConfig.lastUpdatedDate, activePath, toc = [], summary, children }: LegalLayoutProps) {
  const [activeId, setActiveId] = useState(toc[0]?.id ?? "");

  useEffect(() => {
    if (!toc.length) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActiveId(visible.target.id);
    }, { rootMargin: "-18% 0px -70% 0px", threshold: 0 });
    toc.forEach(({ id }) => { const element = document.getElementById(id); if (element) observer.observe(element); });
    return () => observer.disconnect();
  }, [toc]);

  return <div className="legal-page min-h-screen bg-[var(--omlu-page-background)] text-[var(--omlu-text-primary)]">
    <header className="legal-screen-only sticky top-0 z-40 border-b border-[var(--omlu-border)] bg-[color:var(--omlu-primary-surface)]/95 px-4 backdrop-blur sm:px-8">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4">
        <Link href="/" aria-label="OMLU home" className="flex items-center gap-2.5 font-black tracking-tight"><span className="flex size-8 items-center justify-center rounded-lg bg-orange-600 text-sm text-white">O</span><span>OMLU <span className="font-semibold text-[var(--omlu-text-muted)]">Legal</span></span></Link>
        <div className="flex items-center gap-2 sm:gap-4"><Link href="/login" className="px-2 text-sm font-bold text-[var(--omlu-text-secondary)] hover:text-orange-600">Sign In</Link><Link href="/register" className="rounded-lg border border-[var(--omlu-border-strong)] px-3 py-2 text-sm font-bold hover:border-orange-500 hover:text-orange-600">Register</Link><PublicThemeControl /></div>
      </div>
    </header>

    <main>
      <section className="border-b border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-7xl"><p className="text-xs font-black uppercase tracking-[0.22em] text-orange-600">OMLU Legal</p><div className="mt-4 flex items-end justify-between gap-8"><div><h1 className="text-[clamp(2.25rem,5vw,3.25rem)] font-black leading-[1.05] tracking-[-0.045em]">{title}</h1><p className="mt-5 max-w-3xl text-base leading-7 text-[var(--omlu-text-secondary)] sm:text-lg">{subtitle}</p></div><button type="button" onClick={() => window.print()} className="legal-screen-only hidden min-h-10 shrink-0 items-center rounded-lg border border-[var(--omlu-border-strong)] px-4 text-sm font-bold hover:border-orange-500 hover:text-orange-600 sm:inline-flex">Print</button></div><div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-[var(--omlu-text-muted)]"><span>Effective {effectiveDate}</span><span>Last updated {lastUpdatedDate}</span></div></div>
      </section>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-12">
        <DocumentNav activePath={activePath} mobile />
        {summary && <div className="mt-6 lg:mt-0">{summary}</div>}
        {toc.length > 0 && <div className="mt-5 lg:hidden"><TableOfContents toc={toc} activeId={activeId} mobile /></div>}
        <div className={`mt-8 grid gap-12 lg:mt-12 ${toc.length ? "lg:grid-cols-[200px_minmax(0,760px)_200px] xl:grid-cols-[220px_minmax(0,780px)_220px]" : "lg:grid-cols-[220px_minmax(0,800px)]"}`}>
          <aside className="legal-screen-only"><div className="sticky top-24"><DocumentNav activePath={activePath} /></div></aside>
          <article className="legal-article min-w-0">{children}</article>
          {toc.length > 0 && <aside className="legal-screen-only"><div className="sticky top-24"><TableOfContents toc={toc} activeId={activeId} /></div></aside>}
        </div>
      </div>
    </main>

    <footer className="border-t border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-5 py-8 sm:px-8"><div className="mx-auto flex max-w-7xl flex-col gap-5 text-xs text-[var(--omlu-text-secondary)] sm:flex-row sm:items-center sm:justify-between"><div><p>© 2026 {legalConfig.legalEntityName}. All rights reserved.</p><p className="mt-1">OMLU is operated by {legalConfig.legalEntityName}.</p></div><nav aria-label="Legal footer" className="legal-screen-only flex flex-wrap gap-x-4 gap-y-2 font-bold">{POLICY_NAV.map((item) => <Link key={item.href} href={item.href} className="hover:text-orange-600">{item.label}</Link>)}</nav></div></footer>
  </div>;
}
