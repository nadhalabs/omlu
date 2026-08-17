"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  confirmPendingPayment,
  getPendingPayments,
  issueStaffBill,
  lookupPendingPaymentCode,
} from "@/lib/api";
import { PaymentCodeLookupResponse, PendingPaymentItem } from "@/lib/types";
import { useRealtime } from "@/lib/realtime";
import { useOmluUi } from "@/components/OmluUiProvider";
import { registerAuthenticatedCleanup } from "@/lib/authRuntime.mjs";
import { printIssuedBill } from "@/lib/print_service";
import { createRefreshCoordinator } from "@/lib/queueRefresh.mjs";

type PaymentMethod = "counter_cash" | "counter_upi";

function money(value: string) { return `₹${Number(value).toFixed(2)}`; }
function dateTime(value: string) { return new Date(value).toLocaleString(); }
function waiting(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

interface Props {
  actorRole: string;
  showQueue?: boolean;
}

export default function PendingPaymentsClient({ actorRole, showQueue = true }: Props) {
  const { confirm: confirmDialog, toast } = useOmluUi();
  const selectedBill = useSearchParams().get("bill");
  const canConfirm = actorRole === "owner" || actorRole === "admin";
  const [items, setItems] = useState<PendingPaymentItem[]>([]);
  const [loading, setLoading] = useState(showQueue);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | PendingPaymentItem["stage"]>("all");
  const [paymentCode, setPaymentCode] = useState("");
  const [lookupResult, setLookupResult] = useState<PaymentCodeLookupResponse | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [methods, setMethods] = useState<Record<string, PaymentMethod>>({});
  const [submittingBills, setSubmittingBills] = useState<Record<string, boolean>>({});
  const refreshCoordinator = useRef<(() => Promise<void>) | null>(null);
  const recentMutations = useRef(new Set<string>());

  const refresh = useCallback((showLoading = false) => {
    if (!showQueue) return;
    if (showLoading) setLoading(true);
    if (!refreshCoordinator.current) refreshCoordinator.current = createRefreshCoordinator(async () => {
      try { setItems(await getPendingPayments()); setError(null); }
      catch (err) { setError(err instanceof Error ? err.message : "Could not load pending payments."); }
      finally { setLoading(false); }
    });
    return refreshCoordinator.current();
  }, [showQueue]);

  useEffect(() => {
    if (!showQueue) return;
    const timeout = window.setTimeout(() => void refresh(true), 0);
    const unregister = registerAuthenticatedCleanup(() => window.clearTimeout(timeout));
    return () => { unregister(); window.clearTimeout(timeout); };
  }, [refresh, showQueue]);

  useEffect(() => {
    if (!selectedBill || loading) return;
    document.getElementById(`bill-${selectedBill}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [loading, selectedBill, items]);

  useEffect(() => {
    if (!showQueue) return;
    const visible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    const unregister = registerAuthenticatedCleanup(() => {
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", visible);
    });
    return () => { unregister(); document.removeEventListener("visibilitychange", visible); window.removeEventListener("focus", visible); };
  }, [refresh, showQueue]);

  const realtimeStatus = useRealtime({
    target: { kind: "staff", channel: "operations" },
    onEvent: (event) => {
      if (!["bill.generated", "bill.updated", "bill.detached_for_payment", "bill.sent_to_counter", "bill.payment_pending", "bill.payment_recorded", "bill.paid"].includes(event.type)) return;
      const billNumber = typeof event.state?.bill_number === "string" ? event.state.bill_number : null;
      if (billNumber && recentMutations.current.has(billNumber)) return;
      void refresh();
    },
    onReconnect: refresh,
  });

  async function collectPayment(billNumber: string, table: string, amount: string) {
    if (!canConfirm) return;
    const method = methods[billNumber];
    if (!method) return;
    if (submittingBills[billNumber]) return;

    const methodLabel = method === "counter_cash" ? "Cash" : "UPI";
    const confirmTitle = method === "counter_cash" ? "Confirm cash payment?" : "Confirm UPI payment?";

    await confirmDialog({
      title: confirmTitle,
      message: "Confirm only after the restaurant has received the full payment.",
      details: [
        `Bill: ${billNumber}`,
        `Table: ${table}`,
        `Amount: ${money(amount)}`,
        `Method: ${methodLabel}`,
      ],
      confirmLabel: "Confirm payment",
      cancelLabel: "Cancel",
      onConfirm: async () => {
        if (submittingBills[billNumber]) return;
        setSubmittingBills((prev) => ({ ...prev, [billNumber]: true }));
        try {
          await confirmPendingPayment(billNumber, method);
          recentMutations.current.add(billNumber);
          window.setTimeout(() => recentMutations.current.delete(billNumber), 2000);
          setItems((current) => current.filter((item) => item.bill_number !== billNumber));
          setLookupResult((current) => (current?.bill_number === billNumber ? null : current));
          window.dispatchEvent(new Event("admin-operational-counts-changed"));
          toast("Payment confirmed.", "success");
        } catch (err) {
          throw new Error(err instanceof ApiError ? err.message : "Payment confirmation failed.");
        } finally {
          setSubmittingBills((prev) => ({ ...prev, [billNumber]: false }));
        }
      },
    });
  }

  async function lookupCode() {
    const normalized = paymentCode.replace(/\s+/g, "").toUpperCase();
    setPaymentCode(normalized);
    setLookupResult(null);
    setLookupError(null);
    if (normalized.length !== 6) { setLookupError("Enter the six-character payment code."); return; }
    setLookingUp(true);
    try { setLookupResult(await lookupPendingPaymentCode(normalized)); }
    catch (err) { setLookupError(err instanceof ApiError ? err.message : "Could not look up this payment code."); }
    finally { setLookingUp(false); }
  }

  const pendingIssueTokens = useState<Set<string>>(() => new Set())[0];
  const [issuingBills, setIssuingBills] = useState<Record<string, boolean>>({});

  async function issue(payment: PendingPaymentItem, openPrint: boolean) {
    if (pendingIssueTokens.has(payment.bill_number) || issuingBills[payment.bill_number]) return;
    pendingIssueTokens.add(payment.bill_number);
    setIssuingBills((prev) => ({ ...prev, [payment.bill_number]: true }));

    try {
      const issued = await issueStaffBill(payment.bill_number);
      recentMutations.current.add(payment.bill_number);
      window.setTimeout(() => recentMutations.current.delete(payment.bill_number), 2000);
      setItems((current) => current.map((item) => item.bill_number === payment.bill_number ? {
        ...item,
        status: "issued",
        stage: "bill_issued",
        total_amount: issued.total_amount,
        grand_total: issued.total_amount,
        remaining_amount: issued.total_amount,
      } : item));
      window.dispatchEvent(new Event("admin-operational-counts-changed"));

      setIssuingBills((prev) => ({ ...prev, [payment.bill_number]: false }));

      if (openPrint && issued.receipt_token) {
        toast("Printing bill…", "information");
        const printRes = await printIssuedBill({
          billNumber: payment.bill_number,
          sessionToken: payment.session_token,
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
      toast(err instanceof ApiError ? err.message : "Failed to issue bill.", "error");
    } finally {
      pendingIssueTokens.delete(payment.bill_number);
      setIssuingBills((prev) => ({ ...prev, [payment.bill_number]: false }));
    }
  }

  const visibleItems = tab === "all" ? items : items.filter((item) => item.stage === tab);
  const stageLabel = (stage: PendingPaymentItem["stage"]) => ({
    bill_requested: "Bill requested",
    bill_issued: "Bill issued",
    detached_awaiting_payment: "Table released · Awaiting payment",
    ready_for_payment: "Ready for payment",
    payment_pending: "Payment pending",
  })[stage];

  const renderMethodSelector = (billNumber: string) => {
    const currentMethod = methods[billNumber];
    const isSubmitting = Boolean(submittingBills[billNumber]);
    return (
      <div className="flex flex-col gap-1.5">
        <span id={`method-label-${billNumber}`} className="text-xs font-bold uppercase text-[var(--omlu-text-secondary)]">
          Payment method
        </span>
        <div
          role="radiogroup"
          aria-labelledby={`method-label-${billNumber}`}
          aria-label="Payment method"
          className="grid grid-cols-2 gap-2"
        >
          <button
            type="button"
            role="radio"
            aria-checked={currentMethod === "counter_cash"}
            aria-label="Cash"
            disabled={isSubmitting}
            onClick={() => setMethods((prev) => ({ ...prev, [billNumber]: "counter_cash" }))}
            className={`min-h-11 flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
              currentMethod === "counter_cash"
                ? "border-emerald-600 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-black ring-1 ring-emerald-600"
                : "border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] text-[var(--omlu-text-primary)] hover:border-[var(--omlu-text-secondary)]"
            }`}
          >
            {currentMethod === "counter_cash" && <span className="font-black text-emerald-600 dark:text-emerald-400">✓</span>}
            <span>Cash</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={currentMethod === "counter_upi"}
            aria-label="UPI"
            disabled={isSubmitting}
            onClick={() => setMethods((prev) => ({ ...prev, [billNumber]: "counter_upi" }))}
            className={`min-h-11 flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
              currentMethod === "counter_upi"
                ? "border-emerald-600 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-black ring-1 ring-emerald-600"
                : "border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] text-[var(--omlu-text-primary)] hover:border-[var(--omlu-text-secondary)]"
            }`}
          >
            {currentMethod === "counter_upi" && <span className="font-black text-emerald-600 dark:text-emerald-400">✓</span>}
            <span>UPI</span>
          </button>
        </div>
      </div>
    );
  };

  const renderConfirmButton = (billNumber: string, table: string, amount: string) => {
    const currentMethod = methods[billNumber];
    const isSubmitting = Boolean(submittingBills[billNumber]);
    const isDisabled = !currentMethod || isSubmitting || !canConfirm;

    let buttonText = `Confirm payment · ${money(amount)}`;
    if (isSubmitting) {
      buttonText = "Confirming payment…";
    } else if (currentMethod === "counter_cash") {
      buttonText = `Confirm cash payment · ${money(amount)}`;
    } else if (currentMethod === "counter_upi") {
      buttonText = `Confirm UPI payment · ${money(amount)}`;
    }

    return (
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => void collectPayment(billNumber, table, amount)}
        className="min-h-11 w-full sm:flex-1 rounded-xl bg-emerald-700 px-4 font-black text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {buttonText}
      </button>
    );
  };

  return <div className="flex flex-col gap-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-black text-[var(--omlu-text-primary)]">Pending Payments {showQueue && <span className="ml-2 rounded-full bg-red-600 px-2.5 py-1 text-xs text-white">{items.length}</span>}</h1>
        <p className="mt-1 text-sm text-[var(--omlu-text-secondary)]">Find a detached bill by the customer&apos;s payment code{showQueue ? ` · Real-time: ${realtimeStatus}` : "."}</p></div>
      {showQueue && <button type="button" onClick={() => void refresh(true)} className="min-h-11 rounded-xl border border-[var(--omlu-border)] px-4 text-sm font-bold">Refresh</button>}
    </header>

    <section className="rounded-2xl border border-orange-500/40 bg-orange-500/10 p-5" aria-labelledby="payment-code-heading">
      <h2 id="payment-code-heading" className="text-lg font-black">Payment code lookup</h2>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input aria-label="Six-character payment code" autoCapitalize="characters" autoComplete="off" maxLength={6} value={paymentCode} onChange={(event) => setPaymentCode(event.target.value.replace(/\s+/g, "").toUpperCase())} onKeyDown={(event) => event.key === "Enter" && void lookupCode()} placeholder="ABC234" className="min-h-12 flex-1 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-4 text-center font-mono text-xl font-black uppercase tracking-[0.25em]" />
        <button type="button" disabled={lookingUp} onClick={() => void lookupCode()} className="min-h-12 rounded-xl bg-orange-600 px-6 font-black text-white disabled:opacity-50">{lookingUp ? "Looking up…" : "Find bill"}</button>
      </div>
      {lookupError && <p role="alert" className="mt-3 text-sm font-bold text-red-400">{lookupError}</p>}
      {lookupResult && <div className="mt-4 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-4">
        <div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs font-bold uppercase text-[var(--omlu-text-secondary)]">Detached bill</p><h3 className="text-xl font-black">{lookupResult.original_table}</h3><p className="text-xs">{lookupResult.bill_number}</p></div><p className="text-2xl font-black text-orange-500">{money(lookupResult.amount_due)}</p></div>
        <p className="mt-3 text-sm">{lookupResult.order_summary.order_count} orders · {lookupResult.order_summary.item_count} items{lookupResult.order_summary.items.length ? ` · ${lookupResult.order_summary.items.join(", ")}` : ""}</p>
        {canConfirm && lookupResult.can_confirm_payment ? <div className="mt-4 flex flex-col gap-3">
          {renderMethodSelector(lookupResult.bill_number)}
          {renderConfirmButton(lookupResult.bill_number, lookupResult.original_table, lookupResult.amount_due)}
        </div> : <p className="mt-4 rounded-lg bg-[var(--omlu-muted-surface)] p-3 text-sm font-bold">Ask an owner or admin to confirm payment.</p>}
      </div>}
    </section>

    {showQueue && <>
      {error && <div role="alert" className="rounded-xl border border-red-800 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>}
      <nav className="flex flex-wrap gap-2" aria-label="Pending payment filters">{([[
        "all", "All"], ["bill_requested", "Bill requested"], ["detached_awaiting_payment", "Detached"], ["ready_for_payment", "Ready"], ["payment_pending", "Payment pending"],
      ] as const).map(([value, label]) => <button type="button" key={value} onClick={() => setTab(value)} className={`min-h-11 rounded-xl px-4 text-sm font-black ${tab === value ? "bg-orange-600 text-white" : "bg-[var(--omlu-muted-surface)]"}`}>{label}</button>)}</nav>
      {loading ? <div className="h-48 animate-pulse rounded-2xl bg-[var(--omlu-muted-surface)]" /> : visibleItems.length === 0 ? <div className="rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-12 text-center"><h2 className="font-black">No payments in this view</h2></div> :
        <div className="grid gap-4 xl:grid-cols-2">{visibleItems.map((item) => {
          const detached = item.stage === "detached_awaiting_payment";
          return <article id={`bill-${item.bill_number}`} key={item.bill_id} className={`rounded-2xl border bg-[var(--omlu-primary-surface)] p-5 ${detached ? "border-orange-500" : selectedBill === item.bill_number ? "border-orange-500 ring-2 ring-orange-500/20" : "border-[var(--omlu-border)]"}`}>
            <div className="flex flex-wrap justify-between gap-4"><div><p className={`text-xs font-black uppercase ${detached ? "text-orange-500" : "text-sky-400"}`}>{stageLabel(item.stage)}</p><h2 className="text-xl font-black">{item.table_name}</h2><p className="break-all text-xs">{item.bill_number}</p></div><p className="text-2xl font-black text-orange-500">{money(item.remaining_amount)}</p></div>
            {detached && item.payment_code && <div className="mt-4 rounded-xl bg-orange-500/10 p-4 text-center"><p className="text-xs font-bold uppercase">Payment code</p><p className="mt-1 font-mono text-3xl font-black tracking-[0.2em]">{item.payment_code}</p></div>}
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-[var(--omlu-text-secondary)]">Requested</dt><dd>{dateTime(item.requested_at)}</dd></div><div><dt className="text-[var(--omlu-text-secondary)]">Waiting</dt><dd>{waiting(item.detached_at || item.requested_at)}</dd></div><div><dt className="text-[var(--omlu-text-secondary)]">Orders</dt><dd>{item.order_summary.order_count} · {item.order_summary.item_count} items</dd></div><div><dt className="text-[var(--omlu-text-secondary)]">Sent by</dt><dd>{item.sent_by_staff_name || "Staff"}</dd></div></dl>
            <div className="mt-5 flex flex-col gap-3">
              {item.stage === "bill_requested" ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Link href={`/bill/${encodeURIComponent(item.session_token)}`} className="min-h-11 w-full sm:w-auto rounded-xl border border-[var(--omlu-border)] px-4 py-2.5 text-center text-sm font-bold">View bill</Link>
                  <button
                    type="button"
                    disabled={issuingBills[item.bill_number]}
                    onClick={() => void issue(item, true)}
                    className="min-h-11 w-full sm:flex-1 rounded-xl bg-orange-600 px-4 font-black text-white disabled:opacity-50"
                  >
                    {issuingBills[item.bill_number] ? "Issuing…" : "Issue & Open Print"}
                  </button>
                  <button
                    type="button"
                    disabled={issuingBills[item.bill_number]}
                    onClick={() => void issue(item, false)}
                    className="min-h-11 w-full sm:w-auto rounded-xl border border-[var(--omlu-border)] px-4 py-2.5 text-center text-sm font-bold disabled:opacity-50"
                  >
                    Issue Without Printing
                  </button>
                </div>
              ) : canConfirm ? (
                <div className="flex flex-col gap-3">
                  {renderMethodSelector(item.bill_number)}
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Link href={`/bill/${encodeURIComponent(item.session_token)}`} className="min-h-11 w-full sm:w-auto rounded-xl border border-[var(--omlu-border)] px-4 py-2.5 text-center text-sm font-bold">View bill</Link>
                    {renderConfirmButton(item.bill_number, item.table_name, item.remaining_amount)}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Link href={`/bill/${encodeURIComponent(item.session_token)}`} className="min-h-11 w-full rounded-xl border border-[var(--omlu-border)] px-4 py-2.5 text-center text-sm font-bold">View bill</Link>
                </div>
              )}
            </div>
          </article>;
        })}</div>}
    </>}
  </div>;
}
