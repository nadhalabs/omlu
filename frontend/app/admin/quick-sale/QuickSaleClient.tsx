"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtime } from "@/lib/realtime";
import { useOmluUi } from "@/components/OmluUiProvider";
import { MenuOptionGroup, SelectedOptionRequest } from "@/lib/types";

type SaleType = "takeaway" | "late_entry";
type PaymentMethod = "cash" | "upi";
type MenuItem = { id: number; name: string; price: string; has_options: boolean; option_groups: MenuOptionGroup[] };
type CartLine = { menu_item_id: number; item_name: string; quantity: number; unit_price: string; selected_options: SelectedOptionRequest[] };
type SaleItem = { menu_item_id: number; item_name: string; quantity: number; base_price: string; unit_price: string; total_price: string; item_note: string | null; selected_options: Array<{ option_name: string; group_name: string; price_delta: string; quantity: number }> };
type QuickSale = { order_number: string; public_token: string; sale_type: SaleType; status: string; note: string | null; reason: string | null; subtotal: string; discount_amount: string; taxable_amount: string | null; gst_enabled: boolean; gst_rate: string | null; cgst_amount: string | null; sgst_amount: string | null; igst_amount: string | null; tax_amount: string; total: string; grand_total: string; payment_method: PaymentMethod | null; entered_by_name: string; entered_by_role: string; created_at: string; completed_at: string | null; items: SaleItem[] };
type QuickSalePreview = { subtotal: string; discount_amount: string; taxable_amount: string; gst_enabled: boolean; gst_rate: string; cgst_rate: string; sgst_rate: string; igst_rate: string; cgst_amount: string; sgst_amount: string; igst_amount: string; tax_amount: string; tax_mode: "inclusive" | "exclusive"; grand_total: string };
type HomeData = { menu_items: MenuItem[]; active_takeaways: QuickSale[]; completed_today: QuickSale[] };

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(typeof body?.detail === "string" ? body.detail : "Quick Sale request failed."); }
  return response.json();
}

export default function QuickSaleClient() {
  const { confirm: confirmDialog, toast } = useOmluUi();
  const [data, setData] = useState<HomeData | null>(null);
  const [saleType, setSaleType] = useState<SaleType | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<QuickSalePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customisingItem, setCustomisingItem] = useState<MenuItem | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftOptions, setDraftOptions] = useState<Record<number, Record<number, number>>>({});
  const [draftQuantity, setDraftQuantity] = useState(1);
  const idempotencyKey = useRef("");
  const previewRequest = useRef(0);
  useEffect(() => {
    idempotencyKey.current = localStorage.getItem("omlu:quick-sale:draft-key") || crypto.randomUUID();
    localStorage.setItem("omlu:quick-sale:draft-key", idempotencyKey.current);
  }, []);

  const load = useCallback(async () => {
    try { setData(await parseResponse<HomeData>(await fetch("/api/admin/quick-sales", { cache: "no-store" }))); setError(null); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load Quick Sale."); }
  }, []);
  useEffect(() => { const timeout = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timeout); }, [load]);
  useEffect(() => {
    if (!customisingItem) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCustomisingItem(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [customisingItem]);
  useRealtime({ target: { kind: "staff", channel: "staff" }, onEvent: () => void load(), onReconnect: () => void load() });

  const visibleMenu = useMemo(() => (data?.menu_items || []).filter((item) => item.name.toLowerCase().includes(search.toLowerCase())), [data, search]);
  useEffect(() => {
    const requestId = ++previewRequest.current;
    let controller: AbortController | null = null;
    const timeout = window.setTimeout(() => {
      if (!saleType || cart.length === 0) {
        setPreview(null);
        setPreviewError(null);
        setPreviewLoading(false);
        return;
      }
      controller = new AbortController();
      setPreview(null);
      setPreviewError(null);
      setPreviewLoading(true);
      void fetch("/api/admin/quick-sales/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          sale_type: saleType,
          items: cart.map((line) => ({ menu_item_id: line.menu_item_id, quantity: line.quantity, selected_options: line.selected_options })),
          payment_method: saleType === "late_entry" ? payment : null,
        }),
      }).then((response) => parseResponse<QuickSalePreview>(response)).then((result) => {
        if (requestId === previewRequest.current) setPreview(result);
      }).catch((err) => {
        if (controller?.signal.aborted || requestId !== previewRequest.current) return;
        setPreviewError(err instanceof Error ? err.message : "Could not calculate the Quick Sale total.");
      }).finally(() => {
        if (requestId === previewRequest.current) setPreviewLoading(false);
      });
    }, 0);
    return () => { window.clearTimeout(timeout); controller?.abort(); };
  }, [cart, payment, saleType]);

  const previewDetails = (value: QuickSalePreview) => {
    const details = [`Subtotal: ₹${value.subtotal}`];
    if (Number(value.discount_amount) !== 0) details.push(`Discount: −₹${value.discount_amount}`);
    if (value.gst_enabled) {
      if (value.tax_mode === "inclusive") details.push(`Includes GST: ₹${value.tax_amount}`);
      if (Number(value.igst_amount) !== 0) details.push(`IGST ${value.igst_rate}%: ₹${value.igst_amount}`);
      else {
        details.push(`CGST ${value.cgst_rate}%: ₹${value.cgst_amount}`);
        details.push(`SGST ${value.sgst_rate}%: ₹${value.sgst_amount}`);
      }
    }
    details.push(`Grand total: ₹${value.grand_total}`);
    return details;
  };

  const optionSignature = (options: SelectedOptionRequest[]) =>
    JSON.stringify(options.slice().sort((a, b) => a.group_id - b.group_id || a.option_id - b.option_id));
  const selectedOptionsFromDraft = (): SelectedOptionRequest[] =>
    Object.entries(draftOptions).flatMap(([groupId, options]) =>
      Object.entries(options).filter(([, quantity]) => quantity > 0).map(([optionId, quantity]) => ({ group_id: Number(groupId), option_id: Number(optionId), quantity }))
    );
  const optionPrice = (item: MenuItem, selections: SelectedOptionRequest[]) => {
    const variant = selections.map((selection) => {
      const group = item.option_groups.find((candidate) => candidate.id === selection.group_id);
      const option = group?.options.find((candidate) => candidate.id === selection.option_id);
      return group?.type === "variant" ? option : undefined;
    }).find(Boolean);
    const addons = selections.reduce((sum, selection) => {
      const group = item.option_groups.find((candidate) => candidate.id === selection.group_id);
      const option = group?.options.find((candidate) => candidate.id === selection.option_id);
      return group?.type === "addon" && option ? sum + Number(option.price_delta) * selection.quantity : sum;
    }, 0);
    return (variant ? Number(variant.price_delta) : Number(item.price)) + addons;
  };
  const requiredSelectionsComplete = (item: MenuItem, selections: SelectedOptionRequest[]) =>
    item.option_groups.every((group) => {
      const count = selections.filter((selection) => selection.group_id === group.id).reduce((sum, selection) => sum + selection.quantity, 0);
      const minimum = Math.max(group.minimum_selections, group.required ? 1 : 0);
      return count >= minimum && (!group.maximum_selections || count <= group.maximum_selections);
    });
  const optionLabels = (line: CartLine) => {
    const item = data?.menu_items.find((candidate) => candidate.id === line.menu_item_id);
    return line.selected_options.flatMap((selection) => {
      const group = item?.option_groups.find((candidate) => candidate.id === selection.group_id);
      const option = group?.options.find((candidate) => candidate.id === selection.option_id);
      return option ? [`${option.name}${selection.quantity > 1 ? ` × ${selection.quantity}` : ""}`] : [];
    });
  };
  const addSimpleItem = (item: MenuItem) => setCart((current) => {
    const index = current.findIndex((line) => line.menu_item_id === item.id && line.selected_options.length === 0);
    if (index < 0) return [...current, { menu_item_id: item.id, item_name: item.name, quantity: 1, unit_price: item.price, selected_options: [] }];
    return current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: line.quantity + 1 } : line);
  });
  const openOptions = (item: MenuItem, index: number | null = null) => {
    const line = index === null ? null : cart[index];
    setCustomisingItem(item);
    setEditingIndex(index);
    setDraftQuantity(line?.quantity ?? 1);
    setDraftOptions((line?.selected_options ?? []).reduce<Record<number, Record<number, number>>>((result, selection) => ({
      ...result,
      [selection.group_id]: { ...(result[selection.group_id] ?? {}), [selection.option_id]: selection.quantity },
    }), {}));
  };
  const setLineQuantity = (index: number, next: number) => setCart((current) =>
    next <= 0 ? current.filter((_, lineIndex) => lineIndex !== index) : current.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: next } : line)
  );
  const toggleDraftOption = (groupId: number, optionId: number, multi: boolean) => setDraftOptions((current) => {
    const group = current[groupId] ?? {};
    if (!multi) return { ...current, [groupId]: group[optionId] ? {} : { [optionId]: 1 } };
    const next = { ...group };
    if (next[optionId]) delete next[optionId]; else next[optionId] = 1;
    return { ...current, [groupId]: next };
  });

  const submit = async () => {
    if (!saleType || saving || previewLoading || !preview || cart.length === 0) return;
    const isLate = saleType === "late_entry";
    const confirmedPreview = preview;
    await confirmDialog({ title: isLate ? (payment === "upi" ? "Confirm UPI payment" : "Record late entry") : "Send takeaway to Kitchen?", message: isLate ? (payment === "upi" ? "Confirm that the payment has been received in the restaurant’s UPI account." : "This sale will be recorded as paid and included in today’s revenue.") : "Kitchen will receive this order immediately for preparation.", details: [...previewDetails(confirmedPreview), ...(isLate && payment === "cash" ? ["Payment method: Cash"] : [])], confirmLabel: `${isLate ? (payment === "upi" ? "Payment received" : "Confirm payment") : "Send to Kitchen"} — ₹${confirmedPreview.grand_total}`, onConfirm: async () => {
      setSaving(true); setError(null);
      try { const created = await parseResponse<QuickSale>(await fetch("/api/admin/quick-sales", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey.current }, body: JSON.stringify({ sale_type: saleType, items: cart.map((line) => ({ menu_item_id: line.menu_item_id, quantity: line.quantity, selected_options: line.selected_options })), note: note || null, payment_method: isLate ? payment : null }) })); setCart([]); setNote(""); setSaleType(null); idempotencyKey.current = crypto.randomUUID(); localStorage.setItem("omlu:quick-sale:draft-key", idempotencyKey.current); await load(); toast(isLate ? `Late Entry recorded. Total ₹${created.total}.` : "Takeaway sent to Kitchen.", "success"); }
      catch (err) { const message = err instanceof Error ? err.message : "Could not save Quick Sale."; setError(message); toast(message, "error"); }
      finally { setSaving(false); }
    }});
  };

  const confirmPayment = async (sale: QuickSale, method: PaymentMethod) => {
    if (saving) return;
    const storageKey = `omlu:quick-sale:payment:${sale.public_token}`;
    const paymentKey = localStorage.getItem(storageKey) || crypto.randomUUID();
    localStorage.setItem(storageKey, paymentKey);
    await confirmDialog({ title: "Complete takeaway order", message: "Confirm that payment has been received.", details: [`Takeaway ${sale.order_number}`, `Total: ₹${sale.total}`, `Payment method: ${method === "cash" ? "Cash" : "UPI"}`], confirmLabel: "Complete order", onConfirm: async () => { setSaving(true); try { await parseResponse(await fetch(`/api/admin/quick-sales/${encodeURIComponent(sale.public_token)}/payment`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": paymentKey }, body: JSON.stringify({ method }) })); localStorage.removeItem(storageKey); await load(); toast("Takeaway payment confirmed.", "success"); } finally { setSaving(false); } } });
  };

  return <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
    <header>
      <h1 className="text-3xl font-black tracking-tight text-white">Quick Sale</h1>
      <p className="mt-1 text-sm text-zinc-400">Counter takeaway and unrecorded completed sales—without a table or dining session.</p>
      <ol className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-wide text-zinc-400" aria-label="Quick Sale steps">
        {["Choose sale type", "Add items", "Review order", "Select payment", "Confirm"].map((step, index) => <li key={step} className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5"><span className="text-orange-400">{index + 1}</span>{step}</li>)}
      </ol>
    </header>
    {error && <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-4 text-sm font-bold text-red-300">{error} <button onClick={load} className="ml-2 underline">Retry</button></div>}

    <section className="rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm" aria-labelledby="sale-type-heading">
      <h2 id="sale-type-heading" className="sr-only">Choose sale type</h2>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Sale type">
        {([{"value": "takeaway", "label": "Takeaway", "helper": "Prepare and send to Kitchen"}, {"value": "late_entry", "label": "Late Entry", "helper": "Already served or handed over"}] as const).map((mode) => {
          const active = saleType === mode.value;
          return <button key={mode.value} type="button" aria-pressed={active} onClick={() => setSaleType(mode.value)} className={`min-h-16 rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${active ? "border-orange-500 bg-orange-50 text-orange-950 shadow-sm" : "border-transparent bg-zinc-50 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100"}`}><span className="block text-sm font-black sm:text-base">{mode.label}</span><span className={`mt-0.5 block text-[11px] sm:text-xs ${active ? "text-orange-700" : "text-zinc-500"}`}>{mode.helper}</span></button>;
        })}
      </div>
    </section>

    {saleType && <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <div><p className="text-xs font-bold uppercase tracking-wide text-orange-600">Step 2</p><h2 className="mt-1 text-xl font-black text-zinc-950">Add items</h2></div>
        <label className="mt-4 block"><span className="sr-only">Search menu</span><div className="flex h-12 items-center gap-3 rounded-xl border border-zinc-300 bg-zinc-50 px-4 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-100"><span aria-hidden="true" className="text-zinc-400">⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menu items" className="h-full min-w-0 flex-1 bg-transparent text-sm text-zinc-950 outline-none placeholder:text-zinc-400" />{search && <button type="button" onClick={() => setSearch("")} className="text-xs font-bold text-zinc-500 hover:text-zinc-950">Clear</button>}</div></label>
        <div className="mt-4 grid gap-3 xl:grid-cols-2">{visibleMenu.map((item) => {
          const itemQuantity = cart.filter((line) => line.menu_item_id === item.id).reduce((sum, line) => sum + line.quantity, 0);
          return <div key={item.id} className="flex min-h-28 flex-col justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 transition hover:border-zinc-300 hover:shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><div className="font-black text-zinc-950">{item.name}</div><div className="mt-1 text-xs font-medium text-zinc-500">{item.has_options ? "Starting from" : "Price"} ₹{item.price}</div></div>{itemQuantity > 0 && <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-black text-orange-700">{itemQuantity} added</span>}</div>
            <div className="flex items-center justify-between gap-3">
              {item.has_options ? <button type="button" onClick={() => openOptions(item)} className="min-h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm font-black text-zinc-800 hover:border-orange-400 hover:text-orange-700">Select options</button> : <span className="text-xs text-zinc-500">Tap + to add</span>}
              <div className="flex items-center rounded-lg border border-zinc-300 bg-white p-1 shadow-sm">
                {!item.has_options && <button type="button" aria-label={`Remove ${item.name}`} onClick={() => { const index = cart.findIndex((line) => line.menu_item_id === item.id); if (index >= 0) setLineQuantity(index, cart[index].quantity - 1); }} disabled={itemQuantity === 0} className="h-9 w-9 rounded-md text-lg font-bold text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-300">−</button>}
                <span className="w-9 text-center text-sm font-black text-zinc-950">{itemQuantity}</span>
                <button type="button" aria-label={item.has_options ? `Select options for ${item.name}` : `Add ${item.name}`} onClick={() => item.has_options ? openOptions(item) : addSimpleItem(item)} className="h-9 w-9 rounded-md bg-orange-600 text-lg font-black text-white hover:bg-orange-500">+</button>
              </div>
            </div>
          </div>;
        })}</div>
        {visibleMenu.length === 0 && <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-10 text-center"><p className="font-black text-zinc-800">No matching items</p><p className="mt-1 text-sm text-zinc-500">Try a different item name.</p></div>}
      </div>
      <aside className="rounded-2xl border border-zinc-200 bg-white p-4 text-zinc-950 shadow-sm sm:p-5 lg:sticky lg:top-6">
        <div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-orange-600">Steps 3–5</p><h2 className="mt-1 text-xl font-black">Order summary</h2></div>{cart.length > 0 && <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-black text-zinc-600">{cart.reduce((sum, line) => sum + line.quantity, 0)} items</span>}</div>
        {cart.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-5 py-10 text-center"><div className="text-3xl" aria-hidden="true">＋</div><p className="mt-3 font-black text-zinc-800">No items added yet</p><p className="mt-1 text-sm text-zinc-500">Add items from the menu to start this sale.</p></div> : <div className="mt-4 space-y-3 text-sm">{cart.map((line, index) => <div key={`${line.menu_item_id}-${optionSignature(line.selected_options)}-${index}`} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-zinc-700">
          <div className="flex justify-between gap-3"><div><span className="font-black text-zinc-950">{line.item_name}</span>{optionLabels(line).length > 0 && <p className="mt-1 text-xs text-zinc-500">{optionLabels(line).join(" · ")}</p>}</div><span className="font-bold text-zinc-950">₹{(Number(line.unit_price) * line.quantity).toFixed(2)}</span></div>
          <div className="mt-3 flex items-center justify-between gap-2"><div className="flex items-center rounded-lg border border-zinc-300 bg-white p-0.5"><button type="button" aria-label={`Decrease ${line.item_name}`} onClick={() => setLineQuantity(index, line.quantity - 1)} className="h-8 w-8 rounded-md font-bold text-zinc-700 hover:bg-zinc-100">−</button><span className="w-8 text-center font-black text-zinc-950">{line.quantity}</span><button type="button" aria-label={`Increase ${line.item_name}`} onClick={() => setLineQuantity(index, line.quantity + 1)} className="h-8 w-8 rounded-md font-bold text-zinc-700 hover:bg-zinc-100">+</button></div>{line.selected_options.length > 0 && <button type="button" onClick={() => { const item = data?.menu_items.find((candidate) => candidate.id === line.menu_item_id); if (item) openOptions(item, index); }} className="rounded-lg border border-zinc-300 bg-white px-2.5 py-2 text-xs font-black text-zinc-700 hover:border-orange-400 hover:text-orange-700">Edit options</button>}</div>
        </div>)}</div>}
        <div className="mt-4 space-y-2 border-t border-zinc-200 pt-4 text-sm">
          {previewLoading && <div className="text-zinc-500" role="status">Calculating authoritative total…</div>}
          {previewError && <div className="rounded-lg bg-red-50 p-2 text-red-700" role="alert">{previewError}</div>}
          {preview && <>
            <div className="flex justify-between text-zinc-600"><span>Subtotal</span><span className="font-semibold">₹{preview.subtotal}</span></div>
            {Number(preview.discount_amount) !== 0 && <div className="flex justify-between text-zinc-600"><span>Discount</span><span>−₹{preview.discount_amount}</span></div>}
            {preview.gst_enabled && preview.tax_mode === "inclusive" && <div className="flex justify-between text-zinc-500"><span>Includes GST</span><span>₹{preview.tax_amount}</span></div>}
            {preview.gst_enabled && Number(preview.igst_amount) !== 0 && <div className="flex justify-between text-zinc-600"><span>IGST {preview.igst_rate}%</span><span>₹{preview.igst_amount}</span></div>}
            {preview.gst_enabled && Number(preview.igst_amount) === 0 && <>
              <div className="flex justify-between text-zinc-600"><span>CGST {preview.cgst_rate}%</span><span>₹{preview.cgst_amount}</span></div>
              <div className="flex justify-between text-zinc-600"><span>SGST {preview.sgst_rate}%</span><span>₹{preview.sgst_amount}</span></div>
            </>}
            <div className="flex justify-between border-t border-zinc-200 pt-3 text-xl font-black text-zinc-950"><span>Grand total</span><span>₹{preview.grand_total}</span></div>
          </>}
        </div>
        <label className="mt-5 block text-xs font-bold text-zinc-600">Order note <span className="font-medium text-zinc-400">(optional)</span><textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1024} placeholder="Add preparation or counter notes" className="mt-2 min-h-20 w-full resize-y rounded-xl border border-zinc-300 bg-zinc-50 p-3 text-sm text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></label>
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          {saleType === "late_entry" ? <fieldset><legend className="text-xs font-black text-zinc-700">Payment received</legend><div className="mt-2 grid grid-cols-2 gap-2">{(["cash", "upi"] as PaymentMethod[]).map((method) => <button type="button" aria-pressed={payment === method} key={method} onClick={() => setPayment(method)} className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-black uppercase ${payment === method ? "border-orange-500 bg-orange-600 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"}`}>{method}</button>)}</div></fieldset> : <div><p className="text-xs font-black text-zinc-700">Payment after preparation</p><p className="mt-1 text-xs text-zinc-500">Takeaway payment is confirmed after the Kitchen marks it served.</p></div>}
          <button disabled={saving || previewLoading || !preview || !cart.length} onClick={submit} className="mt-3 min-h-12 w-full rounded-xl bg-orange-600 px-3 font-black text-white shadow-sm hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500">{saving ? "Saving…" : previewLoading ? "Calculating total…" : preview ? `${saleType === "takeaway" ? "Send to Kitchen" : "Record Completed Sale"} — ₹${preview.grand_total}` : saleType === "takeaway" ? "Send to Kitchen" : "Record Completed Sale"}</button>
        </div>
      </aside>
    </section>}

    {customisingItem && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-4 sm:items-center">
      <div role="dialog" aria-modal="true" aria-labelledby="quick-sale-options-title" className="max-h-[90vh] w-full max-w-md overflow-hidden rounded-3xl border border-zinc-700 bg-zinc-950">
        <div className="flex items-start justify-between border-b border-zinc-800 p-5"><div><h2 id="quick-sale-options-title" className="text-xl font-black text-white">{customisingItem.name}</h2><p className="mt-1 text-sm text-zinc-400">Choose specifications</p></div><button type="button" aria-label="Close specifications" onClick={() => setCustomisingItem(null)} className="h-10 w-10 rounded-full bg-zinc-800 text-xl">×</button></div>
        <div className="max-h-[58vh] overflow-y-auto p-5">{customisingItem.option_groups.map((group) => {
          const selectedCount = Object.values(draftOptions[group.id] ?? {}).reduce((sum, quantity) => sum + quantity, 0);
          const minimum = Math.max(group.minimum_selections, group.required ? 1 : 0);
          const multi = group.type === "addon" && group.maximum_selections !== 1;
          return <section key={group.id} className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4"><div className="flex justify-between gap-3"><div><h3 className="font-black text-white">{group.name}</h3><p className="text-xs text-zinc-400">{minimum ? `Choose ${minimum}` : "Optional"}{group.maximum_selections ? ` · up to ${group.maximum_selections}` : ""}</p></div>{selectedCount < minimum && <span className="text-xs font-bold text-red-400">Required</span>}</div><div className="mt-3 grid gap-2">{group.options.map((option) => {
            const checked = Boolean(draftOptions[group.id]?.[option.id]);
            const disabled = !option.available || (!checked && Boolean(group.maximum_selections) && selectedCount >= group.maximum_selections);
            return <button key={option.id} type="button" disabled={disabled} onClick={() => toggleDraftOption(group.id, option.id, multi)} className={`flex min-h-12 justify-between rounded-xl border px-4 py-3 text-left text-sm font-bold disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-500 ${checked ? "border-orange-500 bg-orange-950/30 text-orange-100" : "border-zinc-700 bg-zinc-950 text-zinc-300"}`}><span>{option.name}</span><span>{group.type === "variant" ? `₹${Number(option.price_delta).toFixed(2)}` : `+₹${Number(option.price_delta).toFixed(2)}`}</span></button>;
          })}</div></section>;
        })}</div>
        <div className="border-t border-zinc-800 p-5"><div className="mb-4 flex items-center justify-between"><span className="text-sm font-bold text-zinc-300">Quantity</span><div className="flex items-center gap-3"><button type="button" disabled={draftQuantity <= 1} onClick={() => setDraftQuantity((value) => Math.max(1, value - 1))} className="h-9 w-9 rounded-lg bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-900 disabled:text-zinc-600">−</button><span className="w-6 text-center font-black">{draftQuantity}</span><button type="button" disabled={draftQuantity >= 50} onClick={() => setDraftQuantity((value) => Math.min(50, value + 1))} className="h-9 w-9 rounded-lg bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-900 disabled:text-zinc-600">+</button></div></div><button type="button" disabled={!requiredSelectionsComplete(customisingItem, selectedOptionsFromDraft())} onClick={() => {
          const selections = selectedOptionsFromDraft();
          const nextLine = { menu_item_id: customisingItem.id, item_name: customisingItem.name, quantity: draftQuantity, unit_price: optionPrice(customisingItem, selections).toFixed(2), selected_options: selections };
          setCart((current) => editingIndex === null ? [...current, nextLine] : current.map((line, index) => index === editingIndex ? nextLine : line));
          setCustomisingItem(null); setEditingIndex(null); setDraftOptions({});
        }} className="h-12 w-full rounded-xl bg-orange-600 font-black text-white disabled:bg-zinc-700 disabled:text-zinc-400">{editingIndex === null ? "Add configured item" : "Update specifications"} · ₹{(optionPrice(customisingItem, selectedOptionsFromDraft()) * draftQuantity).toFixed(2)}</button></div>
      </div>
    </div>}

    <section className="grid gap-5 lg:grid-cols-2"><SaleList title="Active Takeaway Orders" sales={data?.active_takeaways || []} payment={confirmPayment} saving={saving} /><SaleList title="Completed Quick Sales Today" sales={data?.completed_today || []} saving={saving} /></section>
  </div>;
}

function SaleList({ title, sales, payment, saving }: { title: string; sales: QuickSale[]; payment?: (sale: QuickSale, method: PaymentMethod) => void; saving: boolean }) {
  return <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5"><h2 className="font-black text-white">{title}</h2>{sales.length === 0 ? <p className="mt-4 text-sm text-zinc-500">Nothing to show.</p> : <div className="mt-4 space-y-3">{sales.map((sale) => <article key={sale.public_token} className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex justify-between gap-3"><div><div className="font-black text-white">{sale.sale_type === "takeaway" ? "Takeaway" : "Late Entry"} {sale.order_number}</div><div className="mt-1 space-y-1 text-xs text-zinc-500">{sale.items.map((item, index) => <div key={`${item.menu_item_id}-${index}`}>{item.quantity}× {item.item_name}{item.selected_options.length > 0 && <span className="block pl-3 text-zinc-600">{item.selected_options.map((option) => option.option_name).join(" · ")}</span>}</div>)}</div></div><div className="text-right"><div className="font-black text-white">₹{sale.total}</div>{sale.gst_enabled && <div className="text-[10px] font-semibold text-zinc-400">Includes GST ₹{sale.tax_amount}</div>}<div className="text-xs font-bold uppercase text-orange-500">{sale.status}</div></div></div><div className="mt-3 text-xs text-zinc-500">Entered by {sale.entered_by_name} · {sale.entered_by_role} · {new Date(sale.completed_at || sale.created_at).toLocaleTimeString()}{sale.payment_method ? ` · ${sale.payment_method.toUpperCase()}` : ""}</div>{payment && sale.status === "served" && <div className="mt-3 flex gap-2"><button disabled={saving} onClick={() => payment(sale, "cash")} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-black text-white">Confirm Cash Payment</button><button disabled={saving} onClick={() => payment(sale, "upi")} className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-black text-white">Confirm UPI Payment</button></div>}</article>)}</div>}</section>;
}
