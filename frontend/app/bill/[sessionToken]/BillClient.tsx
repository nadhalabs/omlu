"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, getPublicBill, requestPayAtCounter } from "@/lib/api";
import { BillResponse, CounterPaymentMethod } from "@/lib/types";
import { buildWhatsAppBillShareUrl } from "@/lib/billShare";
import { useRealtime } from "@/lib/realtime";
import {
  hasSeenPaymentSuccess,
  markPaymentSuccessSeen,
} from "@/lib/publicSessionStorage";

interface BillClientProps {
  sessionToken: string;
}

export default function BillClient({ sessionToken }: BillClientProps) {
  const router = useRouter();
  const [bill, setBill] = useState<BillResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentAction, setPaymentAction] = useState<CounterPaymentMethod | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [language, setLanguage] = useState<"en" | "ml">("en");
  const [showPaymentSuccess, setShowPaymentSuccess] = useState<boolean>(false);
  const hasLoadedBillRef = useRef(false);
  const paidStatusRef = useRef<string | null>(null);

  const labels = {
    en: {
      title: "Table Bill",
      table: "Table",
      status: "Status",
      generated: "Generated",
      billNumber: "Bill number",
      loading: "Loading bill...",
      retry: "Retry",
      notFound: "Bill not found",
      notFoundDesc: "Ask the staff or return to the table session to prepare the bill.",
      orders: "Orders",
      subtotal: "Subtotal",
      tax: "Tax",
      discount: "Discount",
      total: "Final total",
      print: "Download / Print Bill",
      whatsapp: "Share on WhatsApp",
      payAtCounter: "Pay at Counter",
      cash: "Cash",
      upi: "UPI at Counter",
      paymentPending: "Payment pending at counter",
      paymentMethod: "Payment method",
      paidAt: "Paid at",
      back: "Back to table bill",
      paymentReceived: "Payment received",
      receiptAction: "View receipt",
      paidAmount: "Paid amount",
      paymentLabels: {
        counter_cash: "Cash at counter",
        counter_upi: "UPI at counter",
        counter_card: "Card at counter",
        online: "Online",
      } as Record<string, string>,
      statusLabels: {
        draft: "Draft",
        issued: "Issued / payment requested",
        payment_pending: "Payment pending",
        paid: "Paid",
        cancelled: "Cancelled",
      } as Record<string, string>,
    },
    ml: {
      title: "ടേബിൾ ബിൽ",
      table: "മേശ",
      status: "നില",
      generated: "സൃഷ്ടിച്ചത്",
      billNumber: "ബിൽ നമ്പർ",
      loading: "ബിൽ ലോഡ് ചെയ്യുന്നു...",
      retry: "വീണ്ടും ശ്രമിക്കുക",
      notFound: "ബിൽ കണ്ടെത്തിയില്ല",
      notFoundDesc: "സ്റ്റാഫിനെ അറിയിക്കുക അല്ലെങ്കിൽ ടേബിൾ സെഷനിൽ നിന്ന് ബിൽ തയ്യാറാക്കുക.",
      orders: "ഓർഡറുകൾ",
      subtotal: "ആകെ",
      tax: "നികുതി",
      discount: "ഡിസ്കൗണ്ട്",
      total: "അവസാന തുക",
      print: "ബിൽ ഡൗൺലോഡ് / പ്രിന്റ് ചെയ്യുക",
      whatsapp: "WhatsApp-ൽ പങ്കിടുക",
      payAtCounter: "കൗണ്ടറിൽ പണമടയ്ക്കുക",
      cash: "കാഷ്",
      upi: "കൗണ്ടറിൽ UPI",
      paymentPending: "കൗണ്ടറിൽ പേയ്മെന്റ് കാത്തിരിക്കുന്നു",
      paymentMethod: "പേയ്മെന്റ് രീതി",
      paidAt: "പണം നൽകിയ സമയം",
      back: "ടേബിൾ ബില്ലിലേക്ക് മടങ്ങുക",
      paymentReceived: "പണം ലഭിച്ചു",
      receiptAction: "രസീത് കാണുക",
      paidAmount: "അടച്ച തുക",
      paymentLabels: {
        counter_cash: "കൗണ്ടറിൽ കാഷ്",
        counter_upi: "കൗണ്ടറിൽ UPI",
        counter_card: "കൗണ്ടറിൽ കാർഡ്",
        online: "ഓൺലൈൻ",
      } as Record<string, string>,
      statusLabels: {
        draft: "ഡ്രാഫ്റ്റ്",
        issued: "ബിൽ നൽകി / പേയ്മെന്റ് അഭ്യർത്ഥിച്ചു",
        payment_pending: "പേയ്മെന്റ് കാത്തിരിക്കുന്നു",
        paid: "പണം നൽകി",
        cancelled: "റദ്ദാക്കി",
      } as Record<string, string>,
    },
  };

  const t = labels[language];

  const formatBillTotal = useCallback(
    (nextBill: BillResponse) =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: nextBill.currency || "INR",
      }).format(Number(nextBill.total_amount)),
    []
  );

  const celebratePayment = useCallback(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reducedMotion && "vibrate" in navigator) {
      navigator.vibrate?.([80, 40, 80]);
    }

    const userActivation = navigator.userActivation;
    if (!reducedMotion && userActivation?.hasBeenActive) {
      try {
        const AudioContextCtor =
          window.AudioContext ||
          (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextCtor) return;
        const audioContext = new AudioContextCtor();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(660, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.12);
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.06, audioContext.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.18);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.2);
        window.setTimeout(() => void audioContext.close(), 300);
      } catch {
        // Browsers may reject audio without permission or activation; the visual receipt remains authoritative.
      }
    }
  }, []);

  const applyFetchedBill = useCallback(
    (data: BillResponse, source: "initial" | "event" | "poll" | "action") => {
      const previousStatus = paidStatusRef.current;
      const isPaid = data.status === "paid";
      const billKey = data.bill_number;
      const seen = hasSeenPaymentSuccess(sessionToken, billKey);

      setBill(data);
      setError(null);
      paidStatusRef.current = data.status;

      if (!isPaid) {
        setShowPaymentSuccess(false);
        hasLoadedBillRef.current = true;
        return;
      }

      if (!hasLoadedBillRef.current && source === "initial") {
        markPaymentSuccessSeen(sessionToken, billKey);
        hasLoadedBillRef.current = true;
        return;
      }

      const becamePaid = previousStatus !== "paid";
      if (source === "event" && becamePaid && !seen) {
        markPaymentSuccessSeen(sessionToken, billKey);
        setShowPaymentSuccess(true);
        celebratePayment();
      } else if (seen) {
        setShowPaymentSuccess(false);
      }

      hasLoadedBillRef.current = true;
    },
    [celebratePayment, sessionToken]
  );

  const fetchBill = useCallback(
    async (
      showLoading = true,
      source: "initial" | "event" | "poll" | "action" = "poll"
    ) => {
      if (showLoading) setLoading(true);
      try {
        const data = await getPublicBill(sessionToken);
        applyFetchedBill(data, source);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.status === 404 ? t.notFound : err.message);
        } else {
          setError("Could not connect to the backend server.");
        }
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [applyFetchedBill, sessionToken, t.notFound]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => fetchBill(true, "initial"), 0);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchBill(false, "poll");
      }
    };
    const handleOnline = () => fetchBill(false, "poll");
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
    };
  }, [fetchBill]);

  useRealtime({
    target: { kind: "session", token: sessionToken },
    onEvent: () => void fetchBill(false, "event"),
    onReconnect: () => void fetchBill(false, "poll"),
  });

  useEffect(() => {
    const interval = window.setInterval(() => fetchBill(false, "poll"), 6_000);
    return () => window.clearInterval(interval);
  }, [fetchBill]);

  const billUrl =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/bill/${encodeURIComponent(sessionToken)}`;

  const handlePayAtCounter = async (method: CounterPaymentMethod) => {
    if (!bill || paymentAction) return;
    setPaymentAction(method);
    setPaymentError(null);
    try {
      const updated = await requestPayAtCounter(sessionToken, method);
      applyFetchedBill(updated, "action");
    } catch (err) {
      if (err instanceof ApiError) setPaymentError(err.message);
      else setPaymentError("Failed to request counter payment.");
    } finally {
      setPaymentAction(null);
    }
  };

  if (loading && !bill) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 py-8 dark:bg-zinc-950">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-amber-600" />
        <p className="mt-4 font-medium text-zinc-600 dark:text-zinc-400">
          {t.loading}
        </p>
      </div>
    );
  }

  if (error && !bill) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-6 text-center dark:bg-zinc-950">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-black text-zinc-950 dark:text-zinc-50">
            {error}
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            {t.notFoundDesc}
          </p>
          <button
            onClick={() => fetchBill(true)}
            className="mt-6 min-h-12 rounded-2xl bg-amber-600 px-6 py-3 font-bold text-white"
          >
            {t.retry}
          </button>
        </div>
      </div>
    );
  }

  if (!bill) return null;

  const shareUrl = buildWhatsAppBillShareUrl(bill, billUrl);
  const paidMethodLabel = bill.payment_method
    ? t.paymentLabels[bill.payment_method] || bill.payment_method
    : t.statusLabels.paid;

  return (
    <div className="min-h-screen bg-zinc-100 px-4 py-6 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100 sm:px-6 print:bg-white print:px-0 print:py-0 print:text-black">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 print:max-w-none print:gap-0">
        <div className="print-hidden flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => router.push(`/session/${bill.session_token}`)}
            className="min-h-11 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-700 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
          >
            {t.back}
          </button>
          <button
            onClick={() => setLanguage(language === "en" ? "ml" : "en")}
            className="min-h-11 rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-amber-700 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-amber-500"
          >
            {language === "en" ? "മലയാളം" : "English"}
          </button>
        </div>

        <article className="print-bill-sheet rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 print:rounded-none print:border-0 print:p-8 print:shadow-none">
          <header className="border-b border-zinc-200 pb-5 dark:border-zinc-800 print:border-black">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-amber-700 dark:text-amber-500 print:text-black">
                  {bill.restaurant_name}
                </p>
                <h1 className="mt-1 text-3xl font-black">{t.title}</h1>
                <p className="mt-1 text-sm font-bold text-zinc-500 dark:text-zinc-400 print:text-black">
                  {t.table} {bill.table_number}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold uppercase text-zinc-400 print:text-black">
                  {t.status}
                </p>
                <p className="mt-1 rounded-xl bg-amber-50 px-3 py-1 text-sm font-black text-amber-700 dark:bg-amber-950/20 dark:text-amber-500 print:bg-white print:px-0 print:text-black">
                  {t.statusLabels[bill.status] || bill.status}
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <p>
                <span className="font-bold">{t.billNumber}:</span>{" "}
                {bill.bill_number}
              </p>
              <p className="sm:text-right">
                <span className="font-bold">{t.generated}:</span>{" "}
                {new Date(bill.generated_at).toLocaleString()}
              </p>
            </div>
            {bill.payment_method && (
              <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <p>
                  <span className="font-bold">{t.paymentMethod}:</span>{" "}
                  {t.paymentLabels[bill.payment_method] || bill.payment_method}
                </p>
                {bill.paid_at && (
                  <p className="sm:text-right">
                    <span className="font-bold">{t.paidAt}:</span>{" "}
                    {new Date(bill.paid_at).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </header>

          <main className="py-5">
            <h2 className="mb-4 text-sm font-black uppercase tracking-wide text-zinc-500 dark:text-zinc-400 print:text-black">
              {t.orders}
            </h2>
            <div className="flex flex-col gap-5">
              {bill.orders.map((order, orderIndex) => (
                <section
                  key={order.order_number}
                  className="rounded-2xl border border-zinc-100 p-4 dark:border-zinc-800 print:rounded-none print:border-black"
                >
                  <div className="mb-3 flex items-center justify-between gap-3 border-b border-zinc-100 pb-2 dark:border-zinc-800 print:border-black">
                    <h3 className="font-black">
                      Order {orderIndex + 1}: {order.order_number}
                    </h3>
                    <p className="text-xs font-bold uppercase text-zinc-500">
                      {order.status}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {order.items.map((item, itemIndex) => (
                      <div
                        key={`${order.order_number}-${itemIndex}`}
                        className="grid grid-cols-[1fr_auto] gap-3 text-sm"
                      >
                        <div>
                          <p className="font-bold">{item.item_name}</p>
                          <p className="text-xs text-zinc-500 print:text-black">
                            {item.quantity} × {bill.currency}{" "}
                            {Number(item.unit_price).toFixed(2)}
                          </p>
                        </div>
                        <p className="font-black">
                          {bill.currency} {Number(item.line_total).toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-between border-t border-zinc-100 pt-2 text-sm dark:border-zinc-800 print:border-black">
                    <span className="font-bold">{t.subtotal}</span>
                    <span className="font-black">
                      {bill.currency} {Number(order.subtotal).toFixed(2)}
                    </span>
                  </div>
                </section>
              ))}
            </div>
          </main>

          <footer className="border-t border-zinc-200 pt-5 dark:border-zinc-800 print:border-black">
            <div className="ml-auto flex max-w-sm flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span>{t.subtotal}</span>
                <span className="font-bold">
                  {bill.currency} {Number(bill.subtotal).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{t.tax}</span>
                <span className="font-bold">
                  {bill.currency} {Number(bill.tax_amount).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{t.discount}</span>
                <span className="font-bold">
                  {bill.currency} {Number(bill.discount_amount).toFixed(2)}
                </span>
              </div>
              <div className="mt-2 flex justify-between border-t border-zinc-200 pt-3 text-xl font-black dark:border-zinc-800 print:border-black">
                <span>{t.total}</span>
                <span>
                  {bill.currency} {Number(bill.total_amount).toFixed(2)}
                </span>
              </div>
            </div>
          </footer>
        </article>

        {bill.status === "paid" && (
          <section
            className={`print-hidden rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-50 ${
              showPaymentSuccess ? "motion-safe:animate-pulse" : ""
            }`}
            aria-live="polite"
          >
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
              <div
                className={`grid h-16 w-16 shrink-0 place-items-center rounded-full bg-emerald-600 text-white shadow-lg ${
                  showPaymentSuccess ? "motion-safe:animate-bounce" : ""
                }`}
                aria-hidden="true"
              >
                <svg viewBox="0 0 32 32" className="h-9 w-9" fill="none">
                  <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="3" opacity="0.35" />
                  <path
                    d="M9 16.5 13.5 21 23 11"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-black">{t.paymentReceived}</h2>
                <div className="mt-2 grid grid-cols-1 gap-1 text-sm font-bold text-emerald-800 dark:text-emerald-200 sm:grid-cols-2">
                  <p>
                    {t.paidAmount}: {formatBillTotal(bill)}
                  </p>
                  <p>
                    {t.paymentMethod}: {paidMethodLabel}
                  </p>
                </div>
              </div>
              <button
                onClick={() => document.querySelector("article")?.scrollIntoView({ behavior: "smooth" })}
                className="min-h-12 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white shadow-md transition hover:bg-emerald-800"
              >
                {t.receiptAction}
              </button>
            </div>
          </section>
        )}

        <div className="print-hidden rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {bill.status === "issued" && (
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-black">{t.payAtCounter}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  onClick={() => handlePayAtCounter("counter_cash")}
                  disabled={paymentAction !== null}
                  className="min-h-14 rounded-2xl bg-zinc-950 px-5 py-4 text-base font-black text-white shadow-md transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950"
                >
                  {paymentAction === "counter_cash" ? "..." : t.cash}
                </button>
                <button
                  onClick={() => handlePayAtCounter("counter_upi")}
                  disabled={paymentAction !== null}
                  className="min-h-14 rounded-2xl bg-emerald-600 px-5 py-4 text-base font-black text-white shadow-md transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  {paymentAction === "counter_upi" ? "..." : t.upi}
                </button>
              </div>
            </div>
          )}
          {bill.status === "payment_pending" && (
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
              {t.paymentPending}
            </p>
          )}
          {bill.status === "paid" && (
            <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
              {t.statusLabels.paid}
            </p>
          )}
          {paymentError && (
            <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:bg-red-950/30 dark:text-red-400">
              {paymentError}
            </p>
          )}
        </div>

        <div className="print-hidden grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            onClick={() => window.print()}
            className="min-h-14 rounded-2xl bg-amber-600 px-5 py-4 text-base font-black text-white shadow-md transition hover:bg-amber-700"
          >
            {t.print}
          </button>
          <button
            onClick={() => window.open(shareUrl, "_blank", "noopener,noreferrer")}
            className="min-h-14 rounded-2xl bg-emerald-600 px-5 py-4 text-base font-black text-white shadow-md transition hover:bg-emerald-700"
          >
            {t.whatsapp}
          </button>
        </div>
      </div>
    </div>
  );
}
