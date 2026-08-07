"use client";

import React from "react";
import Link from "next/link";
import { PublicThemeControl } from "@/components/PublicThemeControl";
import { legalConfig } from "@/lib/legalConfig";

interface LegalLayoutProps {
  title: string;
  subtitle: string;
  effectiveDate?: string;
  lastUpdatedDate?: string;
  activePath: string;
  toc?: { id: string; label: string }[];
  children: React.ReactNode;
}

const POLICY_NAV = [
  { href: "/terms", label: "Terms of Service" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/refunds", label: "Refund & Cancellation" },
  { href: "/acceptable-use", label: "Acceptable Use Policy" },
  { href: "/service-policy", label: "Service & Support Policy" },
];

export default function LegalLayout({
  title,
  subtitle,
  effectiveDate = legalConfig.effectiveDate,
  lastUpdatedDate = legalConfig.lastUpdatedDate,
  activePath,
  toc = [],
  children,
}: LegalLayoutProps) {
  return (
    <div className="min-h-screen bg-[var(--omlu-page-background)] text-[var(--omlu-text-primary)] transition-colors duration-200">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-[var(--omlu-border)] bg-[color:var(--omlu-primary-surface)]/95 px-4 py-3 backdrop-blur-md sm:px-8 print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link
            href="/"
            aria-label="OMLU Home"
            className="flex items-center gap-2 text-base font-black tracking-tight text-[var(--omlu-text-primary)] hover:opacity-80 transition"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-600 text-xs font-black text-white">
              O
            </span>
            <span>OMLU Legal</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-xs font-bold text-[var(--omlu-text-secondary)] hover:text-[var(--omlu-text-primary)] transition"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="rounded-xl bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-700 transition"
            >
              Register
            </Link>
            <PublicThemeControl />
          </div>
        </div>
      </header>

      {/* Hero Header */}
      <section className="border-b border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-4 py-8 sm:px-8 sm:py-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[var(--omlu-text-secondary)]">
            <div className="flex items-center gap-2">
              <span>{legalConfig.legalEntityName}</span>
              <span>•</span>
              <span>Effective: {effectiveDate}</span>
              <span>•</span>
              <span>Last Updated: {lastUpdatedDate}</span>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="hidden sm:inline-flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 cursor-pointer print:hidden"
            >
              🖨️ Print Document
            </button>
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-tight text-[var(--omlu-text-primary)] sm:text-4xl">
            {title}
          </h1>
          <p className="mt-2 text-sm font-medium text-[var(--omlu-text-secondary)] max-w-3xl">
            {subtitle}
          </p>

          {/* Legal Review & Notice Alert */}
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
            <span className="font-bold">Notice:</span> These documents are drafted with reference to applicable Indian legal requirements, including the Digital Personal Data Protection Act, 2023, notified Digital Personal Data Protection Rules, 2025, Consumer Protection (E-Commerce) Rules, 2020, and applicable GST Invoice Rules.
          </div>
        </div>
      </section>

      {/* Main Content & Navigation Sidebar */}
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
          {/* Navigation & TOC Sidebar */}
          <aside className="lg:col-span-1 print:hidden">
            <div className="sticky top-20 flex flex-col gap-6">
              {/* Document Nav */}
              <nav aria-label="Legal documents" className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-4 shadow-xs">
                <h2 className="text-xs font-black uppercase tracking-wider text-[var(--omlu-text-secondary)] mb-3">
                  Legal Documents
                </h2>
                <ul className="flex flex-col gap-1 text-xs">
                  {POLICY_NAV.map((item) => {
                    const isActive = activePath === item.href;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={`block rounded-lg px-3 py-2 font-bold transition ${
                            isActive
                              ? "bg-orange-600 text-white"
                              : "text-[var(--omlu-text-secondary)] hover:bg-[var(--omlu-muted-surface)] hover:text-[var(--omlu-text-primary)]"
                          }`}
                        >
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              {/* Table of Contents */}
              {toc.length > 0 && (
                <nav aria-label="Table of contents" className="hidden lg:block rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-4 shadow-xs">
                  <h2 className="text-xs font-black uppercase tracking-wider text-[var(--omlu-text-secondary)] mb-3">
                    On This Page
                  </h2>
                  <ul className="flex flex-col gap-1.5 text-xs max-h-80 overflow-y-auto">
                    {toc.map((item) => (
                      <li key={item.id}>
                        <a
                          href={`#${item.id}`}
                          className="block text-[var(--omlu-text-secondary)] hover:text-orange-600 transition truncate"
                        >
                          {item.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}
            </div>
          </aside>

          {/* Main Body Content */}
          <main className="lg:col-span-3 prose prose-zinc dark:prose-invert max-w-none">
            {children}
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-4 py-8 sm:px-8 print:hidden">
        <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--omlu-text-secondary)]">
          <div>
            <p>© {new Date().getFullYear()} {legalConfig.legalEntityName}. All rights reserved.</p>
            <p className="mt-1">Jurisdiction: {legalConfig.jurisdictionCityState}</p>
          </div>
          <div className="flex flex-wrap items-center gap-4 font-bold">
            {POLICY_NAV.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-orange-600 transition">
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
