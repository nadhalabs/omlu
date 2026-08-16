"use client";

import Link from "next/link";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";

export function LandingHeader({ themeToggle, productHref = "/#product" }: { themeToggle: ReactNode; productHref?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);
  const openDemoForm = (event: MouseEvent<HTMLAnchorElement>) => {
    if (window.location.pathname !== "/") return;
    const demoForm = document.getElementById("demo");
    if (!demoForm) return;
    event.preventDefault();
    window.history.replaceState(null, "", "/#demo");
    demoForm.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[color-mix(in_srgb,var(--omlu-border)_55%,transparent)] bg-[color-mix(in_srgb,var(--omlu-page-background)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-17 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" aria-label="OMLU home" className="inline-flex min-h-11 items-center text-base font-black tracking-[-0.04em] text-[var(--omlu-text-primary)] transition-colors hover:text-orange-500">
          OMLU
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          <nav aria-label="Primary navigation" className="flex items-center gap-1">
            <a href={productHref} className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-[var(--omlu-text-muted)] transition-colors hover:text-orange-500">Product</a>
            <Link href="/pricing" className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-[var(--omlu-text-muted)] transition-colors hover:text-orange-500">Pricing</Link>
            <Link href="/login" className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-[var(--omlu-text-muted)] transition-colors hover:text-orange-500">Login</Link>
          </nav>
          <Link href="/#demo" onClick={openDemoForm} className="ml-2 inline-flex min-h-11 items-center justify-center rounded-lg bg-orange-600 px-4 text-sm font-bold text-white transition-colors hover:bg-orange-700">Book a Free Trial</Link>
          <Link href="/register" className="ml-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-[var(--omlu-primary-action)] px-4 text-sm font-bold text-[var(--omlu-primary-action-text)] transition hover:brightness-95">Get Started</Link>
          <div className="ml-2">{themeToggle}</div>
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <Link href="/#demo" onClick={openDemoForm} className="inline-flex min-h-10 items-center justify-center rounded-lg bg-orange-600 px-2.5 text-xs font-bold text-white hover:bg-orange-700">Book a Free Trial</Link>
          {themeToggle}
          <button
            type="button"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
            className="inline-flex size-11 items-center justify-center rounded-lg text-[var(--omlu-text-secondary)] transition-colors hover:bg-[var(--omlu-hover-background)] hover:text-orange-500"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {menuOpen ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {menuOpen && (
        <div id="mobile-navigation" className="border-t border-[color-mix(in_srgb,var(--omlu-border)_55%,transparent)] bg-[color-mix(in_srgb,var(--omlu-page-background)_96%,transparent)] px-5 pb-5 pt-3 backdrop-blur-md md:hidden">
          <nav aria-label="Mobile navigation" className="mx-auto grid max-w-6xl gap-1">
            <a href={productHref} onClick={closeMenu} className="flex min-h-12 items-center rounded-lg px-3 text-sm font-semibold text-[var(--omlu-text-secondary)] hover:bg-[var(--omlu-hover-background)] hover:text-orange-500">Product</a>
            <Link href="/pricing" onClick={closeMenu} className="flex min-h-12 items-center rounded-lg px-3 text-sm font-semibold text-[var(--omlu-text-secondary)] hover:bg-[var(--omlu-hover-background)] hover:text-orange-500">Pricing</Link>
            <Link href="/login" onClick={closeMenu} className="flex min-h-12 items-center rounded-lg px-3 text-sm font-semibold text-[var(--omlu-text-secondary)] hover:bg-[var(--omlu-hover-background)] hover:text-orange-500">Login</Link>
            <Link href="/register" onClick={closeMenu} className="mt-2 inline-flex min-h-12 items-center justify-center rounded-lg bg-[var(--omlu-primary-action)] px-4 text-sm font-bold text-[var(--omlu-primary-action-text)]">Get Started</Link>
          </nav>
        </div>
      )}
    </header>
  );
}
