"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

interface KitchenMoreMenuProps {
  dashboardHref: string;
  staffName: string;
  staffRole: string;
  onRefresh: () => void;
  onSignOut: () => void;
  signOutPending: boolean;
}

export function KitchenMoreMenu({
  dashboardHref,
  staffName,
  staffRole,
  onRefresh,
  onSignOut,
  signOutPending,
}: KitchenMoreMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const toggle = () => setOpen((prev) => !prev);

  // Close menu on Escape or click outside
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  return (
    <div className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="More kitchen menu options"
        className="cursor-pointer min-h-11 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-3.5 py-2 text-sm font-bold text-[var(--omlu-text-primary)] transition hover:bg-[var(--omlu-muted-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--omlu-page-background)]"
      >
        <span>⚙️ More</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-orientation="vertical"
          aria-label="Kitchen Display secondary controls"
          className="absolute right-0 z-50 mt-2 w-72 origin-top-right rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-elevated-surface)] p-4 shadow-2xl focus:outline-none"
        >
          {/* User Details */}
          <div className="border-b border-[var(--omlu-border)] pb-3 mb-3">
            <p className="text-xs font-semibold text-[var(--omlu-text-secondary)]">Signed-in Staff</p>
            <p className="text-sm font-black text-[var(--omlu-text-primary)] truncate mt-0.5">{staffName}</p>
            <span className="inline-block mt-1 text-[10px] font-black uppercase tracking-wider text-orange-400 bg-orange-950/40 border border-orange-900/40 px-2 py-0.5 rounded">
              Role: {staffRole}
            </span>
          </div>

          {/* Theme Preference Toggle */}
          <div className="mb-4">
            <ThemeToggle className="w-full" />
          </div>

          {/* Actions list */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                onRefresh();
                setOpen(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-left text-sm font-bold text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-muted-surface)] transition"
            >
              <span>🔄</span> Manual refresh
            </button>

            <Link
              href={dashboardHref}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-left text-sm font-bold text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-muted-surface)] transition"
            >
              <span>⬅️</span> Back to dashboard
            </Link>

            <div className="border-t border-[var(--omlu-border)] pt-2 mt-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
                disabled={signOutPending}
                className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-left text-sm font-bold text-red-400 hover:bg-red-950/30 transition disabled:opacity-50"
              >
                <span>🚪</span> Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
