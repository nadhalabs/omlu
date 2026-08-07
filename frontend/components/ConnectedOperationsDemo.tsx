"use client";

import { useEffect, useState } from "react";

const STAGES = [
  { id: "table", label: "1. Table QR", badge: "Table 08", status: "Ordering", color: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
  { id: "order", label: "2. Order Placed", badge: "Order #104", status: "New Order", color: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  { id: "kitchen", label: "3. Kitchen", badge: "Kitchen KDS", status: "Preparing", color: "bg-orange-500/15 text-orange-600 border-orange-500/30" },
  { id: "serve", label: "4. Served", badge: "Table 08", status: "Served", color: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  { id: "bill", label: "5. Bill Issued", badge: "Bill #B-104", status: "Issued", color: "bg-purple-500/15 text-purple-600 border-purple-500/30" },
  { id: "payment", label: "6. Payment", badge: "Counter Cash", status: "Paid ✓", color: "bg-emerald-600 text-white border-emerald-600" },
] as const;

export function ConnectedOperationsDemo() {
  const [activeStep, setActiveStep] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % STAGES.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [isPaused]);

  const stage = STAGES[activeStep];

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 shadow-2xl transition-all duration-300 sm:p-8"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      aria-label="Interactive OMLU Connected System Demo"
    >
      {/* Demo Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--omlu-border)] pb-5">
        <div className="flex items-center gap-3">
          <span className="flex h-3 w-3 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
          </span>
          <div>
            <h3 className="text-base font-black text-[var(--omlu-text-primary)]">Live Restaurant Workflow</h3>
            <p className="text-xs text-[var(--omlu-text-secondary)] font-semibold">Simulated real-time session tracking</p>
          </div>
        </div>

        {/* Step Selector Pills */}
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Workflow progress stages">
          {STAGES.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={activeStep === idx}
              onClick={() => setActiveStep(idx)}
              className={`min-h-8 rounded-lg px-2.5 text-xs font-bold transition ${
                activeStep === idx
                  ? "bg-orange-600 text-white shadow-xs"
                  : "bg-[var(--omlu-muted-surface)] text-[var(--omlu-text-secondary)] hover:text-[var(--omlu-text-primary)]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Live Operational UI Mockup Cards */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* Left Column: Customer & Table UI */}
        <div className="space-y-4 rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-orange-500/10 px-2.5 py-1 text-xs font-black text-orange-600">Table 08</span>
              <span className="text-xs font-bold text-[var(--omlu-text-secondary)]">4 Guests</span>
            </div>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-black transition-colors duration-300 ${stage.color}`}>
              {stage.status}
            </span>
          </div>

          {/* Active Items Snapshot */}
          <div className="space-y-2 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-4 text-xs font-bold">
            <div className="flex items-center justify-between text-[var(--omlu-text-primary)]">
              <span>1× Butter Chicken</span>
              <span>₹420.00</span>
            </div>
            <div className="flex items-center justify-between text-[var(--omlu-text-primary)]">
              <span>2× Garlic Naan</span>
              <span>₹180.00</span>
            </div>
            <div className="flex items-center justify-between text-[var(--omlu-text-secondary)] pt-1 border-t border-[var(--omlu-border)]">
              <span>1× Mango Lassi</span>
              <span>₹40.00</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs font-black text-[var(--omlu-text-primary)] px-1">
            <span>Subtotal (3 items)</span>
            <span className="text-base text-orange-600">₹640.00</span>
          </div>
        </div>

        {/* Right Column: Kitchen & Billing Operational Card */}
        <div className="space-y-4 rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] p-5">
          <div className="flex items-center justify-between border-b border-[var(--omlu-border)] pb-3">
            <div>
              <span className="text-xs font-black text-[var(--omlu-text-primary)]">KDS Ticket #104</span>
              <p className="text-[11px] text-[var(--omlu-text-secondary)] font-semibold">Table 08 • Dine-in</p>
            </div>
            <span className="rounded-lg bg-orange-600 text-white px-2.5 py-1 text-xs font-black">
              {activeStep >= 4 ? "Completed" : activeStep >= 2 ? "Preparing" : "Received"}
            </span>
          </div>

          {/* Status Progression Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-[var(--omlu-text-secondary)]">
              <span>Service Status</span>
              <span>{Math.round(((activeStep + 1) / STAGES.length) * 100)}%</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-[var(--omlu-border)] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-emerald-500 transition-all duration-500 ease-out"
                style={{ width: `${((activeStep + 1) / STAGES.length) * 100}%` }}
              />
            </div>
          </div>

          {/* Dynamic Action Banner based on active stage */}
          <div className="rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-3.5 text-xs">
            {activeStep === 0 && (
              <div className="flex items-center gap-2 font-bold text-blue-600">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                Customer scanned table QR code. Browsing live menu.
              </div>
            )}
            {activeStep === 1 && (
              <div className="flex items-center gap-2 font-bold text-amber-600">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                New order sent instantly to Kitchen Display.
              </div>
            )}
            {activeStep === 2 && (
              <div className="flex items-center gap-2 font-bold text-orange-600">
                <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                Kitchen team preparing order items in real time.
              </div>
            )}
            {activeStep === 3 && (
              <div className="flex items-center gap-2 font-bold text-emerald-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Order served to Table 08. Customer requested bill.
              </div>
            )}
            {activeStep === 4 && (
              <div className="flex items-center gap-2 font-bold text-purple-600">
                <span className="h-2 w-2 rounded-full bg-purple-500" />
                Bill #B-104 issued with GST calculation (₹640.00).
              </div>
            )}
            {activeStep === 5 && (
              <div className="flex items-center gap-2 font-bold text-emerald-600">
                <span className="h-2 w-2 rounded-full bg-emerald-600" />
                Counter cash payment confirmed. Table 08 ready for next guest!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
