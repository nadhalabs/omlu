"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createStaffTableOrder,
  getStaffTableDetail,
  getStaffTables,
  startStaffTableSession,
  StaffTableDetail,
  StaffTableSummary,
} from "@/lib/staffTables";
import { MenuOptionGroup, SelectedOptionRequest } from "@/lib/types";
import { useRealtime } from "@/lib/realtime";

type CartLine = {
  menu_item_id: number;
  name: string;
  price: string;
  quantity: number;
  item_note: string;
  selected_options: SelectedOptionRequest[];
};

type StaffMenuItem = {
  id: number;
  name_en: string;
  price: string;
  is_available: boolean;
  category?: string;
  option_groups?: MenuOptionGroup[];
};

function cartKey(tableId: number | null) {
  return tableId ? `staff-order-cart-${tableId}` : "staff-order-cart";
}

function currency(value: number) {
  return `₹${value.toFixed(2)}`;
}

export default function NewStaffOrderClient({ initialTableId }: { initialTableId: number | null }) {
  const router = useRouter();
  const [tables, setTables] = useState<StaffTableSummary[]>([]);
  const [tableId, setTableId] = useState<number | null>(initialTableId);
  const [detail, setDetail] = useState<StaffTableDetail | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderNote, setOrderNote] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | "all">("all");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [customisingItem, setCustomisingItem] = useState<StaffMenuItem | null>(null);
  const [draftOptions, setDraftOptions] = useState<Record<number, Record<number, number>>>({});

  useEffect(() => {
    getStaffTables("occupied")
      .then((data) => {
        setTables(data.items);
        if (!tableId && data.items.length > 0) setTableId(data.items[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load tables."));
  }, [tableId]);

  const loadDetail = useCallback(async () => {
    if (!tableId) {
      setLoading(false);
      setDetail(null);
      return;
    }
    setLoading(true);
    try {
      setDetail(await getStaffTableDetail(tableId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load table.");
    } finally {
      setLoading(false);
    }
  }, [tableId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadDetail(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadDetail]);

  const realtimeStatus = useRealtime({
    target: { kind: "staff", channel: "availability" },
    onEvent: () => void loadDetail(),
    onReconnect: () => void loadDetail(),
  });

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const saved = window.localStorage.getItem(cartKey(tableId));
      if (!saved) {
        setCart([]);
        setOrderNote("");
        return;
      }
      try {
      const parsed = JSON.parse(saved) as { cart?: Partial<CartLine>[]; orderNote?: string };
      setCart(Array.isArray(parsed.cart) ? parsed.cart.map((line) => ({
        menu_item_id: Number(line.menu_item_id),
        name: String(line.name || ""),
        price: String(line.price || "0.00"),
        quantity: Number(line.quantity || 1),
        item_note: String(line.item_note || ""),
        selected_options: Array.isArray(line.selected_options) ? line.selected_options : [],
      })) : []);
        setOrderNote(typeof parsed.orderNote === "string" ? parsed.orderNote : "");
      } catch {
        setCart([]);
        setOrderNote("");
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [tableId]);

  useEffect(() => {
    if (!tableId) return;
    window.localStorage.setItem(cartKey(tableId), JSON.stringify({ cart, orderNote }));
  }, [cart, orderNote, tableId]);

  const categories = useMemo(() => detail?.menu_categories ?? [], [detail?.menu_categories]);
  const menuItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return categories
      .filter((category) => categoryId === "all" || category.id === categoryId)
      .flatMap((category) => category.items.map((item) => ({ ...item, category: category.name_en })))
      .filter((item) => !query || item.name_en.toLowerCase().includes(query));
  }, [categories, categoryId, search]);

  const selectedOptionsFromDraft = (): SelectedOptionRequest[] =>
    Object.entries(draftOptions).flatMap(([groupId, options]) =>
      Object.entries(options)
        .filter(([, quantity]) => quantity > 0)
        .map(([optionId, quantity]) => ({ group_id: Number(groupId), option_id: Number(optionId), quantity }))
    );

  const optionPrice = (item: StaffMenuItem, selectedOptions: SelectedOptionRequest[]) => {
    const groups = item.option_groups || [];
    const variant = selectedOptions
      .map((selection) => groups.find((group) => group.id === selection.group_id)?.options.find((option) => option.id === selection.option_id))
      .find((option) => option && groups.find((group) => group.id === option.group_id)?.type === "variant");
    const addons = selectedOptions.reduce((sum, selection) => {
      const group = groups.find((candidate) => candidate.id === selection.group_id);
      const option = group?.options.find((candidate) => candidate.id === selection.option_id);
      if (!group || !option || group.type !== "addon") return sum;
      return sum + Number(option.price_delta) * selection.quantity;
    }, 0);
    return (variant ? Number(variant.price_delta) : Number(item.price)) + addons;
  };

  const hasRequiredSelections = (item: StaffMenuItem, selectedOptions: SelectedOptionRequest[]) =>
    (item.option_groups || []).every((group) => {
      const count = selectedOptions.filter((selection) => selection.group_id === group.id).reduce((sum, selection) => sum + selection.quantity, 0);
      const min = Math.max(group.minimum_selections, group.required ? 1 : 0);
      return count >= min && (!group.maximum_selections || count <= group.maximum_selections);
    });

  const optionLabels = (line: CartLine) => {
    const item = menuItems.find((candidate) => candidate.id === line.menu_item_id);
    const groups = item?.option_groups || [];
    return line.selected_options.flatMap((selection) => {
      const group = groups.find((candidate) => candidate.id === selection.group_id);
      const option = group?.options.find((candidate) => candidate.id === selection.option_id);
      return option ? [`${group?.name}: ${option.name}${selection.quantity > 1 ? ` x${selection.quantity}` : ""}`] : [];
    });
  };

  const subtotal = cart.reduce((sum, line) => {
    const item = menuItems.find((candidate) => candidate.id === line.menu_item_id);
    return sum + (item ? optionPrice(item, line.selected_options) : Number(line.price)) * line.quantity;
  }, 0);

  const optionSignature = (options: SelectedOptionRequest[]) =>
    JSON.stringify(options.slice().sort((a, b) => a.group_id - b.group_id || a.option_id - b.option_id));

  const addItemWithOptions = (item: StaffMenuItem, selectedOptions: SelectedOptionRequest[] = []) => {
    if (!item.is_available) return;
    setSuccess(null);
    setCart((prev) => {
      const signature = optionSignature(selectedOptions);
      const existing = prev.find((line) => line.menu_item_id === item.id && optionSignature(line.selected_options) === signature);
      if (existing) {
        return prev.map((line) => line === existing ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...prev, { menu_item_id: item.id, name: item.name_en, price: optionPrice(item, selectedOptions).toFixed(2), quantity: 1, item_note: "", selected_options: selectedOptions }];
    });
  };

  const addItem = (item: StaffMenuItem) => {
    if ((item.option_groups || []).length > 0) {
      setDraftOptions({});
      setCustomisingItem(item);
      return;
    }
    addItemWithOptions(item);
  };

  const setQuantity = (index: number, quantity: number) => {
    setCart((prev) => prev.flatMap((line, lineIndex) => {
      if (lineIndex !== index) return [line];
      if (quantity <= 0) return [];
      return [{ ...line, quantity }];
    }));
  };

  const setNote = (index: number, note: string) => {
    setCart((prev) => prev.map((line, lineIndex) => lineIndex === index ? { ...line, item_note: note } : line));
  };

  const toggleDraftOption = (groupId: number, optionId: number, multi: boolean) => {
    setDraftOptions((prev) => {
      const current = prev[groupId] || {};
      const selected = Boolean(current[optionId]);
      if (!multi) return { ...prev, [groupId]: selected ? {} : { [optionId]: 1 } };
      const next = { ...current };
      if (selected) delete next[optionId];
      else next[optionId] = 1;
      return { ...prev, [groupId]: next };
    });
  };

  const handleStartSession = async () => {
    if (!tableId) return;
    setStarting(true);
    setError(null);
    try {
      await startStaffTableSession(tableId);
      await loadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start session.");
    } finally {
      setStarting(false);
    }
  };

  const handleSubmit = async () => {
    if (!tableId || cart.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const order = await createStaffTableOrder(tableId, {
        items: cart.map((line) => ({
          menu_item_id: line.menu_item_id,
          quantity: line.quantity,
          item_note: line.item_note.trim() || null,
          selected_options: line.selected_options,
        })),
        customer_note: orderNote.trim() || null,
      });
      setCart([]);
      setOrderNote("");
      window.localStorage.removeItem(cartKey(tableId));
      setSuccess(`Order ${order.order_number} sent to kitchen.`);
      await loadDetail();
      window.setTimeout(() => router.replace(`/staff/tables/${tableId}`), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit order.");
    } finally {
      setSubmitting(false);
    }
  };

  const activeTable = detail?.table ?? tables.find((table) => table.id === tableId);
  const canOrder = Boolean(detail?.session && detail.session.status === "open");

  return (
    <div className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
      <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[1fr_380px]">
        <main className="flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Link href="/staff/tables" className="text-sm font-bold text-amber-400">Back to tables</Link>
              <h1 className="mt-2 text-3xl font-black text-white">New Staff Order</h1>
              <p className="mt-1 text-sm text-zinc-500">Staff-assisted ordering for the selected table.</p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-zinc-600">Real-time: {realtimeStatus}</p>
            </div>
            {activeTable && <Link href={`/staff/tables/${activeTable.id}`} className="rounded-lg border border-zinc-800 px-4 py-3 text-sm font-bold text-zinc-200">Table {activeTable.table_number}</Link>}
          </div>

          {error && <div className="rounded-lg border border-red-800/40 bg-red-950/20 p-4 text-sm text-red-300">{error}</div>}
          {success && <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 p-4 text-sm text-emerald-300">{success}</div>}

          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <label className="text-xs font-black uppercase tracking-wider text-zinc-500">Table</label>
            <select
              value={tableId ?? ""}
              onChange={(event) => {
                const nextTableId = event.target.value ? Number(event.target.value) : null;
                setTableId(nextTableId);
                if (nextTableId) router.replace(`/staff/orders/new?tableId=${nextTableId}`);
              }}
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 text-base font-bold text-white outline-none focus:border-amber-500"
            >
              <option value="">Choose table</option>
              {tables.map((table) => (
                <option key={table.id} value={table.id}>Table {table.table_number} · {table.session_status || table.state}</option>
              ))}
            </select>
          </section>

          {loading ? (
            <div className="text-sm text-zinc-500">Loading menu...</div>
          ) : tableId && !detail?.session ? (
            <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
              <h2 className="text-xl font-black text-white">No active session</h2>
              <p className="mt-2 text-sm text-zinc-500">Start a table session before placing an order.</p>
              <button
                disabled={starting}
                onClick={handleStartSession}
                className="mt-5 rounded-lg bg-amber-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                {starting ? "Starting..." : "Start Session"}
              </button>
            </section>
          ) : (
            <>
              <section className="grid gap-3 md:grid-cols-[1fr_220px]">
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search menu items"
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-4 text-base font-bold text-white outline-none focus:border-amber-500"
                />
                <select
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value === "all" ? "all" : Number(event.target.value))}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-4 text-base font-bold text-white outline-none focus:border-amber-500"
                >
                  <option value="all">All categories</option>
                  {categories.map((category) => <option key={category.id} value={category.id}>{category.name_en}</option>)}
                </select>
              </section>

              {!canOrder && (
                <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-4 text-sm text-amber-200">
                  Ordering is not available because this session is {detail?.session?.status || "not open"}.
                </div>
              )}

              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {menuItems.length === 0 ? (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-sm text-zinc-500 sm:col-span-2 xl:col-span-3">No menu items found.</div>
                ) : menuItems.map((item) => (
                  <button
                    key={item.id}
                    disabled={!item.is_available || !canOrder}
                    onClick={() => addItem(item)}
                    className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-left transition hover:border-amber-700/60 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-black text-white">{item.name_en}</div>
                        <div className="mt-1 text-xs font-bold uppercase tracking-wider text-zinc-500">{item.category}</div>
                      </div>
                      <div className="font-black text-amber-300">₹{item.price}</div>
                    </div>
                    {!item.is_available && <div className="mt-3 text-xs font-bold text-red-300">Unavailable</div>}
                    {(item.option_groups || []).length > 0 && <div className="mt-3 text-xs font-bold text-amber-300">Choose options</div>}
                  </button>
                ))}
              </section>
            </>
          )}
        </main>

        {customisingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
              <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
                <div>
                  <h2 className="text-xl font-black text-white">{customisingItem.name_en}</h2>
                  <p className="mt-1 text-xs font-bold text-zinc-500">Select required options.</p>
                </div>
                <button onClick={() => setCustomisingItem(null)} className="text-sm font-bold text-zinc-400">Close</button>
              </div>
              <div className="max-h-[55vh] overflow-y-auto p-5">
                {(customisingItem.option_groups || []).map((group) => {
                  const selectedCount = Object.values(draftOptions[group.id] || {}).reduce((sum, quantity) => sum + quantity, 0);
                  const min = Math.max(group.minimum_selections, group.required ? 1 : 0);
                  const max = group.maximum_selections;
                  const multi = group.type === "addon" && max !== 1;
                  return (
                    <section key={group.id} className="mb-4 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-black text-white">{group.name}</div>
                          <div className="text-xs text-zinc-500">{min > 0 ? `Choose ${min}` : "Optional"}{max ? ` · up to ${max}` : ""}</div>
                        </div>
                        {selectedCount < min && <span className="text-xs font-bold text-red-300">Required</span>}
                      </div>
                      <div className="mt-3 grid gap-2">
                        {group.options.map((option) => {
                          const checked = Boolean(draftOptions[group.id]?.[option.id]);
                          const disabled = !option.available || (!checked && Boolean(max) && selectedCount >= max);
                          return (
                            <button
                              key={option.id}
                              disabled={disabled}
                              onClick={() => toggleDraftOption(group.id, option.id, multi)}
                              className={`flex justify-between rounded-lg border px-3 py-3 text-sm font-bold disabled:opacity-40 ${checked ? "border-amber-600 bg-amber-950/30 text-white" : "border-zinc-800 bg-zinc-900 text-zinc-300"}`}
                            >
                              <span>{option.name}</span>
                              <span>₹{Number(option.price_delta).toFixed(2)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
              <div className="border-t border-zinc-800 p-5">
                <div className="mb-3 flex justify-between text-sm font-bold text-zinc-300">
                  <span>Item price</span>
                  <span>{currency(optionPrice(customisingItem, selectedOptionsFromDraft()))}</span>
                </div>
                <button
                  disabled={!hasRequiredSelections(customisingItem, selectedOptionsFromDraft())}
                  onClick={() => {
                    addItemWithOptions(customisingItem, selectedOptionsFromDraft());
                    setCustomisingItem(null);
                    setDraftOptions({});
                  }}
                  className="w-full rounded-lg bg-amber-600 px-5 py-4 font-black text-white disabled:opacity-50"
                >
                  Add to cart
                </button>
              </div>
            </div>
          </div>
        )}

        <aside className="h-fit rounded-xl border border-zinc-800 bg-zinc-900 p-5 lg:sticky lg:top-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-black text-white">Cart</h2>
            <div className="text-sm font-black text-amber-300">{currency(subtotal)}</div>
          </div>
          {cart.length === 0 ? (
            <p className="mt-6 rounded-lg bg-zinc-950 p-5 text-center text-sm text-zinc-500">Select available menu items to build the order.</p>
          ) : (
            <div className="mt-5 flex flex-col gap-3">
              {cart.map((line, index) => (
                <div key={`${line.menu_item_id}-${index}`} className="rounded-lg bg-zinc-950 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-black text-white">{line.name}</div>
                    <div className="text-sm font-bold text-zinc-300">{currency(Number(line.price) * line.quantity)}</div>
                  </div>
                  {optionLabels(line).length > 0 && (
                    <div className="mt-2 grid gap-1 text-xs text-zinc-500">
                      {optionLabels(line).map((label) => <div key={label}>{label}</div>)}
                    </div>
                  )}
                  <div className="mt-3 flex items-center gap-2">
                    <button onClick={() => setQuantity(index, line.quantity - 1)} className="h-11 w-11 rounded-lg bg-zinc-800 text-xl font-black">-</button>
                    <input
                      value={line.quantity}
                      onChange={(event) => setQuantity(index, Number(event.target.value) || 0)}
                      className="h-11 w-16 rounded-lg border border-zinc-700 bg-zinc-900 text-center font-black text-white"
                      inputMode="numeric"
                    />
                    <button onClick={() => setQuantity(index, line.quantity + 1)} className="h-11 w-11 rounded-lg bg-zinc-800 text-xl font-black">+</button>
                  </div>
                  <input
                    value={line.item_note}
                    onChange={(event) => setNote(index, event.target.value)}
                    placeholder="Item note"
                    className="mt-3 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-3 text-sm text-white outline-none focus:border-amber-500"
                  />
                </div>
              ))}
            </div>
          )}
          <textarea
            value={orderNote}
            onChange={(event) => setOrderNote(event.target.value)}
            placeholder="Overall order note"
            className="mt-4 min-h-24 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-3 text-sm text-white outline-none focus:border-amber-500"
          />
          <button
            disabled={!canOrder || cart.length === 0 || submitting}
            onClick={handleSubmit}
            className="mt-4 w-full rounded-lg bg-amber-600 px-5 py-4 text-base font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Sending..." : "Send to Kitchen"}
          </button>
        </aside>
      </div>
    </div>
  );
}
