"use client";

import { useEffect, useState } from "react";

type AndroidDownloadCardProps = {
  variant?: "landing" | "login" | "compact";
  dismissible?: boolean;
  className?: string;
};

const DISMISSAL_KEY = "omlu_android_download_banner_dismissed";

function AndroidIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7.2 8.2h9.6v8.1a1.7 1.7 0 0 1-1.7 1.7H8.9a1.7 1.7 0 0 1-1.7-1.7V8.2Z" fill="currentColor" />
      <path d="M8.1 8.2a3.9 3.9 0 0 1 7.8 0M9 4.7 7.7 2.8M15 4.7l1.3-1.9M9.5 11.4v7.8M14.5 11.4v7.8M5 9.2v5.7M19 9.2v5.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="6.8" r=".6" fill="white" /><circle cx="14" cy="6.8" r=".6" fill="white" />
    </svg>
  );
}

function DownloadLink({ compact = false }: { compact?: boolean }) {
  const [pressed, setPressed] = useState(false);
  return (
    <a
      href="/downloads/omlu.apk"
      download="OMLU.apk"
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      className={`${compact ? "min-h-10 px-3 text-xs" : "min-h-12 w-full px-5 text-sm sm:w-auto"} inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--omlu-primary-action)] font-black text-[var(--omlu-primary-action-text)] shadow-sm transition motion-safe:hover:-translate-y-0.5 hover:brightness-95 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 ${pressed ? "scale-[0.98]" : ""}`}
      aria-label="Download OMLU APK for Android"
    >
      <AndroidIcon />
      {compact ? "Download app" : "Download OMLU for Android"}
    </a>
  );
}

export function AndroidDownloadCard({ variant = "landing", dismissible = false, className = "" }: AndroidDownloadCardProps) {
  const [dismissed, setDismissed] = useState<boolean | null>(dismissible ? null : false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (!dismissible) return;
    const timeout = window.setTimeout(() => setDismissed(window.localStorage.getItem(DISMISSAL_KEY) === "true"), 0);
    return () => window.clearTimeout(timeout);
  }, [dismissible]);

  const dismiss = () => {
    window.localStorage.setItem(DISMISSAL_KEY, "true");
    setDismissed(true);
  };

  if (dismissed === null || dismissed) return null;

  if (variant === "compact") {
    return (
      <aside className={`print:hidden rounded-xl border border-[var(--omlu-warning-border)] bg-[var(--omlu-warning-background)] p-3 text-[var(--omlu-text-primary)] ${className}`} aria-label="OMLU Android app">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="rounded-lg bg-orange-600/15 p-2 text-orange-400"><AndroidIcon /></span>
            <div><p className="text-sm font-black">OMLU works better on Android</p><p className="mt-0.5 text-xs leading-5 text-[var(--omlu-text-secondary)]">Get quicker access to tables, orders, and kitchen activity.</p></div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <DownloadLink compact />
            {dismissible && <button type="button" onClick={dismiss} className="min-h-10 rounded-lg px-3 text-xs font-bold text-[var(--omlu-text-secondary)] hover:bg-[var(--omlu-hover-background)] hover:text-[var(--omlu-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400">Dismiss</button>}
          </div>
        </div>
      </aside>
    );
  }

  if (variant === "login") {
    return (
      <aside className={`rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-5 shadow-sm ${className}`} aria-labelledby="android-login-title">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-orange-50 p-2.5 text-orange-700"><AndroidIcon /></span>
          <div className="min-w-0 flex-1"><h2 id="android-login-title" className="font-black text-[var(--omlu-text-primary)]">Using Android?</h2><p className="mt-1 text-sm leading-6 text-[var(--omlu-text-secondary)]">Get the OMLU app for faster access to restaurant operations.</p></div>
        </div>
        <div className="mt-4"><DownloadLink compact /></div>
      </aside>
    );
  }

  return (
    <section className={`overflow-hidden rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] text-[var(--omlu-text-primary)] p-6 sm:p-10 ${className}`} aria-labelledby="android-download-title">
      <div className="grid items-center gap-8 lg:grid-cols-[1.35fr_0.65fr]">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Available on Android</p>
          <h2 id="android-download-title" className="mt-2 text-2xl font-black tracking-tight text-[var(--omlu-text-primary)] sm:text-3xl">OMLU for Android</h2>
          <p className="mt-3 text-base font-bold text-[var(--omlu-text-primary)]">Run your restaurant from anywhere.</p>
          <p className="mt-2 text-sm leading-6 text-[var(--omlu-text-secondary)] max-w-xl">Manage tables, orders, kitchen activity, staff, billing, and restaurant status from the OMLU Android app.</p>
          
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <DownloadLink />
          </div>
          
          <p className="mt-3 text-xs font-semibold text-[var(--omlu-text-secondary)]">Direct APK download • Android only • Android 7.0 or later</p>
          <p className="mt-1 text-xs leading-5 text-[var(--omlu-text-secondary)] opacity-80">Your browser may ask permission to install apps from this source.</p>

          <div className="mt-5 max-w-xl text-sm text-[var(--omlu-text-secondary)]">
            <button
              type="button"
              aria-expanded={helpOpen}
              aria-controls="omlu-apk-install-help"
              onClick={() => setHelpOpen((open) => !open)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold text-orange-600 transition hover:bg-orange-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <span>How to install the APK</span>
              <span className={`inline-block text-sm font-black transition-transform duration-200 ${helpOpen ? "rotate-45" : ""}`} aria-hidden="true">+</span>
            </button>
            <div
              id="omlu-apk-install-help"
              className={`grid transition-all duration-300 ease-in-out ${helpOpen ? "grid-rows-[1fr] opacity-100 mt-3" : "grid-rows-[0fr] opacity-0 overflow-hidden"}`}
            >
              <div className="overflow-hidden">
                <ol className="list-decimal space-y-1.5 pl-5 text-xs leading-6 text-[var(--omlu-text-secondary)]">
                  <li>Download the OMLU APK.</li>
                  <li>Open the downloaded file on your Android device.</li>
                  <li>Allow installation from this source if Android prompts for permission.</li>
                  <li>Tap Install.</li>
                  <li>Open OMLU and sign in to access your restaurant workspace.</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* Clean, Factual Android Platform Summary Card */}
        <div className="hidden justify-center lg:flex" aria-hidden="true">
          <div className="flex flex-col gap-4 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-6 text-left shadow-xs">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-600 text-white">
                <AndroidIcon className="h-6 w-6" />
              </span>
              <div>
                <h3 className="text-sm font-black text-[var(--omlu-text-primary)]">OMLU Operations</h3>
                <p className="text-xs font-semibold text-[var(--omlu-text-secondary)]">Native Android Build</p>
              </div>
            </div>
            <div className="space-y-2 border-t border-[var(--omlu-border)] pt-4 text-xs font-semibold text-[var(--omlu-text-secondary)]">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>Full Kitchen KDS & Table Management</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>Quick Sale POS & Counter Billing</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>Role-Based Staff Access Controls</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
