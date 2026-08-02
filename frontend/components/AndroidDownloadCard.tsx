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
    <section className={`overflow-hidden rounded-3xl border border-[var(--omlu-border)] bg-[var(--omlu-elevated-surface)] text-[var(--omlu-text-primary)] shadow-2xl ${className}`} aria-labelledby="android-download-title">
      <div className="grid items-center gap-8 p-6 sm:p-9 lg:grid-cols-[1.35fr_0.65fr] lg:p-12">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-400">Available on Android</p>
          <h2 id="android-download-title" className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">OMLU for Android</h2>
          <p className="mt-4 max-w-2xl text-lg font-bold text-[var(--omlu-text-primary)]">Run your restaurant from anywhere.</p>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--omlu-text-secondary)]">Manage tables, orders, kitchen activity, staff, billing, and restaurant status from the OMLU Android app.</p>
          <div className="mt-6"><DownloadLink /></div>
          <p className="mt-3 text-xs font-semibold text-[var(--omlu-text-muted)]">Direct APK download • Android only • Android 7.0 or later</p>
          <p className="mt-2 text-xs leading-5 text-[var(--omlu-text-secondary)]">Your browser may ask permission to install apps from this source.</p>
          <div className="mt-5 max-w-xl text-sm text-[var(--omlu-text-secondary)]">
            <button type="button" aria-expanded={helpOpen} aria-controls="omlu-apk-install-help" onClick={() => setHelpOpen((open) => !open)} className="rounded-md font-bold text-orange-500 outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--omlu-page-background)]">How to install the APK <span aria-hidden="true">{helpOpen ? "−" : "+"}</span></button>
            {helpOpen && <ol id="omlu-apk-install-help" className="mt-3 list-decimal space-y-1.5 pl-5 leading-6 text-[var(--omlu-text-secondary)]"><li>Download the OMLU APK.</li><li>Open the downloaded file.</li><li>Allow installation from the browser if Android asks.</li><li>Tap Install.</li><li>Open OMLU and sign in.</li></ol>}
          </div>
        </div>
        <div className="hidden justify-center lg:flex" aria-hidden="true">
          <div className="relative h-64 w-40 rotate-2 rounded-[2.25rem] border-[6px] border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-3 shadow-2xl motion-safe:transition-transform motion-safe:hover:-translate-y-1">
            <div className="mx-auto h-1.5 w-12 rounded-full bg-[var(--omlu-border-strong)]" />
            <div className="mt-12 flex flex-col items-center text-center"><span className="rounded-2xl bg-orange-600 p-4 text-[var(--omlu-primary-action-text)]"><AndroidIcon className="h-9 w-9" /></span><span className="mt-4 text-xl font-black">OMLU</span><span className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[var(--omlu-text-muted)]">Restaurant operations</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}
