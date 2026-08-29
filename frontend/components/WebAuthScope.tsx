"use client";

import { useEffect, type ReactNode } from "react";
import { activateWebTenantScope } from "@/lib/authRuntime.mjs";
import { getStaffMe } from "@/lib/api";
import type { WebTenantScope } from "@/lib/authRuntime.mjs";

export function WebAuthScope({
  scope,
  children,
}: {
  scope: WebTenantScope;
  children: ReactNode;
}) {
  activateWebTenantScope(scope);
  useEffect(() => {
    // The initial check restores/renews after a browser or PWA restart. A
    // lightweight heartbeat keeps an actively used operations screen rolling.
    void getStaffMe().catch(() => {});
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void getStaffMe().catch(() => {});
    }, 12 * 60 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, []);
  return children;
}
