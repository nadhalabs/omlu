"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PublicThemeControl } from "@/components/PublicThemeControl";
import { getStaffMe } from "@/lib/api";
import { roleHomePath } from "@/lib/roleRoutes";
import type { CurrentStaffResponse } from "@/lib/types";

type RecoveryAction = {
  href: string;
  label: string;
};

export function recoveryForStaff(staff: CurrentStaffResponse | null): {
  primary: RecoveryAction;
  secondary?: RecoveryAction;
} {
  if (!staff) {
    return {
      primary: { href: "/", label: "Go to Home" },
      secondary: { href: "/login", label: "Sign In" },
    };
  }

  if (staff.must_change_password) {
    return {
      primary: { href: roleHomePath(staff), label: "Continue securely" },
    };
  }

  if (staff.role === "owner" || staff.role === "admin") {
    return {
      primary: { href: roleHomePath(staff), label: "Go to Dashboard" },
    };
  }

  if (staff.role === "staff") {
    return {
      primary: { href: roleHomePath(staff), label: "Go to Tables" },
    };
  }

  if (staff.role === "kitchen" && staff.restaurant_slug) {
    return {
      primary: { href: roleHomePath(staff), label: "Open Kitchen Display" },
    };
  }

  return {
    primary: { href: "/", label: "Go to Home" },
    secondary: { href: "/login", label: "Sign In" },
  };
}

const primaryActionClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[var(--omlu-primary-action)] px-6 text-sm font-black text-[var(--omlu-primary-action-text)] shadow-sm transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--omlu-focus-ring)] sm:w-auto";

const secondaryActionClass =
  "inline-flex min-h-12 w-full items-center justify-center rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-6 text-sm font-bold text-[var(--omlu-text-primary)] transition hover:bg-[var(--omlu-hover-background)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--omlu-focus-ring)] sm:w-auto";

export default function NotFound() {
  const router = useRouter();
  const [staff, setStaff] = useState<CurrentStaffResponse | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const recovery = recoveryForStaff(staff);

  useEffect(() => {
    let active = true;
    void getStaffMe()
      .then((currentStaff) => {
        if (active) setStaff(currentStaff);
      })
      .catch(() => {
        if (active) setStaff(null);
      })
      .finally(() => {
        if (active) setAuthResolved(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const goBack = () => {
    let hasSafePreviousPage = false;
    try {
      const previous = document.referrer ? new URL(document.referrer) : null;
      hasSafePreviousPage = Boolean(
        window.history.length > 1 &&
          previous?.origin === window.location.origin &&
          previous.pathname !== window.location.pathname,
      );
    } catch {
      hasSafePreviousPage = false;
    }

    if (hasSafePreviousPage) {
      router.back();
      return;
    }
    router.replace(recovery.primary.href);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--omlu-page-background)] text-[var(--omlu-text-primary)]">
      <header className="border-b border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-4 py-3 sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link
            href="/"
            aria-label="OMLU Home"
            className="text-xl font-black tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--omlu-focus-ring)]"
          >
            <span className="text-orange-600" aria-hidden="true">●</span> OMLU
          </Link>
          <PublicThemeControl />
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100dvh-69px)] w-full max-w-7xl items-center gap-7 px-4 py-8 sm:px-8 sm:py-12 lg:grid-cols-[minmax(0,0.86fr)_minmax(0,1.14fr)] lg:gap-12 lg:py-14">
        <div className="order-2 mx-auto w-full max-w-xl text-center lg:order-1 lg:mx-0 lg:text-left">
          <p className="inline-flex rounded-full border border-[var(--omlu-warning-border)] bg-[var(--omlu-warning-background)] px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-[var(--omlu-warning-text)]">
            404 · Page not found
          </p>
          <h1 className="mt-5 text-balance text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
            Oops — this page is not on the menu.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-7 text-[var(--omlu-text-secondary)] lg:mx-0 lg:text-lg">
            The page you’re looking for doesn’t exist, may have moved, or you may not have access to it.
          </p>

          <nav aria-label="Page recovery" className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center lg:justify-start">
            {authResolved ? (
              <>
                <Link href={recovery.primary.href} className={primaryActionClass}>
                  {recovery.primary.label}
                </Link>
                <button type="button" onClick={goBack} className={secondaryActionClass}>
                  Go Back
                </button>
                {recovery.secondary && (
                  <Link href={recovery.secondary.href} className={secondaryActionClass}>
                    {recovery.secondary.label}
                  </Link>
                )}
              </>
            ) : (
              <span role="status" className="min-h-12 px-2 py-3 text-sm font-semibold text-[var(--omlu-text-secondary)]">
                Checking your session…
              </span>
            )}
          </nav>
        </div>

        <div className="order-1 mx-auto w-full max-w-2xl lg:order-2">
          <Image
            src="/images/omlu-404-chef.png"
            alt="OMLU chef beside a 404 not found sign"
            width={1536}
            height={1024}
            priority
            sizes="(max-width: 1023px) calc(100vw - 2rem), 56vw"
            className="h-auto max-h-[48dvh] w-full rounded-3xl object-contain shadow-sm sm:max-h-[52dvh] lg:max-h-[68dvh]"
          />
        </div>
      </main>
    </div>
  );
}
