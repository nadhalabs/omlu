"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MenuOptionGroup } from "@/lib/types";
import { useRealtime } from "@/lib/realtime";

type AvailabilityItem = {
  id: number;
  category_id: number;
  category_name: string;
  name_en: string;
  is_available: boolean;
  option_groups: MenuOptionGroup[];
};

async function parseError(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}));
  return typeof data.detail === "string" ? data.detail : fallback;
}

export default function StaffAvailabilityClient() {
  const [items, setItems] = useState<AvailabilityItem[]>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | "all">("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (categoryId !== "all") params.set("category_id", String(categoryId));
    try {
      const res = await fetch(`/api/staff/availability?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await parseError(res, "Could not load availability."));
      const data = await res.json();
      setItems(data.items || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load availability.");
    } finally {
      setLoading(false);
    }
  }, [categoryId, search]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const realtimeStatus = useRealtime({
    target: { kind: "staff", channel: "availability" },
    onEvent: () => void load(),
    onReconnect: () => void load(),
  });

  const categories = useMemo(() => {
    const map = new Map<number, string>();
    items.forEach((item) => map.set(item.category_id, item.category_name));
    return Array.from(map.entries());
  }, [items]);

  const patch = async (key: string, path: string, body: object) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/staff/availability/${path}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await parseError(res, "Could not update availability."));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update availability.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/staff" className="text-sm font-bold text-orange-400">Back to staff home</Link>
            <h1 className="mt-2 text-3xl font-black text-white">Availability</h1>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-zinc-600">Real-time: {realtimeStatus}</p>
          </div>
          <Link href="/staff/tables" className="rounded-lg bg-orange-600 px-4 py-3 text-sm font-black text-white">New Order</Link>
        </div>
        <section className="grid gap-3 md:grid-cols-[1fr_220px]">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search menu" className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-4 text-white outline-none focus:border-orange-500" />
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value === "all" ? "all" : Number(event.target.value))} className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-4 text-white outline-none focus:border-orange-500">
            <option value="all">All categories</option>
            {categories.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </section>
        {error && <div className="rounded-lg border border-red-800/40 bg-red-950/20 p-4 text-sm text-red-300">{error}</div>}
        {loading ? <div className="text-sm text-zinc-500">Loading availability...</div> : items.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-500">No menu items found.</div>
        ) : (
          <div className="grid gap-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-black text-white">{item.name_en}</div>
                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-500">{item.category_name}</div>
                  </div>
                  <button disabled={busy === `item-${item.id}`} onClick={() => patch(`item-${item.id}`, `items/${item.id}`, { is_available: !item.is_available })} className={`rounded-lg px-4 py-3 text-sm font-black ${item.is_available ? "bg-emerald-700 text-white" : "bg-zinc-800 text-zinc-300"}`}>
                    {item.is_available ? "Available" : "Unavailable"}
                  </button>
                </div>
                {item.option_groups.length > 0 && (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {item.option_groups.map((group) => (
                      <div key={group.id} className="rounded-lg bg-zinc-950 p-3">
                        <div className="text-sm font-black text-zinc-300">{group.name}</div>
                        <div className="mt-2 grid gap-2">
                          {group.options.map((option) => (
                            <button key={option.id} disabled={busy === `option-${option.id}`} onClick={() => patch(`option-${option.id}`, `options/${option.id}`, { available: !option.available })} className={`flex justify-between rounded-lg px-3 py-2 text-sm font-bold ${option.available ? "bg-emerald-950/50 text-emerald-200" : "bg-zinc-900 text-zinc-500"}`}>
                              <span>{option.name}</span>
                              <span>{option.available ? "On" : "Off"}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
