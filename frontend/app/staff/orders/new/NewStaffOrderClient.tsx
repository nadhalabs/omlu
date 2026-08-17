"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StaffBottomNav } from "@/components/staff/StaffBottomNav";
import {
  createStaffTableOrder,
  createStaffServedItem,
  getStaffTableDetail,
  getStaffTables,
  StaffTableDetail,
  StaffTableSummary,
} from "@/lib/staffTables";
import { MenuOptionGroup, SelectedOptionRequest } from "@/lib/types";
import { useRealtime } from "@/lib/realtime";
import { authenticatedCacheKey } from "@/lib/authRuntime.mjs";

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
  return `omlu:auth:${authenticatedCacheKey("staff-order-cart", { tableId })}`;
}

function currency(value: number) {
  return `₹${value.toFixed(2)}`;
}

function fallbackImageLabel(name: string) {
  return name.trim().slice(0, 2).toUpperCase() || "OM";
}

export default function NewStaffOrderClient({ initialTableId, servedEntry = false }: { initialTableId: number | null; servedEntry?: boolean }) {
  const router = useRouter();
  const [tables, setTables] = useState<StaffTableSummary[]>([]);
  const [tableId, setTableId] = useState<number | null>(initialTableId);
  const [detail, setDetail] = useState<StaffTableDetail | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderNote, setOrderNote] = useState("");
  const [lateEntryReason, setLateEntryReason] = useState("");
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
    if (!customisingItem) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setCustomisingItem(null);
      setDraftOptions({});
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [customisingItem]);

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
  const canOrder = Boolean(tableId && (!detail?.session || detail.session.status === "open" || (detail.session.status === "payment_requested" && detail.session.bill?.status === "draft")));

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
      if (servedEntry && !lateEntryReason.trim()) throw new Error("Explain why this served item was missing.");
      const payload = {
        items: cart.map((line) => ({
          menu_item_id: line.menu_item_id,
          quantity: line.quantity,
          item_note: line.item_note.trim() || null,
          selected_options: line.selected_options,
        })),
        customer_note: orderNote.trim() || null,
      };
      const order = servedEntry
        ? await createStaffServedItem(tableId, { ...payload, late_entry_reason: lateEntryReason.trim() })
        : await createStaffTableOrder(tableId, payload);
      setCart([]);
      setOrderNote("");
      window.localStorage.removeItem(cartKey(tableId));
      setSuccess(servedEntry ? `Served item ${order.order_number} added without a kitchen ticket.` : `Order ${order.order_number} sent to kitchen.`);
      router.replace(`/staff/tables/${tableId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit order.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--omlu-background)] px-4 pb-44 pt-5 text-[var(--omlu-text-primary)]">
      <div className="mx-auto flex max-w-md flex-col gap-5 sm:max-w-xl lg:max-w-5xl">
        <header className="flex items-center justify-between">
          <Link href="/staff/tables" className="flex h-12 w-12 items-center justify-center rounded-full text-3xl text-[var(--omlu-text-primary)]" aria-label="Back to tables">
            ‹
          </Link>
          <div className="text-center">
            <p className="text-xs font-bold text-[var(--omlu-text-secondary)]">{servedEntry ? "Add Served Item · No kitchen ticket" : "Add Item · Sends to kitchen"}</p>
            <h1 className="text-2xl font-black text-orange-600">Table {activeTable?.table_number || tableId}</h1>
          </div>
          <Link href="/staff/requests" className="flex h-12 w-12 items-center justify-center rounded-full text-2xl text-[var(--omlu-text-primary)]" aria-label="Requests">
            ⌕
          </Link>
        </header>

        {error && <div className="rounded-3xl border border-red-200 bg-[var(--omlu-primary-surface)] p-4 text-sm font-bold text-red-700">{error}</div>}
        {success && <div className="rounded-3xl border border-green-200 bg-[var(--omlu-primary-surface)] p-4 text-sm font-bold text-green-700">{success}</div>}

        <section className="rounded-3xl bg-[var(--omlu-primary-surface)] p-4 shadow-sm shadow-orange-100/60">
          <label className="text-xs font-black uppercase tracking-wide text-[var(--omlu-text-secondary)]">Table</label>
          <select
            value={tableId ?? ""}
            onChange={(event) => {
              const nextTableId = event.target.value ? Number(event.target.value) : null;
              setTableId(nextTableId);
              if (nextTableId) router.replace(`/staff/orders/new?tableId=${nextTableId}`);
            }}
            className="mt-2 h-12 w-full rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-4 text-base font-black text-[var(--omlu-text-primary)] outline-none"
          >
            <option value="">Choose table</option>
            {tables.map((table) => (
              <option key={table.id} value={table.id}>Table {table.table_number}</option>
            ))}
          </select>
        </section>

        {loading ? (
          <div className="rounded-3xl bg-[var(--omlu-primary-surface)] p-8 text-center text-sm font-bold text-[var(--omlu-text-secondary)]">Loading menu...</div>
        ) : (
          <>
            <div className="rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-4 py-3 shadow-sm shadow-orange-100/50">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search items..."
                className="h-10 w-full bg-transparent text-base font-semibold text-[var(--omlu-text-primary)] outline-none placeholder:text-[var(--omlu-text-secondary)]"
              />
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              <button type="button" onClick={() => setCategoryId("all")} className={`h-10 whitespace-nowrap rounded-full px-5 text-sm font-bold ${categoryId === "all" ? "bg-orange-600 text-[var(--omlu-primary-action-text)]" : "bg-[var(--omlu-primary-surface)] text-[var(--omlu-text-secondary)]"}`}>
                All
              </button>
              {categories.map((category) => (
                <button key={category.id} type="button" onClick={() => setCategoryId(category.id)} className={`h-10 whitespace-nowrap rounded-full px-5 text-sm font-bold ${categoryId === category.id ? "bg-orange-600 text-[var(--omlu-primary-action-text)]" : "bg-[var(--omlu-primary-surface)] text-[var(--omlu-text-secondary)]"}`}>
                  {category.name_en}
                </button>
              ))}
            </div>

            {detail?.session && detail.session.status !== "open" && (
              <div className="rounded-3xl border border-orange-200 bg-[var(--omlu-primary-surface)] p-4 text-sm font-bold text-orange-700">Ordering is paused for this table.</div>
            )}

            <section className="grid gap-3 lg:grid-cols-2">
              {menuItems.length === 0 ? (
                <div className="rounded-3xl bg-[var(--omlu-primary-surface)] p-8 text-center text-sm font-semibold text-[var(--omlu-text-secondary)]">No menu items found.</div>
              ) : menuItems.map((item) => {
                const quantity = lineQuantityForItem(item.id);
                return (
                  <div key={item.id} className="flex min-h-28 items-center gap-4 rounded-3xl border border-orange-100 bg-[var(--omlu-primary-surface)] p-4 shadow-sm shadow-orange-100/60">
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-50 to-orange-50 text-lg font-black text-orange-600">
                      {fallbackImageLabel(item.name_en)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-black text-[var(--omlu-text-primary)]">{item.name_en}</h2>
                      <p className="mt-1 text-lg font-black text-orange-600">₹{item.price}</p>
                      {!item.is_available && <p className="mt-1 inline-flex rounded-md border border-red-300 bg-red-100 px-2 py-1 text-xs font-bold text-red-700">Unavailable</p>}
                    </div>
                    {quantity > 0 ? (
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => decrementFirstItem(item.id)} className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-600 text-2xl font-black text-[var(--omlu-primary-action-text)]">-</button>
                        <span className="min-w-5 text-center text-xl font-black">{quantity}</span>
                        <button type="button" onClick={() => addItem(item)} className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-600 text-2xl font-black text-[var(--omlu-primary-action-text)]">+</button>
                      </div>
                    ) : (
                      <button type="button" disabled={!item.is_available || !canOrder} onClick={() => addItem(item)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-600 text-3xl font-light text-[var(--omlu-primary-action-text)] disabled:bg-[var(--omlu-muted-surface)]">
                        +
                      </button>
                    )}
                  </div>
                );
              })}
            </section>
          </>
        )}

        <section id="cart-panel" className="rounded-3xl bg-[var(--omlu-primary-surface)] p-4 shadow-sm shadow-orange-100/60">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black">Cart</h2>
            <span className="text-lg font-black text-orange-600">{currency(subtotal)}</span>
          </div>
          {cart.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-[var(--omlu-surface-muted)] p-5 text-center text-sm font-semibold text-[var(--omlu-text-secondary)]">Add items for this table.</p>
          ) : (
            <div className="mt-4 grid gap-3">
              {cart.map((line, index) => (
                <div key={`${line.menu_item_id}-${optionSignature(line.selected_options)}-${index}`} className="rounded-3xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-black">{line.name}</h3>
                      <p className="text-sm font-bold text-orange-600">{currency(Number(line.price) * line.quantity)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setQuantity(index, line.quantity - 1)} className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-600 text-2xl font-black text-[var(--omlu-primary-action-text)]">-</button>
                      <span className="min-w-5 text-center text-xl font-black">{line.quantity}</span>
                      <button type="button" onClick={() => setQuantity(index, line.quantity + 1)} className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-600 text-2xl font-black text-[var(--omlu-primary-action-text)]">+</button>
                    </div>
                  </div>
                  {optionLabels(line).length > 0 && <div className="mt-2 text-xs font-semibold text-[var(--omlu-text-secondary)]">{optionLabels(line).join(", ")}</div>}
                  <input value={line.item_note} onChange={(event) => setNote(index, event.target.value)} placeholder="Add note" className="mt-3 h-11 w-full rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-4 text-sm font-semibold outline-none" />
                </div>
              ))}
              <textarea value={orderNote} onChange={(event) => setOrderNote(event.target.value)} placeholder="Order note" className="min-h-20 rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-4 py-3 text-sm font-semibold outline-none" />
              {servedEntry && <textarea required value={lateEntryReason} onChange={(event) => setLateEntryReason(event.target.value)} placeholder="Required: why was this served item missing?" className="min-h-20 rounded-2xl border border-amber-300 bg-[var(--omlu-primary-surface)] px-4 py-3 text-sm font-semibold outline-none" />}
              <button type="button" disabled={!canOrder || cart.length === 0 || submitting} onClick={handleSubmit} className="h-14 rounded-2xl bg-orange-600 text-base font-black text-[var(--omlu-primary-action-text)] disabled:bg-[var(--omlu-muted-surface)]">
                {submitting ? "Saving..." : servedEntry ? "Add Served Item · Do not send to kitchen" : "Add Item · Send to kitchen"}
              </button>
            </div>
          )}
        </section>
      </div>

      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-24 z-30 mx-auto max-w-md px-4 sm:max-w-xl">
          <div className="rounded-3xl border border-orange-100 bg-[var(--omlu-primary-surface)] p-4 shadow-lg shadow-orange-100">
            <div className="mb-3 flex items-center justify-between text-sm font-bold">
              <span>{itemCount} item{itemCount === 1 ? "" : "s"}</span>
              <span className="text-xl font-black text-orange-600">{currency(subtotal)}</span>
            </div>
            <button type="button" disabled={!canOrder || submitting} onClick={handleSubmit} className="h-14 w-full rounded-2xl bg-orange-600 text-base font-black text-[var(--omlu-primary-action-text)] disabled:bg-[var(--omlu-muted-surface)]">
              {submitting ? "Sending..." : "Send Order"}
            </button>
          </div>
        </div>
      )}

      {customisingItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-black/40 p-4 sm:items-center">
          <div className="max-h-[88vh] w-full max-w-md overflow-hidden rounded-[28px] bg-[var(--omlu-primary-surface)]" role="dialog" aria-modal="true" aria-labelledby="staff-options-title">
            <div className="flex items-start justify-between gap-4 border-b border-orange-100 p-5">
              <div>
                <h2 id="staff-options-title" className="break-words text-xl font-black text-[var(--omlu-text-primary)]">{customisingItem.name_en}</h2>
                <p className="mt-1 text-sm font-semibold text-[var(--omlu-text-secondary)]">Choose options</p>
              </div>
              <button onClick={() => setCustomisingItem(null)} className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--omlu-muted-surface)] text-xl font-black">×</button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto p-5">
              {(customisingItem.option_groups || []).map((group) => {
                const selectedCount = Object.values(draftOptions[group.id] || {}).reduce((sum, quantity) => sum + quantity, 0);
                const min = Math.max(group.minimum_selections, group.required ? 1 : 0);
                const max = group.maximum_selections;
                const multi = group.type === "addon" && max !== 1;
                return (
                  <section key={group.id} className="mb-4 rounded-3xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-black text-[var(--omlu-text-primary)]">{group.name}</div>
                        <div className="text-xs font-semibold text-[var(--omlu-text-secondary)]">{min > 0 ? `Choose ${min}` : "Optional"}{max ? ` · up to ${max}` : ""}</div>
                      </div>
                      {selectedCount < min && <span className="text-xs font-bold text-red-700">Required</span>}
                    </div>
                    <div className="mt-3 grid gap-2">
                      {group.options.map((option) => {
                        const checked = Boolean(draftOptions[group.id]?.[option.id]);
                        const disabled = !option.available || (!checked && Boolean(max) && selectedCount >= max);
                        return (
                          <button key={option.id} type="button" disabled={disabled} onClick={() => toggleDraftOption(group.id, option.id, multi)} className={`flex min-h-12 items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 text-left text-sm font-bold disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${checked ? "border-orange-500 bg-orange-50 text-orange-950 dark:border-orange-500 dark:bg-orange-950/40 dark:text-[var(--omlu-text-primary)]" : "border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] text-[var(--omlu-text-primary)] hover:border-orange-300"}`}>
                            <span className="flex items-center gap-3 min-w-0">
                              <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center ${multi ? "rounded-md" : "rounded-full"} border-2 ${checked ? "border-orange-600 bg-orange-600 text-[10px] text-white" : "border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] text-transparent"}`}>✓</span>
                              <span>{option.name}</span>
                            </span>
                            <span className="shrink-0 font-extrabold text-[var(--omlu-text-primary)]">₹{Number(option.price_delta).toFixed(2)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
            <div className="border-t border-orange-100 p-5">
              <button
                disabled={!hasRequiredSelections(customisingItem, selectedOptionsFromDraft())}
                onClick={() => {
                  addItemWithOptions(customisingItem, selectedOptionsFromDraft());
                  setCustomisingItem(null);
                  setDraftOptions({});
                }}
                className="h-14 w-full rounded-2xl bg-orange-600 font-black text-[var(--omlu-primary-action-text)] disabled:bg-[var(--omlu-muted-surface)]"
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
