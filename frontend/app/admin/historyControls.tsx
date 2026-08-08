"use client";

import { DatePreset, HistoryFilters, exportHistory } from "@/lib/adminHistory";

const presets: { value: DatePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "custom", label: "Custom" },
];

export function DateFilters({
  filters,
  setFilters,
  exportPath,
}: {
  filters: HistoryFilters;
  setFilters: (next: HistoryFilters) => void;
  exportPath: string;
}) {
  const preset = filters.preset || "today";
  return (
    <div className="flex max-w-full flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs font-bold text-[var(--omlu-text-secondary)]">
        Period
        <select
          value={preset}
          onChange={(event) => setFilters({ ...filters, preset: event.target.value as DatePreset, page: 1 })}
          className="min-w-32 rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3 text-sm text-[var(--omlu-text-primary)]"
        >
          {presets.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {preset === "custom" && (
        <>
          <label className="flex flex-col gap-1 text-xs font-bold text-[var(--omlu-text-secondary)]">
            Start
            <input
              type="date"
              value={filters.start_date || ""}
              onChange={(event) => setFilters({ ...filters, start_date: event.target.value, page: 1 })}
              className="max-w-full rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3 text-sm text-[var(--omlu-text-primary)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-[var(--omlu-text-secondary)]">
            End
            <input
              type="date"
              value={filters.end_date || ""}
              onChange={(event) => setFilters({ ...filters, end_date: event.target.value, page: 1 })}
              className="max-w-full rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3 text-sm text-[var(--omlu-text-primary)]"
            />
          </label>
        </>
      )}
      <button
        type="button"
        onClick={() => exportHistory(exportPath, filters)}
        className="rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-4 text-sm font-bold text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-muted-surface)]"
      >
        Export CSV
      </button>
    </div>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  setPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  setPage: (page: number) => void;
}) {
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--omlu-border-strong)] px-3 py-3 text-sm text-[var(--omlu-text-secondary)]">
      <span>
        Page {page} of {pages} · {total} total
      </span>
      <div className="flex gap-2">
        <button
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          className="rounded-lg border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3 py-1.5 font-bold text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-muted-surface)] disabled:bg-[var(--omlu-muted-surface)] disabled:text-[var(--omlu-text-secondary)]"
        >
          Previous
        </button>
        <button
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
          className="rounded-lg border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3 py-1.5 font-bold text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-muted-surface)] disabled:bg-[var(--omlu-muted-surface)] disabled:text-[var(--omlu-text-secondary)]"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="rounded-2xl border border-dashed border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-8 text-center text-sm font-semibold text-[var(--omlu-text-secondary)]">{message}</div>;
}

export function HistorySkeleton() {
  return (
    <div aria-label="Loading history" className="overflow-hidden rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-4">
      <div className="omlu-skeleton h-10 w-full rounded-lg" />
      <div className="mt-3 space-y-3">
        {[1, 2, 3, 4].map((row) => <div key={row} className="omlu-skeleton h-12 w-full rounded-lg" />)}
      </div>
    </div>
  );
}

const PAYMENT_METHOD_MAP: Record<string, string> = {
  counter_cash: "Cash",
  counter_upi: "UPI",
  counter_card: "Card",
  online: "Online",
};

const PAYMENT_STATUS_MAP: Record<string, string> = {
  paid: "Paid",
  unpaid: "Unpaid",
  payment_pending: "Payment Pending",
  void: "Void",
};

export function formatPaymentMethod(method: string | null | undefined): string {
  if (!method) return "-";
  const key = method.trim().toLowerCase();
  if (PAYMENT_METHOD_MAP[key]) {
    return PAYMENT_METHOD_MAP[key];
  }
  return method.replace(/_/g, " ");
}

export function formatPaymentStatus(status: string | null | undefined): string {
  if (!status) return "-";
  const key = status.trim().toLowerCase();
  if (PAYMENT_STATUS_MAP[key]) {
    return PAYMENT_STATUS_MAP[key];
  }
  return status.replace(/_/g, " ");
}

export function formatCurrencyINR(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "₹0.00";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "₹0.00";
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
  return `₹${formatted}`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (isNaN(date.getTime())) return value;
  const day = date.toLocaleDateString("en-IN", { day: "2-digit" });
  const month = date.toLocaleDateString("en-IN", { month: "short" });
  const year = date.getFullYear();
  const time = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${day} ${month} ${year}, ${time}`;
}

export function formatMinutes(value: number | null) {
  if (value === null) return "-";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

