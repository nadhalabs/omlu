"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StaffBottomNav } from "@/components/staff/StaffBottomNav";
import {
  createStaffTableOrder,
  getStaffTableDetail,
  getStaffTables,
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

function fallbackImageLabel(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || "OM";
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
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [customisingItem, setCustomisingItem] = useState<StaffMenuItem | null>(null);
  const [draftOptions, setDraftOptions] = useState<Record<number, Record<number, number>>>({});

  useEffect(() => {
    getStaffTables("all")
      .then((data) => setTables(data.items))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load tables."));
  }, []);

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

  useRealtime({
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
  const allMenuItems = useMemo(() => categories.flatMap((category) => category.items.map((item) => ({ ...item, category: category.name_en }))), [categories]);
  const menuItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allMenuItems
      .filter((item) => categoryId === "all" || categories.find((category) => category.id === categoryId)?.items.some((candidate) => candidate.id === item.id))
      .filter((item) => !query || item.name_en.toLowerCase().includes(query));
  }, [allMenuItems, categories, categoryId, search]);

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
    const item = allMenuItems.find((candidate) => candidate.id === line.menu_item_id);
    const groups = item?.option_groups || [];
    return line.selected_options.flatMap((selection) => {
      const group = groups.find((candidate) => candidate.id === selection.group_id);
      const option = group?.options.find((candidate) => candidate.id === selection.option_id);
      return option ? [`${group?.name}: ${option.name}${selection.quantity > 1 ? ` x${selection.quantity}` : ""}`] : [];
    });
  };

  const subtotal = cart.reduce((sum, line) => sum + Number(line.price) * line.quantity, 0);
  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const activeTable = detail?.table ?? tables.find((table) => table.id === tableId);
  const canOrder = Boolean(tableId && (!detail?.session || detail.session.status === "open"));

  const optionSignature = (options: SelectedOptionRequest[]) =>
    JSON.stringify(options.slice().sort((a, b) => a.group_id - b.group_id || a.option_id - b.option_id));

  const lineQuantityForItem = (itemId: number) => cart.filter((line) => line.menu_item_id === itemId).reduce((sum, line) => sum + line.quantity, 0);

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

  const decrementFirstItem = (itemId: number) => {
    const index = cart.findIndex((line) => line.menu_item_id === itemId);
    if (index >= 0) setQuantity(index, cart[index].quantity - 1);
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

  const handleSubmit = async () => {
    if (!tableId || cart.length === 0 || submitting || !canOrder) return;
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
      setSuccess(`Order ${order.order_number} sent.`);
      await loadDetail();
      window.setTimeout(() => router.replace(`/staff/tables/${tableId}`), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit order.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fff6f6] px-4 pb-44 pt-5 text-zinc-950">
      <div className="mx-auto flex max-w-md flex-col gap-5 sm:max-w-xl lg:max-w-5xl">
        <header className="flex items-center justify-between">
          <Link href="/staff/tables" className="flex h-12 w-12 items-center justify-center rounded-full text-3xl text-zinc-950" aria-label="Back to tables">
            ‹
          </Link>
          <div className="text-center">
            <p className="text-xs font-bold text-zinc-400">New Order</p>
            <h1 className="text-2xl font-black text-red-700">Table {activeTable?.table_number || tableId}</h1>
          </div>
          <Link href="/staff/requests" className="flex h-12 w-12 items-center justify-center rounded-full text-2xl text-zinc-950" aria-label="Requests">
            ⌕
          </Link>
        </header>

        {error && <div className="rounded-3xl border border-red-200 bg-white p-4 text-sm font-bold text-red-700">{error}</div>}
        {success && <div className="rounded-3xl border border-green-200 bg-white p-4 text-sm font-bold text-green-700">{success}</div>}

        <section className="rounded-3xl bg-white p-4 shadow-sm shadow-red-100/60">
          <label className="text-xs font-black uppercase tracking-wide text-zinc-400">Table</label>
          <select
            value={tableId ?? ""}
            onChange={(event) => {
              const nextTableId = event.target.value ? Number(event.target.value) : null;
              setTableId(nextTableId);
              if (nextTableId) router.replace(`/staff/orders/new?tableId=${nextTableId}`);
            }}
            className="mt-2 h-12 w-full rounded-2xl border border-zinc-200 bg-[#fffafa] px-4 text-base font-black text-zinc-950 outline-none"
          >
            <option value="">Choose table</option>
            {tables.map((table) => (
              <option key={table.id} value={table.id}>Table {table.table_number}</option>
            ))}
          </select>
        </section>

        {loading ? (
          <div className="rounded-3xl bg-white p-8 text-center text-sm font-bold text-zinc-500">Loading menu...</div>
        ) : (
          <>
            <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm shadow-red-100/50">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search items..."
                className="h-10 w-full bg-transparent text-base font-semibold text-zinc-900 outline-none placeholder:text-zinc-400"
              />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              <button type="button" onClick={() => setCategoryId("all")} className={`h-10 whitespace-nowrap rounded-full px-5 text-sm font-bold ${categoryId === "all" ? "bg-red-700 text-white" : "bg-white text-zinc-600"}`}>
                All
              </button>
              {categories.map((category) => (
                <button key={category.id} type="button" onClick={() => setCategoryId(category.id)} className={`h-10 whitespace-nowrap rounded-full px-5 text-sm font-bold ${categoryId === category.id ? "bg-red-700 text-white" : "bg-white text-zinc-600"}`}>
                  {category.name_en}
                </button>
              ))}
            </div>

            {detail?.session && detail.session.status !== "open" && (
              <div className="rounded-3xl border border-amber-200 bg-white p-4 text-sm font-bold text-amber-700">Ordering is paused for this table.</div>
            )}

            <section className="grid gap-3 lg:grid-cols-2">
              {menuItems.length === 0 ? (
                <div className="rounded-3xl bg-white p-8 text-center text-sm font-semibold text-zinc-500">No menu items found.</div>
              ) : menuItems.map((item) => {
                const quantity = lineQuantityForItem(item.id);
                return (
                  <div key={item.id} className="flex min-h-28 items-center gap-4 rounded-3xl border border-red-100 bg-white p-4 shadow-sm shadow-red-100/60">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-50 to-amber-50 text-lg font-black text-red-700">
                      {fallbackImageLabel(item.name_en)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-black text-zinc-950">{item.name_en}</h2>
                      <p className="mt-1 text-lg font-black text-red-700">₹{item.price}</p>
                      {!item.is_available && <p className="mt-1 text-xs font-bold text-zinc-400">Unavailable</p>}
                    </div>
                    {quantity > 0 ? (
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => decrementFirstItem(item.id)} className="flex h-11 w-11 items-center justify-center rounded-full bg-red-700 text-2xl font-black text-white">-</button>
                        <span className="min-w-5 text-center text-xl font-black">{quantity}</span>
                        <button type="button" onClick={() => addItem(item)} className="flex h-11 w-11 items-center justify-center rounded-full bg-red-700 text-2xl font-black text-white">+</button>
                      </div>
                    ) : (
                      <button type="button" disabled={!item.is_available || !canOrder} onClick={() => addItem(item)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-700 text-3xl font-light text-white disabled:bg-zinc-200">
                        +
                      </button>
                    )}
                  </div>
                );
              })}
            </section>
          </>
        )}

        <section id="cart-panel" className="rounded-3xl bg-white p-4 shadow-sm shadow-red-100/60">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black">Cart</h2>
            <span className="text-lg font-black text-red-700">{currency(subtotal)}</span>
          </div>
          {cart.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-[#fff6f6] p-5 text-center text-sm font-semibold text-zinc-500">Add items for this table.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {cart.map((line, index) => (
                <div key={`${line.menu_item_id}-${optionSignature(line.selected_options)}-${index}`} className="rounded-3xl border border-red-100 bg-[#fffafa] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-black">{line.name}</h3>
                      <p className="text-sm font-bold text-red-700">{currency(Number(line.price) * line.quantity)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setQuantity(index, line.quantity - 1)} className="flex h-11 w-11 items-center justify-center rounded-full bg-red-700 text-2xl font-black text-white">-</button>
                      <span className="min-w-5 text-center text-xl font-black">{line.quantity}</span>
                      <button type="button" onClick={() => setQuantity(index, line.quantity + 1)} className="flex h-11 w-11 items-center justify-center rounded-full bg-red-700 text-2xl font-black text-white">+</button>
                    </div>
                  </div>
                  {optionLabels(line).length > 0 && <div className="mt-2 text-xs font-semibold text-zinc-500">{optionLabels(line).join(", ")}</div>}
                  <input value={line.item_note} onChange={(event) => setNote(index, event.target.value)} placeholder="Add note" className="mt-3 h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold outline-none" />
                </div>
              ))}
              <textarea value={orderNote} onChange={(event) => setOrderNote(event.target.value)} placeholder="Order note" className="min-h-20 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold outline-none" />
              <button type="button" disabled={!canOrder || cart.length === 0 || submitting} onClick={handleSubmit} className="h-14 rounded-2xl bg-red-700 text-base font-black text-white disabled:bg-zinc-300">
                {submitting ? "Sending..." : "Send Order"}
              </button>
            </div>
          )}
        </section>
      </div>

      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-24 z-30 mx-auto max-w-md px-4 sm:max-w-xl">
          <div className="rounded-3xl border border-red-100 bg-white p-4 shadow-lg shadow-red-100">
            <div className="mb-3 flex items-center justify-between text-sm font-bold">
              <span>{itemCount} item{itemCount === 1 ? "" : "s"}</span>
              <span className="text-xl font-black text-red-700">{currency(subtotal)}</span>
            </div>
            <button type="button" disabled={!canOrder || submitting} onClick={handleSubmit} className="h-14 w-full rounded-2xl bg-red-700 text-base font-black text-white disabled:bg-zinc-300">
              {submitting ? "Sending..." : "Send Order"}
            </button>
          </div>
        </div>
      )}

      {customisingItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[88vh] w-full max-w-md overflow-hidden rounded-[28px] bg-white">
            <div className="flex items-start justify-between gap-4 border-b border-red-100 p-5">
              <div>
                <h2 className="text-xl font-black text-zinc-950">{customisingItem.name_en}</h2>
                <p className="mt-1 text-sm font-semibold text-zinc-500">Choose options</p>
              </div>
              <button onClick={() => setCustomisingItem(null)} className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-xl font-black">×</button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-5">
              {(customisingItem.option_groups || []).map((group) => {
                const selectedCount = Object.values(draftOptions[group.id] || {}).reduce((sum, quantity) => sum + quantity, 0);
                const min = Math.max(group.minimum_selections, group.required ? 1 : 0);
                const max = group.maximum_selections;
                const multi = group.type === "addon" && max !== 1;
                return (
                  <section key={group.id} className="mb-4 rounded-3xl border border-red-100 bg-[#fffafa] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-black text-zinc-950">{group.name}</div>
                        <div className="text-xs font-semibold text-zinc-500">{min > 0 ? `Choose ${min}` : "Optional"}{max ? ` · up to ${max}` : ""}</div>
                      </div>
                      {selectedCount < min && <span className="text-xs font-bold text-red-700">Required</span>}
                    </div>
                    <div className="mt-3 grid gap-2">
                      {group.options.map((option) => {
                        const checked = Boolean(draftOptions[group.id]?.[option.id]);
                        const disabled = !option.available || (!checked && Boolean(max) && selectedCount >= max);
                        return (
                          <button key={option.id} type="button" disabled={disabled} onClick={() => toggleDraftOption(group.id, option.id, multi)} className={`flex min-h-12 justify-between rounded-2xl border px-4 py-3 text-left text-sm font-bold disabled:opacity-40 ${checked ? "border-red-300 bg-red-50 text-red-800" : "border-zinc-200 bg-white text-zinc-700"}`}>
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
            <div className="border-t border-red-100 p-5">
              <button
                disabled={!hasRequiredSelections(customisingItem, selectedOptionsFromDraft())}
                onClick={() => {
                  addItemWithOptions(customisingItem, selectedOptionsFromDraft());
                  setCustomisingItem(null);
                  setDraftOptions({});
                }}
                className="h-14 w-full rounded-2xl bg-red-700 font-black text-white disabled:bg-zinc-300"
              >
                Add to cart
              </button>
            </div>
          </div>
        </div>
      )}

      <StaffBottomNav active="order" />
    </div>
  );
}
