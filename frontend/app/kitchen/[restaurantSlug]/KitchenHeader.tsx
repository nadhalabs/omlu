"use client";

import { KitchenMoreMenu } from "./KitchenMoreMenu";
import { RealtimeStatus } from "@/lib/realtime";

interface KitchenHeaderProps {
  restaurantSlug: string;
  realtimeStatus: RealtimeStatus;
  lastUpdated: Date | null;
  soundEnabled: boolean;
  onToggleSound: () => void;
  focusMode: boolean;
  onToggleFullscreen: () => void;
  onOpenAvailability: () => void;
  dashboardHref: string;
  staffName: string;
  staffRole: string;
  onRefresh: () => void;
  onSignOut: () => void;
  signOutPending: boolean;
  hasError: boolean;
}

export function KitchenHeader({
  restaurantSlug,
  realtimeStatus,
  lastUpdated,
  soundEnabled,
  onToggleSound,
  focusMode,
  onToggleFullscreen,
  onOpenAvailability,
  dashboardHref,
  staffName,
  staffRole,
  onRefresh,
  onSignOut,
  signOutPending,
  hasError,
}: KitchenHeaderProps) {
  // Format restaurant slug into title case
  const restaurantName = restaurantSlug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  // Map realtime connection status accurately (Correction #4)
  const connectionConfig = {
    live: { label: "Live", color: "bg-emerald-500", text: "text-emerald-400", border: "border-emerald-900/40" },
    reconnecting: { label: "Reconnecting", color: "bg-amber-500 animate-pulse", text: "text-amber-400", border: "border-amber-900/40" },
    connecting: { label: "Checking for updates", color: "bg-blue-400", text: "text-blue-300", border: "border-blue-900/40" },
    offline: { label: "Offline", color: "bg-red-500", text: "text-red-400", border: "border-red-900/40" },
  }[realtimeStatus] ?? { label: "Checking for updates", color: "bg-slate-400", text: "text-slate-300", border: "border-slate-800" };

  return (
    <header className="flex flex-col gap-4 border-b border-[var(--omlu-border)] pb-4 mb-4 md:flex-row md:items-center md:justify-between">
      {/* Left: Kitchen Display Title & Operational Status */}
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-black uppercase tracking-widest text-[var(--omlu-text-secondary)]">
            Kitchen Display
          </span>
          <span className="text-xs font-bold text-[var(--omlu-border-strong)]">•</span>
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-[var(--omlu-text-primary)] truncate">
            {restaurantName}
          </h1>
        </div>

        <div className="flex items-center gap-2.5 text-xs font-bold text-[var(--omlu-text-secondary)] flex-wrap mt-0.5">
          {/* Connection Status Badge */}
          <span
            aria-label={`Connection state: ${connectionConfig.label}`}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-black uppercase tracking-wider ${connectionConfig.border} bg-black/20 ${connectionConfig.text}`}
          >
            <span className={`w-2 h-2 rounded-full ${connectionConfig.color}`} />
            {connectionConfig.label}
          </span>

          {/* Last updated timestamp */}
          {lastUpdated && (
            <span className="text-[11px] font-medium text-[var(--omlu-text-secondary)]">
              Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      {/* Right: Operational Controls */}
      <div className="flex items-center gap-2.5 flex-wrap self-stretch md:self-auto justify-end">
        {/* Directly visible manual refresh button if offline or error exists (Correction #9) */}
        {(hasError || realtimeStatus === "offline" || realtimeStatus === "reconnecting") && (
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh orders now"
            title="Refresh active orders"
            className="cursor-pointer min-h-11 rounded-xl border border-amber-800/60 bg-amber-950/40 px-3.5 py-2 text-xs font-black text-amber-300 hover:bg-amber-900/50 transition flex items-center gap-1.5"
          >
            <span>🔄</span>
            <span>Refresh</span>
          </button>
        )}

        {/* Manage Availability button */}
        <button
          type="button"
          onClick={onOpenAvailability}
          className="cursor-pointer min-h-11 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-3.5 py-2 text-xs font-bold text-[var(--omlu-text-primary)] transition hover:bg-[var(--omlu-muted-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--omlu-page-background)]"
        >
          Manage availability
        </button>

        {/* Sound Toggle button (Correction #9) */}
        <button
          type="button"
          onClick={onToggleSound}
          aria-pressed={soundEnabled}
          aria-label={soundEnabled ? "Mute kitchen sound alerts" : "Enable kitchen sound alerts"}
          className={`cursor-pointer min-h-11 rounded-xl border px-3.5 py-2 text-xs font-bold transition flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--omlu-page-background)] ${
            soundEnabled
              ? "border-emerald-800/60 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50"
              : "border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] text-[var(--omlu-text-secondary)] hover:text-[var(--omlu-text-primary)]"
          }`}
        >
          <span>{soundEnabled ? "🔊" : "🔇"}</span>
          <span>{soundEnabled ? "Sound on" : "Sound muted"}</span>
        </button>

        {/* Fullscreen / Enlarge button (Correction #11) */}
        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={focusMode ? "Exit fullscreen kitchen display" : "Enlarge kitchen display to fullscreen"}
          className="cursor-pointer min-h-11 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-3.5 py-2 text-xs font-bold text-[var(--omlu-text-primary)] transition hover:bg-[var(--omlu-muted-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--omlu-page-background)]"
        >
          <span>⛶ {focusMode ? "Exit" : "Enlarge"}</span>
        </button>

        {/* More Menu Dropdown */}
        <KitchenMoreMenu
          dashboardHref={dashboardHref}
          staffName={staffName}
          staffRole={staffRole}
          onRefresh={onRefresh}
          onSignOut={onSignOut}
          signOutPending={signOutPending}
        />
      </div>
    </header>
  );
}
