"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { confirmPendingPayment, getBillingCounter, reopenBillOrdering, updateBillCustomerGstDetails } from "@/lib/api";
import { issueStaffBill } from "@/lib/api";
import { BillingCounterItem, BillingCounterQueues } from "@/lib/types";
import { useOmluUi } from "@/components/OmluUiProvider";
import { useRealtime } from "@/lib/realtime";
import { printIssuedBill } from "@/lib/print_service";
import { CustomerGstDetails, CustomerGstValue } from "@/components/billing/CustomerGstDetails";
import { createRefreshCoordinator } from "@/lib/queueRefresh.mjs";

type Tab = "requested" | "awaiting_payment" | "paid_recently";
type Method = "counter_cash" | "counter_upi";
const emptyQueues: BillingCounterQueues = { requested: [], awaiting_payment: [], paid_recently: [] };
const money = (value: string) => `₹${Number(value).toFixed(2)}`;

export default function BillingCounterClient() {
  const { confirm: confirmDialog, input: inputDialog, toast } = useOmluUi();
  const [queues, setQueues] = useState(emptyQueues);
  const [tab, setTab] = useState<Tab>("requested");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyBills, setBusyBills] = useState<Record<string, string>>({});
  const [methods, setMethods] = useState<Record<string, Method>>({});
  const issuing = useRef(new Set<string>());
  const recentMutations = useRef(new Set<string>());
  const refreshCoordinator = useRef<(() => Promise<void>) | null>(null);

  const setBillBusy = (billNumber: string, label?: string) => setBusyBills((current) => {
    const next = { ...current };
    if (label) next[billNumber] = label; else delete next[billNumber];
    return next;
  });

  const refresh = useCallback(() => {
    if (!refreshCoordinator.current) refreshCoordinator.current = createRefreshCoordinator(async () => {
      try { setQueues(await getBillingCounter()); setError(null); }
      catch (err) { setError(err instanceof Error ? err.message : "Could not load billing counter."); }
      finally { setLoading(false); }
    });
    return refreshCoordinator.current();
  }, []);

  useEffect(() => { const timeout = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timeout); }, [refresh]);
  useRealtime({
    target: { kind: "staff", channel: "operations" },
    onEvent: (event) => {
      if (!event.type.startsWith("bill.")) return;
      const billNumber = typeof event.state?.bill_number === "string" ? event.state.bill_number : null;
      if (billNumber && recentMutations.current.has(billNumber)) return;
      void refresh();
    },
    onReconnect: refresh,
  });

  async function issue(item: BillingCounterItem, openPrint: boolean) {
    if (item.status !== "draft" || issuing.current.has(item.bill_number)) return;
    issuing.current.add(item.bill_number);
    setBillBusy(item.bill_number, "Issuing…");
    try {
      const issued = await issueStaffBill(item.bill_number);
      recentMutations.current.add(item.bill_number);
      window.setTimeout(() => recentMutations.current.delete(item.bill_number), 2000);
      await refresh();
      setTab("awaiting_payment");
      setBillBusy(item.bill_number);

      if (openPrint && issued.receipt_token) {
        toast("Printing bill…", "information");
        const printRes = await printIssuedBill({
          billNumber: item.bill_number,
          sessionToken: item.session_token,
          receiptToken: issued.receipt_token,
        });

        if (printRes.success) {
          if (printRes.method === "bridge") {
            toast("Print complete", "success");
          }
        } else {
          toast("Bill issued, but printing failed.", "error");
        }
      } else if (openPrint) {
        toast("Bill issued, but printing failed.", "error");
      } else {
        toast("Bill issued.", "success");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Bill could not be issued.", "error");
    } finally {
      issuing.current.delete(item.bill_number);
      setBillBusy(item.bill_number);
    }
  }

  async function handleReprint(item: BillingCounterItem) {
    if (!item.receipt_token || busyBills[item.bill_number]) return;
    setBillBusy(item.bill_number, "Printing…");
    try {
      toast("Printing bill…", "information");
      const printRes = await printIssuedBill({
        billNumber: item.bill_number,
        sessionToken: item.session_token,
        receiptToken: item.receipt_token,
      });

      if (printRes.success) {
        if (printRes.method === "bridge") {
          toast("Print complete", "success");
        } else if (printRes.method === "iframe") {
          toast("Browser print dialog opened.", "information");
        }
      } else {
        toast(printRes.error || "Bill issued, but printing failed.", "error");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Bill issued, but printing failed.", "error");
    } finally {
      setBillBusy(item.bill_number);
    }
  }

  async function handleBrowserPrint(item: BillingCounterItem) {
    if (!item.receipt_token || busyBills[item.bill_number]) return;
    setBillBusy(item.bill_number, "Opening print preview…");
    try {
      await printIssuedBill({
        billNumber: item.bill_number,
        sessionToken: item.session_token,
        receiptToken: item.receipt_token,
        forceIframe: true,
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not open browser print dialog.", "error");
    } finally {
      setBillBusy(item.bill_number);
    }
  }

  async function reopen(item: BillingCounterItem) {
    if (item.status !== "draft" || busyBills[item.bill_number]) return;
    const reason = await inputDialog({
      title: "Reopen Ordering",
      message: `Reopen ordering for Table ${item.table_number}? This will return the session to open status.`,
      label: "Reason for reopening",
      placeholder: "e.g. Customer requested additional items",
      required: true,
      confirmLabel: "Reopen Ordering",
    });
    if (!reason) return;
    setBillBusy(item.bill_number, "Reopening…");
    try {
      await reopenBillOrdering(item.bill_number, reason);
      toast("Ordering has been reopened.", "success");
      await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not reopen ordering.", "error");
    } finally {
      setBillBusy(item.bill_number);
    }
  }

  async function collect(item: BillingCounterItem) {
    if (!["issued", "payment_pending"].includes(item.status)) return;
    const method = methods[item.bill_number];
    if (!method || busyBills[item.bill_number]) return;
    const accepted = await confirmDialog({
      title: `Confirm ${method === "counter_cash" ? "cash" : "UPI"} payment?`,
      message: "Confirm only after the restaurant has received the full payment.",
      details: [`Invoice: ${item.invoice_number || item.bill_number}`, `Table: ${item.table_number}`, `Amount: ${money(item.total_amount)}`],
      confirmLabel: "Confirm payment",
    });
    if (!accepted) return;
    setBillBusy(item.bill_number, "Confirming payment…");
    try {
      const paid = await confirmPendingPayment(item.bill_number, method);
      recentMutations.current.add(item.bill_number);
      window.setTimeout(() => recentMutations.current.delete(item.bill_number), 2000);
      const updated = { ...item, status: "paid" as const, payment_method: paid.payment_method as string, paid_at: paid.paid_at as string };
      setQueues((current) => ({
        requested: current.requested,
        awaiting_payment: current.awaiting_payment.filter((bill) => bill.bill_number !== item.bill_number),
        paid_recently: [updated, ...current.paid_recently.filter((bill) => bill.bill_number !== item.bill_number)].slice(0, 20),
      }));
      setTab("paid_recently");
      // Reconcile with the authoritative backend queue. Table screens receive
      // the committed table.status_changed event and refetch their table data.
      await refresh();
      toast("Payment confirmed.", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Payment could not be confirmed.", "error");
    } finally { setBillBusy(item.bill_number); }
  }

  async function saveCustomerGst(item: BillingCounterItem, details: CustomerGstValue | null) {
    await updateBillCustomerGstDetails(item.bill_number, details);
    toast(details ? "Customer GST details saved." : "Customer GST details removed.", "success");
    await refresh();
  }

  const tabs: Array<[Tab, string, number]> = [
    ["requested", "Requested Bills", queues.requested.length],
    ["awaiting_payment", "Issued / Awaiting Payment", queues.awaiting_payment.length],
    ["paid_recently", "Paid Recently", queues.paid_recently.length],
  ];
  const items = queues[tab];

  return <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-3xl font-black">🧾 Billing Counter</h1>
        <p className="mt-1 text-sm text-[var(--omlu-text-secondary)]">Issue official bills, collect payment, and retrieve receipts from one place.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin/settings#printing" className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-3.5 py-2 text-xs font-bold text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-muted-surface)] transition">
          🖨️ Printer Setup
        </Link>
      </div>
    </header>

    <nav className="flex flex-wrap gap-2" aria-label="Billing Counter sections">
      {tabs.map(([value, label, count]) => <button key={value} onClick={() => setTab(value)} aria-current={tab === value ? "page" : undefined} className={`min-h-11 rounded-xl px-4 text-sm font-black ${tab === value ? "bg-orange-600 text-white" : "bg-[var(--omlu-muted-surface)]"}`}>{label} ({count})</button>)}
    </nav>
    {error && <div role="alert" className="rounded-xl border border-red-700 p-4 text-red-400">{error}</div>}
    {loading ? <div className="h-40 animate-pulse rounded-2xl bg-[var(--omlu-muted-surface)]" /> : items.length === 0 ? <div className="rounded-2xl border border-[var(--omlu-border)] p-10 text-center font-bold">No bills in this queue.</div> : <div className="grid gap-4 xl:grid-cols-2">
      {items.map((item) => <article key={item.bill_id} className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-5">
        <div className="flex justify-between gap-4"><div><p className="text-xs font-black uppercase text-orange-500">{item.status === "draft" ? "Bill requested" : item.status === "paid" ? "Paid" : "Awaiting payment"}</p><h2 className="text-xl font-black">Table {item.table_number}</h2><p className="text-xs">{item.invoice_number || item.bill_number}</p></div><p className="text-2xl font-black">{money(item.total_amount)}</p></div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-[var(--omlu-text-secondary)]">Items</dt><dd>{item.item_count}</dd></div><div><dt className="text-[var(--omlu-text-secondary)]">Requested</dt><dd>{new Date(item.requested_at).toLocaleString()}</dd></div><div><dt className="text-[var(--omlu-text-secondary)]">Subtotal</dt><dd>{money(item.subtotal)}</dd></div><div><dt className="text-[var(--omlu-text-secondary)]">GST / Tax</dt><dd>{money(item.tax_amount)}</dd></div></dl>
        {item.has_customer_gst_details || (item.status === "draft" && item.gst_enabled) ? <CustomerGstDetails value={item.has_customer_gst_details && item.customer_gstin && item.customer_legal_name && item.customer_billing_address && item.customer_state_name && item.customer_state_code ? { gstin: item.customer_gstin, businessName: item.customer_legal_name, billingAddress: item.customer_billing_address, state: item.customer_state_name, stateCode: item.customer_state_code } : null} editable={item.status === "draft" && item.gst_enabled} disabled={Boolean(busyBills[item.bill_number])} onSave={(details) => saveCustomerGst(item, details)} onRemove={() => saveCustomerGst(item, null)} /> : null}
        {item.status === "draft" && <div className="mt-5 flex flex-wrap gap-2"><Link href={`/staff/tables/${item.table_id}`} className="rounded-xl border px-4 py-2 font-bold">Review Bill</Link><button disabled={Boolean(busyBills[item.bill_number])} onClick={() => void reopen(item)} className="rounded-xl border border-amber-600 px-4 py-2 font-bold text-amber-700 dark:text-amber-400 disabled:opacity-50">Reopen Ordering</button><button disabled={Boolean(busyBills[item.bill_number])} onClick={() => void issue(item, true)} className="rounded-xl bg-orange-600 px-4 py-2 font-black text-white disabled:opacity-50">{busyBills[item.bill_number] || "Issue & Open Print"}</button><button disabled={Boolean(busyBills[item.bill_number])} onClick={() => void issue(item, false)} className="rounded-xl border px-4 py-2 font-bold disabled:opacity-50">{busyBills[item.bill_number] || "Issue Without Printing"}</button></div>}
        {(item.status === "issued" || item.status === "payment_pending") && <div className="mt-5 flex flex-col gap-3">{item.receipt_token && <div className="grid grid-cols-2 gap-2"><button disabled={Boolean(busyBills[item.bill_number])} onClick={() => void handleReprint(item)} className="rounded-xl border border-[var(--omlu-border-strong)] px-3 py-2 text-center text-xs font-black text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-muted-surface)] disabled:opacity-50">{busyBills[item.bill_number] || (item.status === "issued" ? "Print Bill" : "Reprint Bill")}</button><button disabled={Boolean(busyBills[item.bill_number])} onClick={() => void handleBrowserPrint(item)} className="rounded-xl border border-[var(--omlu-border-strong)] px-3 py-2 text-center text-xs font-bold text-[var(--omlu-text-secondary)] hover:bg-[var(--omlu-muted-surface)] disabled:opacity-50">Browser Print</button></div>}<div className="grid grid-cols-2 gap-2">{(["counter_cash", "counter_upi"] as Method[]).map((method) => { const selected = methods[item.bill_number] === method; return <button key={method} role="radio" aria-checked={selected} disabled={Boolean(busyBills[item.bill_number])} onClick={() => setMethods((current) => ({...current, [item.bill_number]: method}))} className={`flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--omlu-page-background)] disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "border-orange-600 bg-orange-50 text-orange-950 ring-1 ring-orange-500/40 dark:bg-orange-950/40 dark:text-orange-100" : "border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] text-[var(--omlu-text-primary)] hover:bg-[var(--omlu-muted-surface)]"}`}><span aria-hidden="true" className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${selected ? "border-orange-700 bg-orange-600 text-white dark:border-orange-300" : "border-[var(--omlu-border-strong)] text-transparent"}`}>{selected ? "✓" : ""}</span>{method === "counter_cash" ? "Cash" : "UPI"}</button>; })}</div><button disabled={!methods[item.bill_number] || Boolean(busyBills[item.bill_number])} onClick={() => void collect(item)} className="rounded-xl bg-emerald-700 px-4 py-3 font-black text-white disabled:opacity-50">{busyBills[item.bill_number] || "Confirm Payment"}</button></div>}
        {item.status === "paid" && <div className="mt-4 text-sm"><p>Method: {item.payment_method || "—"}</p><p>Paid: {item.paid_at ? new Date(item.paid_at).toLocaleString() : "—"}</p>{item.receipt_token && <button disabled={Boolean(busyBills[item.bill_number])} onClick={() => void handleReprint(item)} className="mt-3 inline-flex rounded-xl border px-4 py-2 font-bold disabled:opacity-50">{busyBills[item.bill_number] || "Print / Reprint Receipt"}</button>}</div>}
      </article>)}
    </div>}
  </div>;
}
