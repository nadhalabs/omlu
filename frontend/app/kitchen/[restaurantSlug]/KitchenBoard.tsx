"use client";

import { useState } from "react";
import { KitchenOrderResponse } from "@/lib/types";
import { KitchenLane, KitchenStatusStage } from "./KitchenLane";

interface KitchenBoardProps {
  orders: KitchenOrderResponse[];
  updatingTokens: Record<string, boolean>;
  onAccept: (publicToken: string) => void;
  onReject: (publicToken: string) => void;
  onStartPrep: (publicToken: string) => void;
  onMarkReady: (publicToken: string) => void;
  onMarkServed: (publicToken: string) => void;
  loading: boolean;
}

export function KitchenBoard({
  orders,
  updatingTokens,
  onAccept,
  onReject,
  onStartPrep,
  onMarkReady,
  onMarkServed,
  loading,
}: KitchenBoardProps) {
  // Active tab state for mobile viewport (<768px)
  const [mobileTab, setMobileTab] = useState<KitchenStatusStage>("pending");

  // Group orders into workflow columns
  const cols = {
    pending: orders.filter((o) => o.status === "pending"),
    accepted: orders.filter((o) => o.status === "accepted"),
    preparing: orders.filter((o) => o.status === "preparing"),
    ready: orders.filter((o) => o.status === "ready"),
  };

  const totalOrders = orders.length;

  const laneConfigs = [
    {
      stage: "pending" as KitchenStatusStage,
      label: "New",
      count: cols.pending.length,
      orders: cols.pending,
      accentColor: "bg-amber-500",
      accentBorder: "border-amber-900/30",
      badgeBg: "bg-amber-950/60 border border-amber-800/60",
      badgeText: "text-amber-400",
      emptyLabel: "No new orders",
      onAccept,
      onReject,
    },
    {
      stage: "accepted" as KitchenStatusStage,
      label: "Accepted",
      count: cols.accepted.length,
      orders: cols.accepted,
      accentColor: "bg-cyan-500",
      accentBorder: "border-cyan-900/30",
      badgeBg: "bg-cyan-950/60 border border-cyan-800/60",
      badgeText: "text-cyan-400",
      emptyLabel: "No accepted orders",
      onStartPrep,
      onReject,
    },
    {
      stage: "preparing" as KitchenStatusStage,
      label: "Preparing",
      count: cols.preparing.length,
      orders: cols.preparing,
      accentColor: "bg-purple-500",
      accentBorder: "border-purple-900/30",
      badgeBg: "bg-purple-950/60 border border-purple-800/60",
      badgeText: "text-purple-400",
      emptyLabel: "No preparing orders",
      onMarkReady,
    },
    {
      stage: "ready" as KitchenStatusStage,
      label: "Ready",
      count: cols.ready.length,
      orders: cols.ready,
      accentColor: "bg-emerald-500",
      accentBorder: "border-emerald-900/30",
      badgeBg: "bg-emerald-950/60 border border-emerald-800/60",
      badgeText: "text-emerald-400",
      emptyLabel: "No ready orders",
      onMarkServed,
    },
  ];

  if (loading && totalOrders === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-20" aria-label="Loading active kitchen orders">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500" />
        <span className="text-[var(--omlu-text-secondary)] text-sm font-bold mt-4">
          Loading active orders…
        </span>
      </div>
    );
  }

  return (
    <main className="flex-1 flex flex-col min-h-0">
      {/* Mobile Lane Selector Tabs (<768px) */}
      <div className="flex md:hidden items-center gap-1.5 p-1 mb-4 rounded-2xl bg-[var(--omlu-muted-surface)] border border-[var(--omlu-border)] overflow-x-auto">
        {laneConfigs.map((cfg) => {
          const active = mobileTab === cfg.stage;
          return (
            <button
              key={cfg.stage}
              type="button"
              onClick={() => setMobileTab(cfg.stage)}
              aria-selected={active}
              role="tab"
              aria-label={`${cfg.label} lane, ${cfg.count} orders`}
              className={`flex-1 min-h-11 min-w-[90px] px-3 py-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 whitespace-nowrap ${
                active
                  ? "bg-[var(--omlu-elevated-surface)] text-[var(--omlu-text-primary)] shadow-sm border border-[var(--omlu-border)]"
                  : "text-[var(--omlu-text-secondary)] hover:text-[var(--omlu-text-primary)]"
              }`}
            >
              <span>{cfg.label}</span>
              <span className={`px-1.5 py-0.2 rounded-md text-[10px] ${cfg.badgeBg} ${cfg.badgeText}`}>
                {cfg.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Central Board Empty State (Correction #8) */}
      {totalOrders === 0 ? (
        <div className="flex-1 flex flex-col">
          {/* Workflow Header Summary bar across top */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {laneConfigs.map((cfg) => (
              <div
                key={cfg.stage}
                className="bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] rounded-2xl p-3 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${cfg.accentColor}`} />
                  <span className="text-xs font-black uppercase text-[var(--omlu-text-secondary)]">
                    {cfg.label}
                  </span>
                </div>
                <span className="text-xs font-black text-[var(--omlu-text-secondary)]">0</span>
              </div>
            ))}
          </div>

          {/* Central Board Clear Card */}
          <div className="flex-1 flex flex-col items-center justify-center border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] rounded-3xl p-8 md:p-12 text-center min-h-[50vh]">
            <div className="w-16 h-16 rounded-full bg-emerald-950/50 border border-emerald-800/60 flex items-center justify-center text-3xl mb-4">
              ✨
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-[var(--omlu-text-primary)] tracking-tight">
              Kitchen is clear
            </h2>
            <p className="mt-2 text-sm font-bold text-[var(--omlu-text-secondary)] max-w-md">
              New orders will appear here automatically.
            </p>
          </div>
        </div>
      ) : (
        /* Board Content Viewports */
        <div className="flex-1 min-h-0">
          {/* Mobile Viewport: 1 Active Lane */}
          <div className="block md:hidden">
            {laneConfigs
              .filter((cfg) => cfg.stage === mobileTab)
              .map((cfg) => (
                <KitchenLane key={cfg.stage} config={cfg} updatingTokens={updatingTokens} />
              ))}
          </div>

          {/* Tablet Viewport (768px-1023px): Horizontally scrollable snap lanes (Correction #7) */}
          <div className="hidden md:flex lg:hidden overflow-x-auto snap-x snap-mandatory gap-4 pb-4 h-full">
            {laneConfigs.map((cfg) => (
              <div key={cfg.stage} className="min-w-[320px] max-w-[360px] snap-start flex-shrink-0">
                <KitchenLane config={cfg} updatingTokens={updatingTokens} />
              </div>
            ))}
          </div>

          {/* Desktop Viewport (≥1024px): 4 Lanes Side by Side (Correction #7) */}
          <div className="hidden lg:grid lg:grid-cols-4 gap-4 h-full items-start">
            {laneConfigs.map((cfg) => (
              <KitchenLane key={cfg.stage} config={cfg} updatingTokens={updatingTokens} />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
