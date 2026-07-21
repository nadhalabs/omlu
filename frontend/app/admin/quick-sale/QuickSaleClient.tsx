"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRealtime } from "@/lib/realtime";
import { useOmluUi } from "@/components/OmluUiProvider";

type SaleType = "takeaway" | "late_entry";
type PaymentMethod = "cash" | "upi";
type MenuItem = { id: number; name: string; price: string };
type SaleItem = { menu_item_id: number; item_name: string; quantity: number; unit_price: string; total_price: string };
type QuickSale = { order_number: string; public_token: string; sale_type: SaleType; status: string; note: string | null; reason: string | null; total: string; payment_method: PaymentMethod | null; entered_by_name: string; entered_by_role: string; created_at: string; completed_at: string | null; items: SaleItem[] };
type HomeData = { menu_items: MenuItem[]; active_takeaways: QuickSale[]; completed_today: QuickSale[] };

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(typeof body?.detail === "string" ? body.detail : "Quick Sale request failed."); }
  return response.json();
}

export default function QuickSaleClient() {
  const { confirm: confirmDialog, toast } = useOmluUi();
  const [data, setData] = useState<HomeData | null>(null);
  const [saleType, setSaleType] = useState<SaleType | null>(null);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await parseResponse<HomeData>(await fetch("/api/admin/quick-sales", { cache: "no-store" }))); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load Quick Sale."); }
  }, []);
  useEffect(() => { const timeout = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timeout); }, [load]);
  useRealtime({ target: { kind: "staff", channel: "staff" }, onEvent: () => void load(), onReconnect: () => void load() });

  const visibleMenu = useMemo(() => (data?.menu_items || []).filter((item) => item.name.toLowerCase().includes(search.toLowerCase())), [data, search]);
  const total = useMemo(() => (data?.menu_items || []).reduce((sum, item) => sum + Number(item.price) * (cart[item.id] || 0), 0), [data, cart]);
  const quantity = (id: number, delta: number) => setCart((current) => { const next = Math.max(0, (current[id] || 0) + delta); const updated = { ...current, [id]: next }; if (!next) delete updated[id]; return updated; });

  const submit = async () => {
    if (!saleType || saving || Object.keys(cart).length === 0) return;
    const isLate = saleType === "late_entry";
    await confirmDialog({ title: isLate ? (payment === "upi" ? "Confirm UPI payment" : "Record late entry") : "Send takeaway to Kitchen?", message: isLate ? (payment === "upi" ? "Confirm that the payment has been received in the restaurant’s UPI account." : "This sale will be recorded as paid and included in today’s revenue.") : "Kitchen will receive this order immediately for preparation.", details: [`Total: ₹${total.toFixed(2)}`, ...(isLate && payment === "cash" ? ["Payment method: Cash"] : [])], confirmLabel: isLate ? (payment === "upi" ? "Payment received" : "Confirm payment") : "Send to Kitchen", onConfirm: async () => {
      setSaving(true); setError(null);
      try { await parseResponse(await fetch("/api/admin/quick-sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sale_type: saleType, items: Object.entries(cart).map(([menu_item_id, itemQuantity]) => ({ menu_item_id: Number(menu_item_id), quantity: itemQuantity })), note: note || null, payment_method: isLate ? payment : null, idempotency_key: crypto.randomUUID() }) })); setCart({}); setNote(""); setSaleType(null); await load(); toast(isLate ? "Late Entry recorded." : "Takeaway sent to Kitchen.", "success"); }
      finally { setSaving(false); }
    }});
  };

  const confirmPayment = async (sale: QuickSale, method: PaymentMethod) => {
    if (saving) return;
    await confirmDialog({ title: "Complete takeaway order", message: "Confirm that payment has been received.", details: [`Takeaway ${sale.order_number}`, `Total: ₹${sale.total}`, `Payment method: ${method === "cash" ? "Cash" : "UPI"}`], confirmLabel: "Complete order", onConfirm: async () => { setSaving(true); try { await parseResponse(await fetch(`/api/admin/quick-sales/${encodeURIComponent(sale.public_token)}/payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method }) })); await load(); toast("Takeaway payment confirmed.", "success"); } finally { setSaving(false); } } });
  };

  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
    <div><h1 className="text-2xl font-black text-white">🧾 Quick Sale</h1><p className="mt-1 text-sm text-zinc-500">Counter takeaway and unrecorded completed sales—without a table or dining session.</p></div>
    {error && <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-4 text-sm font-bold text-red-300">{error} <button onClick={load} className="ml-2 underline">Retry</button></div>}

    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><h2 className="text-lg font-black text-white">What do you need?</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">
      <button onClick={() => setSaleType("takeaway")} className={`contrast-dark-card min-h-28 rounded-xl border p-5 text-left ${saleType === "takeaway" ? "border-orange-500 bg-orange-950/30" : "border-zinc-700 bg-zinc-950 hover:border-orange-500"}`}><span className="block text-lg font-black text-white">Takeaway Order</span><span className="mt-1 block text-sm text-zinc-400">Food still needs to be prepared</span></button>
      <button onClick={() => setSaleType("late_entry")} className={`contrast-dark-card min-h-28 rounded-xl border p-5 text-left ${saleType === "late_entry" ? "border-orange-500 bg-orange-950/30" : "border-zinc-700 bg-zinc-950 hover:border-orange-500"}`}><span className="block text-lg font-black text-white">Late Entry</span><span className="mt-1 block text-sm text-zinc-400">Food was already served or handed over</span></button>
    </div></section>

    {saleType && <section className="grid gap-5 lg:grid-cols-[1.4fr_0.6fr]">
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><div className="flex items-center justify-between gap-3"><h2 className="font-black text-white">Add menu items</h2><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menu" className="h-10 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm" /></div><div className="mt-4 grid gap-2 sm:grid-cols-2">{visibleMenu.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 p-3"><div><div className="font-bold text-white">{item.name}</div><div className="text-xs text-zinc-500">₹{item.price}</div></div><div className="flex items-center gap-2"><button aria-label={`Remove ${item.name}`} onClick={() => quantity(item.id, -1)} className="h-9 w-9 rounded-lg bg-zinc-800 text-white">−</button><span className="w-5 text-center font-black">{cart[item.id] || 0}</span><button aria-label={`Add ${item.name}`} onClick={() => quantity(item.id, 1)} className="h-9 w-9 rounded-lg bg-orange-600 font-black text-white">+</button></div></div>)}</div></div>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><h2 className="font-black text-white">Review</h2><div className="mt-4 space-y-2 text-sm">{Object.entries(cart).map(([id, qty]) => { const item = data?.menu_items.find((entry) => entry.id === Number(id)); return item ? <div key={id} className="flex justify-between text-zinc-300"><span>{qty} × {item.name}</span><span>₹{(Number(item.price) * qty).toFixed(2)}</span></div> : null; })}</div><div className="mt-4 flex justify-between border-t border-zinc-800 pt-4 text-lg font-black"><span>Total</span><span>₹{total.toFixed(2)}</span></div><label className="mt-5 block text-xs font-bold text-zinc-400">Optional note<textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1024} className="mt-2 min-h-20 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm text-white" /></label>{saleType === "late_entry" && <fieldset className="mt-4"><legend className="text-xs font-bold text-zinc-400">Payment received</legend><div className="mt-2 flex gap-2">{(["cash", "upi"] as PaymentMethod[]).map((method) => <button type="button" key={method} onClick={() => setPayment(method)} className={`rounded-lg px-4 py-2 text-sm font-black uppercase ${payment === method ? "bg-orange-600 text-white" : "bg-zinc-800 text-zinc-300"}`}>{method}</button>)}</div></fieldset>}<button disabled={saving || !Object.keys(cart).length} onClick={submit} className="mt-6 min-h-12 w-full rounded-xl bg-orange-600 font-black text-white disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-600">{saving ? "Saving…" : saleType === "takeaway" ? "Send to Kitchen" : "Record Completed Sale"}</button></div>
    </section>}

    <section className="grid gap-5 lg:grid-cols-2"><SaleList title="Active Takeaway Orders" sales={data?.active_takeaways || []} payment={confirmPayment} saving={saving} /><SaleList title="Completed Quick Sales Today" sales={data?.completed_today || []} saving={saving} /></section>
  </div>;
}

function SaleList({ title, sales, payment, saving }: { title: string; sales: QuickSale[]; payment?: (sale: QuickSale, method: PaymentMethod) => void; saving: boolean }) {
  return <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><h2 className="font-black text-white">{title}</h2>{sales.length === 0 ? <p className="mt-4 text-sm text-zinc-500">Nothing to show.</p> : <div className="mt-4 space-y-3">{sales.map((sale) => <article key={sale.public_token} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex justify-between gap-3"><div><div className="font-black text-white">{sale.sale_type === "takeaway" ? "Takeaway" : "Late Entry"} {sale.order_number}</div><div className="mt-1 text-xs text-zinc-500">{sale.items.map((item) => `${item.quantity}× ${item.item_name}`).join(" · ")}</div></div><div className="text-right"><div className="font-black text-white">₹{sale.total}</div><div className="text-xs font-bold uppercase text-orange-500">{sale.status}</div></div></div><div className="mt-3 text-xs text-zinc-500">Entered by {sale.entered_by_name} · {sale.entered_by_role} · {new Date(sale.completed_at || sale.created_at).toLocaleTimeString()}{sale.payment_method ? ` · ${sale.payment_method.toUpperCase()}` : ""}</div>{payment && sale.status === "ready" && <div className="mt-3 flex gap-2"><button disabled={saving} onClick={() => payment(sale, "cash")} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white">Cash received</button><button disabled={saving} onClick={() => payment(sale, "upi")} className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-black text-white">UPI received</button></div>}</article>)}</div>}</section>;
}
