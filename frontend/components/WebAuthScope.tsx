"use client";

import type { ReactNode } from "react";
import { activateWebTenantScope } from "@/lib/authRuntime.mjs";
import type { WebTenantScope } from "@/lib/authRuntime.mjs";

export function WebAuthScope({
  scope,
  children,
}: {
  scope: WebTenantScope;
  children: ReactNode;
}) {
  activateWebTenantScope(scope);
  return children;
}
