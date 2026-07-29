"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtime } from "@/lib/realtime";

type AvailabilityItem = {
  id: number;
  category_id: number;
  category_name: string;
  name_en: string;
  is_available: boolean;
};

function errorMessage(value: unknown, fallback: string) {
  return value instanceof Error ? value.message : fallback;
}

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({}));
  return typeof body.detail === "string" ? body.detail : fallback;
}

export function KitchenAvailabilityDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<AvailabilityItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/staff/availability", { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "Could not load availability."));
      const body = await response.json();
      setItems(body.items ?? []);
      setError(null);
    } catch (value) {
      setError(errorMessage(value, "Could not load availability."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const timeout = window.setTimeout(() => {
      void load();
      dialogRef.current?.focus();
    }, 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, [load, onClose, open]);

  useRealtime({
    enabled: open,
    target: { kind: "staff", channel: "availability" },
    onEvent: () => void load(),
    onReconnect: () => void load(),
  });

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query ? items.filter((item) => item.name_en.toLocaleLowerCase().includes(query)) : items;
  }, [items, search]);

  const grouped = useMemo(() => {
    const groups = new Map<string, AvailabilityItem[]>();
    filtered.forEach((item) => groups.set(item.category_name, [...(groups.get(item.category_name) ?? []), item]));
    return Array.from(groups);
  }, [filtered]);

  const update = async (item: AvailabilityItem) => {
    if (pendingId !== null) return;
    const next = !item.is_available;
    setPendingId(item.id);
    setError(null);
    setMessage(null);
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_available: next } : entry));
    try {
      const response = await fetch(`/api/staff/availability/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_available: next }),
      });
      if (!response.ok) throw new Error(await responseError(response, "Could not update availability."));
      setMessage(`${item.name_en} is now ${next ? "available" : "sold out"}.`);
      await load();
    } catch (value) {
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, is_available: item.is_available } : entry));
      setError(errorMessage(value, "Could not update availability. The previous setting was restored."));
      await load();
    } finally {
      setPendingId(null);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/65" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="availability-title"
        tabIndex={-1}
        className="flex h-full w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 id="availability-title" className="text-lg font-semibold">Manage availability</h2>
          <button onClick={onClose} aria-label="Close availability panel" className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white">Close</button>
        </div>
        <div className="border-b border-zinc-800 p-4">
          <label htmlFor="availability-search" className="sr-only">Search menu items</label>
          <input id="availability-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search items…" className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-orange-500" />
          <div aria-live="polite" className="mt-2 min-h-5 text-xs">
            {error ? <p className="text-red-400">{error}</p> : message ? <p className="text-green-400">{message}</p> : null}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {loading && items.length === 0 ? <p className="py-6 text-center text-sm text-zinc-500">Loading items…</p> : null}
          {!loading && grouped.length === 0 ? <p className="py-6 text-center text-sm text-zinc-500">No matching items</p> : null}
          {grouped.map(([category, categoryItems]) => (
            <section key={category} className="py-3">
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">{category}</h3>
              {categoryItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 border-b border-zinc-900 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-100">{item.name_en}</p>
                    <p className={`mt-0.5 text-xs ${item.is_available ? "text-green-400" : "text-red-400"}`}>{item.is_available ? "Available" : "Sold out"}</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={item.is_available}
                    aria-label={`${item.name_en}: ${item.is_available ? "Available" : "Sold out"}`}
                    disabled={pendingId !== null}
                    onClick={() => void update(item)}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:cursor-wait disabled:opacity-50 ${item.is_available ? "bg-green-600" : "bg-zinc-700"}`}
                  >
                    <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${item.is_available ? "left-6" : "left-1"}`} />
                  </button>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
