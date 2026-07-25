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
      <label className="flex flex-col gap-1 text-xs font-bold text-zinc-400">
        Period
        <select
          value={preset}
          onChange={(event) => setFilters({ ...filters, preset: event.target.value as DatePreset, page: 1 })}
          className="min-w-32 rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
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
          <label className="flex flex-col gap-1 text-xs font-bold text-zinc-400">
            Start
            <input
              type="date"
              value={filters.start_date || ""}
              onChange={(event) => setFilters({ ...filters, start_date: event.target.value, page: 1 })}
              className="max-w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold text-zinc-400">
            End
            <input
              type="date"
              value={filters.end_date || ""}
              onChange={(event) => setFilters({ ...filters, end_date: event.target.value, page: 1 })}
              className="max-w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-900"
            />
          </label>
        </>
      )}
      <button
        type="button"
        onClick={() => exportHistory(exportPath, filters)}
        className="rounded-xl border border-zinc-300 bg-white px-4 text-sm font-bold text-zinc-800 hover:bg-zinc-50"
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
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-3 py-3 text-sm text-zinc-600">
      <span>
        Page {page} of {pages} · {total} total
      </span>
      <div className="flex gap-2">
        <button
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-bold text-zinc-800 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-500"
        >
          Previous
        </button>
        <button
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-bold text-zinc-800 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-500"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm font-semibold text-zinc-600">{message}</div>;
}

export function HistorySkeleton() {
  return (
    <div aria-label="Loading history" className="overflow-hidden rounded-2xl border border-zinc-200 bg-white p-4">
      <div className="omlu-skeleton h-10 w-full rounded-lg" />
      <div className="mt-3 space-y-3">
        {[1, 2, 3, 4].map((row) => <div key={row} className="omlu-skeleton h-12 w-full rounded-lg" />)}
      </div>
    </div>
  );
}

export function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export function formatMinutes(value: number | null) {
  if (value === null) return "-";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}
