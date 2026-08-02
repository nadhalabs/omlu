"use client";

import React from "react";
import { KitchenOrderResponse } from "@/lib/types";
import { KitchenOrderCard } from "./KitchenOrderCard";

export type KitchenStatusStage = "pending" | "accepted" | "preparing" | "ready";

export interface KitchenLaneConfig {
  stage: KitchenStatusStage;
  label: string;
  count: number;
  orders: KitchenOrderResponse[];
  accentColor: string;
  accentBorder: string;
  badgeBg: string;
  badgeText: string;
  emptyLabel: string;
  onAccept?: (publicToken: string) => void;
  onReject?: (publicToken: string) => void;
  onStartPrep?: (publicToken: string) => void;
  onMarkReady?: (publicToken: string) => void;
  onMarkServed?: (publicToken: string) => void;
}

interface KitchenLaneProps {
  config: KitchenLaneConfig;
  updatingTokens: Record<string, boolean>;
}

export function KitchenLane({ config, updatingTokens }: KitchenLaneProps) {
  const {
    label,
    count,
    orders,
    accentColor,
    accentBorder,
    badgeBg,
    badgeText,
    emptyLabel,
    onAccept,
    onReject,
    onStartPrep,
    onMarkReady,
    onMarkServed,
  } = config;

  return (
    <section
      aria-label={`${label} orders lane, ${count} orders`}
      className={`bg-[var(--omlu-page-background)] border border-[var(--omlu-border)] rounded-2xl md:rounded-3xl p-3 md:p-4 flex flex-col min-h-[60vh] max-h-[calc(100vh-180px)] w-full transition ${accentBorder}`}
    >
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-[var(--omlu-page-background)] pb-3 mb-3 border-b border-[var(--omlu-border)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${accentColor}`} />
            <h2 className="text-base md:text-lg font-black uppercase tracking-wider text-[var(--omlu-text-primary)]">
              {label}
            </h2>
          </div>

          {/* Large Count Badge */}
          <span
            aria-label={`${count} orders in ${label}`}
            className={`min-w-8 h-8 px-2.5 flex items-center justify-center rounded-xl text-sm font-black ${badgeBg} ${badgeText}`}
          >
            {count}
          </span>
        </div>
      </div>

      {/* Scrollable Order Cards Container */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 md:gap-4 pr-1">
        {orders.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-8">
            <p className="text-center text-xs md:text-sm font-bold text-[var(--omlu-text-secondary)]">
              {emptyLabel}
            </p>
          </div>
        ) : (
          orders.map((order) => (
            <KitchenOrderCard
              key={order.public_token}
              order={order}
              isUpdating={Boolean(updatingTokens[order.public_token])}
              onAccept={onAccept ? () => onAccept(order.public_token) : undefined}
              onReject={onReject ? () => onReject(order.public_token) : undefined}
              onStartPrep={onStartPrep ? () => onStartPrep(order.public_token) : undefined}
              onMarkReady={onMarkReady ? () => onMarkReady(order.public_token) : undefined}
              onMarkServed={onMarkServed ? () => onMarkServed(order.public_token) : undefined}
            />
          ))
        )}
      </div>
    </section>
  );
}
