"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { confirmPendingPayment, getBillingCounter, issueStaffBill, reopenBillOrdering } from "@/lib/api";
import { BillingCounterItem, BillingCounterQueues } from "@/lib/types";
import { useOmluUi } from "@/components/OmluUiProvider";
import { useRealtime } from "@/lib/realtime";

type Tab = "requested" | "awaiting_payment" | "paid_recently" | "printer_setup";
type Method = "counter_cash" | "counter_upi";
const emptyQueues: BillingCounterQueues = { requested: [], awaiting_payment: [], paid_recently: [] };
const money = (value: string) => `₹${Number(value).toFixed(2)}`;

export default function BillingCounterClient() {
  const { confirm: confirmDialog, input: inputDialog, toast } = useOmluUi();
  const [queues, setQueues] = useState(emptyQueues);
  const [tab, setTab] = useState<Tab>("requested");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [methods, setMethods] = useState<Record<string, Method>>({});
  const issuing = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    try {
      setQueues(await getBillingCounter());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load billing counter.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { const timeout = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timeout); }, [refresh]);
  useRealtime({
    target: { kind: "staff", channel: "operations" },
    onEvent: (event) => event.type.startsWith("bill.") && void refresh(),
    onReconnect: refresh,
  });

  const receiptUrl = (item: BillingCounterItem) =>
    item.receipt_token
      ? `/bill/${encodeURIComponent(item.session_token)}?receipt=${encodeURIComponent(item.receipt_token)}`
      : null;

  async function issue(item: BillingCounterItem, openPrint: boolean) {
    if (item.status !== "draft" || issuing.current.has(item.bill_number)) return;
    issuing.current.add(item.bill_number);
    setBusy(item.bill_number);
    const printWindow = openPrint ? window.open("", "_blank") : null;
    try {
      const issued = await issueStaffBill(item.bill_number);
      if (openPrint && printWindow && issued.receipt_token) {
        printWindow.location.replace(`/bill/${encodeURIComponent(item.session_token)}?receipt=${encodeURIComponent(issued.receipt_token)}`);
        printWindow.addEventListener("load", () => printWindow.print(), { once: true });
      } else if (openPrint) {
        printWindow?.close();
        toast("Bill issued. Open Print Bill to print.", "information");
      } else {
        toast("Bill issued.", "success");
      }
      await refresh();
      setTab("awaiting_payment");
    } catch (err) {
      printWindow?.close();
      toast(err instanceof Error ? err.message : "Bill could not be issued.", "error");
    } finally {
      issuing.current.delete(item.bill_number);
      setBusy(null);
    }
  }

  async function reopen(item: BillingCounterItem) {
    if (item.status !== "draft" || busy) return;
    const reason = await inputDialog({
      title: "Reopen Ordering",
      message: `Reopen ordering for Table ${item.table_number}? This will return the session to open status.`,
      label: "Reason for reopening",
      placeholder: "e.g. Customer requested additional items",
      required: true,
      confirmLabel: "Reopen Ordering",
    });
    if (!reason) return;
    setBusy(item.bill_number);
    try {
      await reopenBillOrdering(item.bill_number, reason);
      toast("Ordering has been reopened.", "success");
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not reopen ordering.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function collect(item: BillingCounterItem) {
    if (!["issued", "payment_pending"].includes(item.status)) return;
    const method = methods[item.bill_number];
    if (!method || busy) return;
    const accepted = await confirmDialog({
      title: `Confirm ${method === "counter_cash" ? "cash" : "UPI"} payment?`,
      message: "Confirm only after the restaurant has received the full payment.",
      details: [`Invoice: ${item.invoice_number || item.bill_number}`, `Table: ${item.table_number}`, `Amount: ${money(item.total_amount)}`],
      confirmLabel: "Confirm payment",
    });
    if (!accepted) return;
    setBusy(item.bill_number);
    try {
      await confirmPendingPayment(item.bill_number, method);
      await refresh();
      setTab("paid_recently");
      toast("Payment confirmed.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Payment could not be confirmed.", "error");
    } finally { setBusy(null); }
  }

  const tabs: Array<[Tab, string, number?]> = [
    ["requested", "Requested Bills", queues.requested.length],
    ["awaiting_payment", "Issued / Awaiting Payment", queues.awaiting_payment.length],
    ["paid_recently", "Paid Recently", queues.paid_recently.length],
    ["printer_setup", "Printer Setup"],
  ];
  const items = tab === "requested" ? queues.requested : tab === "awaiting_payment" ? queues.awaiting_payment : tab === "paid_recently" ? queues.paid_recently : [];

  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
    <header><h1 className="text-3xl font-black">🧾 Billing Counter</h1><p className="mt-1 text-sm text-[var(--omlu-text-secondary)]">Issue official bills, collect payment, and retrieve receipts from one place.</p></header>
    <nav className="flex flex-wrap gap-2" aria-label="Billing Counter sections">
      {tabs.map(([value, label, count]) => <button key={value} onClick={() => setTab(value)} aria-current={tab === value ? "page" : undefined} className={`min-h-11 rounded-xl px-4 text-sm font-black ${tab === value ? "bg-orange-600 text-white" : "bg-[var(--omlu-muted-surface)]"}`}>{label}{count !== undefined ? ` (${count})` : ""}</button>)}
    </nav>
    {error && <div role="alert" className="rounded-xl border border-red-700 p-4 text-red-400">{error}</div>}
    {tab === "printer_setup" ? <section className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6"><h2 className="text-xl font-black">Printer Setup</h2><p className="mt-2 text-sm text-[var(--omlu-text-secondary)]">Browser printing uses the system print dialog. Direct LAN printer configuration remains available in the OMLU Operations app.</p><Link href="/admin/settings" className="mt-4 inline-flex rounded-xl bg-orange-600 px-4 py-3 font-black text-white">Open Settings</Link></section> : loading ? <div className="h-40 animate-pulse rounded-2xl bg-[var(--omlu-muted-surface)]" /> : items.length === 0 ? <div className="rounded-2xl border border-[var(--omlu-border)] p-10 text-center font-bold">No bills in this queue.</div> : <div className="grid gap-4 xl:grid-cols-2">
      {items.map((item) => <article key={item.bill_id} className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-5">
        <div className="flex justify-between gap-4"><div><p className="text-xs font-black uppercase text-orange-500">{item.status === "draft" ? "Bill requested" : item.status === "paid" ? "Paid" : "Awaiting payment"}</p><h2 className="text-xl font-black">Table {item.table_number}</h2><p className="text-xs">{item.invoice_number || item.bill_number}</p></div><p className="text-2xl font-black">{money(item.total_amount)}</p></div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-[var(--omlu-text-secondary)]">Items</dt><dd>{item.item_count}</dd></div><div><dt className="text-[var(--omlu-text-secondary)]">Requested</dt><dd>{new Date(item.requested_at).toLocaleString()}</dd></div><div><dt className="text-[var(--omlu-text-secondary)]">Subtotal</dt><dd>{money(item.subtotal)}</dd></div><div><dt className="text-[var(--omlu-text-secondary)]">GST / Tax</dt><dd>{money(item.tax_amount)}</dd></div></dl>
        {item.status === "draft" && <div className="mt-5 flex flex-wrap gap-2"><Link href={`/staff/tables/${item.table_id}`} className="rounded-xl border px-4 py-2 font-bold">Review Bill</Link><button disabled={busy === item.bill_number} onClick={() => void reopen(item)} className="rounded-xl border border-amber-600 px-4 py-2 font-bold text-amber-700 dark:text-amber-400 disabled:opacity-50">Reopen Ordering</button><button disabled={busy === item.bill_number} onClick={() => void issue(item, true)} className="rounded-xl bg-orange-600 px-4 py-2 font-black text-white disabled:opacity-50">Issue & Open Print</button><button disabled={busy === item.bill_number} onClick={() => void issue(item, false)} className="rounded-xl border px-4 py-2 font-bold disabled:opacity-50">Issue Without Printing</button></div>}
        {(item.status === "issued" || item.status === "payment_pending") && <div className="mt-5 flex flex-col gap-3">{receiptUrl(item) && <Link href={receiptUrl(item)!} target="_blank" className="rounded-xl border px-4 py-2 text-center font-bold">{item.status === "issued" ? "Print Bill" : "Reprint Bill"}</Link>}<div className="grid grid-cols-2 gap-2">{(["counter_cash", "counter_upi"] as Method[]).map((method) => <button key={method} role="radio" aria-checked={methods[item.bill_number] === method} onClick={() => setMethods((current) => ({...current, [item.bill_number]: method}))} className="rounded-xl border px-3 py-2 font-bold">{method === "counter_cash" ? "Cash" : "UPI"}</button>)}</div><button disabled={!methods[item.bill_number] || busy === item.bill_number} onClick={() => void collect(item)} className="rounded-xl bg-emerald-700 px-4 py-3 font-black text-white disabled:opacity-50">Confirm Payment</button></div>}
        {item.status === "paid" && <div className="mt-4 text-sm"><p>Method: {item.payment_method || "—"}</p><p>Paid: {item.paid_at ? new Date(item.paid_at).toLocaleString() : "—"}</p>{receiptUrl(item) && <Link href={receiptUrl(item)!} target="_blank" className="mt-3 inline-flex rounded-xl border px-4 py-2 font-bold">Print / Reprint Receipt</Link>}</div>}
      </article>)}
    </div>}
  </div>;
}
