"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PublicThemeControl } from "@/components/PublicThemeControl";
import { ApiError, getPublicBill, getPublicDiningSession } from "@/lib/api";
import { BillResponse, PublicDiningSessionResponse } from "@/lib/types";
import { buildWhatsAppBillShareUrl } from "@/lib/billShare";
import { clearCustomerCartState, completionPath, markCompletedSession, readCompletedSession } from "@/lib/customerCompletion";
import { useRealtime } from "@/lib/realtime";
import {
  clearLegacyPublicReceiptToken,
  clearParticipantToken,
  clearPublicSessionToken,
  clearSessionParticipantToken,
  hasSeenPaymentSuccess,
  markPaymentSuccessSeen,
  readSessionParticipantToken,
} from "@/lib/publicSessionStorage";
import { clearDetachedSession, markDetachedSession } from "@/lib/customerDetachment";

interface BillClientProps {
  sessionToken: string;
  receiptToken?: string;
}

export default function BillClient({ sessionToken, receiptToken = "" }: BillClientProps) {
  const router = useRouter();
  const [bill, setBill] = useState<BillResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [waitingSession, setWaitingSession] = useState<PublicDiningSessionResponse | null>(null);
  const [language, setLanguage] = useState<"en" | "ml">("en");
  const [showPaymentSuccess, setShowPaymentSuccess] = useState<boolean>(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [participantToken, setParticipantToken] = useState<string | null>(
    () => readSessionParticipantToken(sessionToken)
  );
  const [receiptAccessToken, setReceiptAccessToken] = useState(receiptToken);
  const hasLoadedBillRef = useRef(false);
  const paidStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const enforce = () => { if (!receiptToken && readCompletedSession(sessionToken)) router.replace(completionPath(sessionToken)); };
    enforce();
    window.addEventListener("pageshow", enforce);
    window.addEventListener("popstate", enforce);
    window.addEventListener("focus", enforce);
    return () => { window.removeEventListener("pageshow", enforce); window.removeEventListener("popstate", enforce); window.removeEventListener("focus", enforce); };
  }, [receiptToken, router, sessionToken]);
  const labels = {
    en: {
      title: "Table Bill",
      table: "Table",
      status: "Status",
      generated: "Generated",
      billNumber: "Bill number",
      loading: "Loading bill...",
      retry: "Retry",
      unavailable: "Bill unavailable",
      unavailableDesc: "We could not open this bill. Please ask the restaurant staff for help.",
      requestedTitle: "Bill requested",
      requestedDesc: "The restaurant is preparing your bill.",
      stayHere: "You can stay on this page",
      autoUpdate: "This page will update automatically.",
      requestedAt: "Requested time",
      currentOrderTotal: "Current order total",
      orders: "Orders",
      subtotal: "Subtotal",
      tax: "Tax",
      discount: "Discount",
      total: "Final total",
      print: "Download / Print Bill",
      whatsapp: "Share on WhatsApp",
      payAtCounter: "Payment is handled at the counter",
      paymentPending: "Payment pending at counter",
      billBeingPrepared: "Your bill is being prepared. Please wait while staff sends it to the counter.",
      billReady: "Your bill is ready. Please proceed to the counter for payment.",
      billSentToCounter: "Your bill has been sent to the counter. Please proceed to the counter for payment.",
      paymentAwaitingConfirmation: "Payment is awaiting confirmation at the counter.",
      paymentComplete: "Payment received. Thank you!",
      paymentMethod: "Payment method",
      paidAt: "Paid at",
      back: "Back to table bill",
      paymentReceived: "Payment successful",
      receiptAction: "View receipt",
      paidAmount: "Paid amount",
      sessionComplete: "Your dining session is complete. Scan the table QR again to start a new order.",
      tableReady: "This table is now ready for the next guest.",
      doneLabel: "Done",
      viewFullReceipt: "View full receipt",
      /** Replaces raw operational kitchen status on paid customer-facing receipts. */
      receiptOrderStatus: "Received",
      billReadyTitle: "Bill ready",
      billReadyMessage: "Your ordering session has ended.",
      showCodeAtCounter: "Show this payment code at the counter:",
      paymentCode: "Payment code",
      copyCode: "Copy payment code",
      copied: "Copied",
      amountDue: "Amount due",
      paymentStatus: "Payment status",
      awaitingPayment: "Awaiting payment",
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
      unavailable: "ബിൽ ലഭ്യമല്ല",
      unavailableDesc: "ഈ ബിൽ തുറക്കാൻ കഴിഞ്ഞില്ല. ദയവായി റെസ്റ്റോറന്റ് സ്റ്റാഫിനോട് സഹായം ചോദിക്കുക.",
      requestedTitle: "ബിൽ അഭ്യർത്ഥിച്ചു",
      requestedDesc: "റെസ്റ്റോറന്റ് നിങ്ങളുടെ ബിൽ തയ്യാറാക്കുകയാണ്.",
      stayHere: "നിങ്ങൾക്ക് ഈ പേജിൽ തുടരാം",
      autoUpdate: "ബിൽ തയ്യാറാകുമ്പോൾ ഈ പേജ് സ്വയം പുതുക്കും.",
      requestedAt: "അഭ്യർത്ഥിച്ച സമയം",
      currentOrderTotal: "നിലവിലെ ഓർഡർ ആകെ",
      orders: "ഓർഡറുകൾ",
      subtotal: "ആകെ",
      tax: "നികുതി",
      discount: "ഡിസ്കൗണ്ട്",
      total: "അവസാന തുക",
      print: "ബിൽ ഡൗൺലോഡ് / പ്രിന്റ് ചെയ്യുക",
      whatsapp: "WhatsApp-ൽ പങ്കിടുക",
      payAtCounter: "പേയ്മെന്റ് കൗണ്ടറിൽ കൈകാര്യം ചെയ്യും",
      paymentPending: "കൗണ്ടറിൽ പേയ്മെന്റ് കാത്തിരിക്കുന്നു",
      billBeingPrepared: "നിങ്ങളുടെ ബിൽ തയ്യാറാക്കുകയാണ്. സ്റ്റാഫ് അത് കൗണ്ടറിലേക്ക് അയയ്ക്കുന്നതുവരെ കാത്തിരിക്കുക.",
      billReady: "നിങ്ങളുടെ ബിൽ തയ്യാറാണ്. പണമടയ്ക്കാൻ കൗണ്ടറിലേക്ക് പോകുക.",
      billSentToCounter: "നിങ്ങളുടെ ബിൽ കൗണ്ടറിലേക്ക് അയച്ചു. പണമടയ്ക്കാൻ കൗണ്ടറിലേക്ക് പോകുക.",
      paymentAwaitingConfirmation: "കൗണ്ടറിൽ പേയ്മെന്റ് സ്ഥിരീകരണത്തിനായി കാത്തിരിക്കുന്നു.",
      paymentComplete: "പേയ്മെന്റ് ലഭിച്ചു. നന്ദി!",
      paymentMethod: "പേയ്മെന്റ് രീതി",
      paidAt: "പണം നൽകിയ സമയം",
      back: "ടേബിൾ ബില്ലിലേക്ക് മടങ്ങുക",
      paymentReceived: "പണം ലഭിച്ചു",
      receiptAction: "രസീത് കാണുക",
      paidAmount: "അടച്ച തുക",
      sessionComplete: "നിങ്ങളുടെ ഡൈനിംഗ് സെഷൻ പൂർത്തിയായി. പുതിയ ഓർഡർ തുടങ്ങാൻ ടേബിൾ QR വീണ്ടും സ്കാൻ ചെയ്യുക.",
      tableReady: "ഈ ടേബിൾ അടുത്ത അതിഥിക്കായി തയ്യാറാണ്.",
      doneLabel: "പൂർത്തിയായി",
      viewFullReceipt: "പൂർണ്ണ രസീത് കാണുക",
      /** Replaces raw operational kitchen status on paid customer-facing receipts. */
      receiptOrderStatus: "ലഭിച്ചു",
      billReadyTitle: "ബിൽ തയ്യാറായി",
      billReadyMessage: "നിങ്ങളുടെ ഓർഡറിംഗ് സെഷൻ അവസാനിച്ചു.",
      showCodeAtCounter: "ഈ പേയ്മെന്റ് കോഡ് കൗണ്ടറിൽ കാണിക്കുക:",
      paymentCode: "പേയ്മെന്റ് കോഡ്",
      copyCode: "പേയ്മെന്റ് കോഡ് പകർത്തുക",
      copied: "പകർത്തി",
      amountDue: "അടയ്ക്കാനുള്ള തുക",
      paymentStatus: "പേയ്മെന്റ് നില",
      awaitingPayment: "പേയ്മെന്റ് കാത്തിരിക്കുന്നു",
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
      setWaitingSession(null);
      setError(null);
      paidStatusRef.current = data.status;
      if (data.status !== "draft" && data.receipt_token) {
        setReceiptAccessToken(data.receipt_token);
        const receiptUrl = `/bill/${encodeURIComponent(data.session_token)}?receipt=${encodeURIComponent(data.receipt_token)}`;
        window.history.replaceState(window.history.state, "", receiptUrl);
      }

      if (data.session_status === "detached_awaiting_payment" && data.receipt_token) {
        clearPublicSessionToken(data.restaurant_slug, data.table_code);
        clearParticipantToken(data.restaurant_slug, data.table_code);
        clearSessionParticipantToken(sessionToken);
        clearCustomerCartState(data.restaurant_slug, data.table_code, sessionToken);
        setParticipantToken(null);
        markDetachedSession({
          sessionToken,
          restaurantSlug: data.restaurant_slug,
          restaurantName: data.restaurant_name,
          tableCode: data.table_code,
          receiptToken: data.receipt_token,
        });
      }

      if (!isPaid) {
        setShowPaymentSuccess(false);
        hasLoadedBillRef.current = true;
        return;
      }

      clearPublicSessionToken(data.restaurant_slug, data.table_code);
      clearParticipantToken(data.restaurant_slug, data.table_code);
      clearLegacyPublicReceiptToken(data.restaurant_slug, data.table_code);
      clearSessionParticipantToken(sessionToken);
      clearCustomerCartState(data.restaurant_slug, data.table_code, sessionToken);
      clearDetachedSession(sessionToken);
      setParticipantToken(null);
      if (!receiptToken) {
        markCompletedSession({
          sessionToken,
          restaurantSlug: data.restaurant_slug,
          restaurantName: data.restaurant_name,
          tableCode: data.table_code,
          receiptToken: data.receipt_token || receiptAccessToken || undefined,
          totalAmount: new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: data.currency || "INR",
          }).format(Number(data.total_amount)),
          tableNumber: String(data.table_number),
        });
        router.replace(completionPath(sessionToken));
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
    [celebratePayment, receiptAccessToken, receiptToken, router, sessionToken]
  );

  const fetchBill = useCallback(
    async (
      showLoading = true,
      source: "initial" | "event" | "poll" | "action" = "poll"
    ) => {
      if (showLoading) setLoading(true);
      try {
        const authority = readSessionParticipantToken(sessionToken) || "";
        if (!authority && !receiptAccessToken) {
          throw new ApiError(401, "Your access to this table has ended.");
        }
        const data = await getPublicBill(sessionToken, authority, receiptAccessToken);
        applyFetchedBill(data, source);
      } catch (err) {
        const authority = readSessionParticipantToken(sessionToken) || "";
        if (err instanceof ApiError && err.status === 404 && authority && !receiptAccessToken) {
          try {
            const session = await getPublicDiningSession(sessionToken, authority);
            if (session.status === "payment_requested" && (!session.bill || session.bill.status === "draft")) {
              setBill(null);
              setWaitingSession(session);
              setError(null);
              return;
            }
          } catch {
            // The customer-friendly unavailable state below covers invalid or revoked authority.
          }
        }
        setWaitingSession(null);
        setError(t.unavailable);
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [applyFetchedBill, receiptAccessToken, sessionToken, t.unavailable]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => fetchBill(true, "initial"), 0);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchBill(false, "poll");
      }
    };
    const handleOnline = () => fetchBill(false, "poll");
    const handlePageRestore = () => fetchBill(false, "poll");
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handlePageRestore);
    window.addEventListener("pageshow", handlePageRestore);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handlePageRestore);
      window.removeEventListener("pageshow", handlePageRestore);
    };
  }, [fetchBill]);

  useRealtime({
    enabled: Boolean(participantToken),
    target: { kind: "session", token: sessionToken, participantToken: participantToken || undefined },
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
      : `${window.location.origin}/bill/${encodeURIComponent(sessionToken)}?receipt=${encodeURIComponent(receiptAccessToken)}`;

  if (loading && !bill && !waitingSession) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--omlu-muted-surface)] px-4 py-8 dark:bg-[var(--omlu-page-background)]">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-orange-600" />
        <p className="mt-4 font-medium text-[var(--omlu-text-secondary)] dark:text-[var(--omlu-text-secondary)]">
          {t.loading}
        </p>
      </div>
    );
  }

  const draftWaiting = bill?.session_status === "payment_requested" && bill.status === "draft";
  const waitingTable = waitingSession?.table_number || bill?.table_number;
  const waitingTotal = waitingSession?.combined_subtotal || bill?.total_amount;
  const waitingRequestedAt = waitingSession?.payment_requested_at || bill?.payment_requested_at || bill?.generated_at;

  if ((waitingSession || draftWaiting) && !error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--omlu-page-background)] p-5 text-[var(--omlu-text-primary)]">
        <section aria-labelledby="bill-requested-title" className="w-full max-w-lg rounded-3xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-6 text-center shadow-sm sm:p-8">
          <div aria-hidden="true" className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-orange-200 border-t-orange-600 dark:border-orange-950 dark:border-t-orange-500" />
          <h1 id="bill-requested-title" className="mt-5 text-3xl font-black">{t.requestedTitle}</h1>
          <p className="mt-3 text-base text-[var(--omlu-text-secondary)]">{t.requestedDesc}</p>
          <dl className="mt-6 grid gap-3 rounded-2xl bg-[var(--omlu-muted-surface)] p-4 text-left sm:grid-cols-3">
            <div><dt className="text-xs font-bold text-[var(--omlu-text-secondary)]">{t.table}</dt><dd className="mt-1 font-black">{waitingTable}</dd></div>
            {waitingTotal && <div><dt className="text-xs font-bold text-[var(--omlu-text-secondary)]">{t.currentOrderTotal}</dt><dd className="mt-1 font-black">₹{Number(waitingTotal).toFixed(2)}</dd></div>}
            {waitingRequestedAt && <div><dt className="text-xs font-bold text-[var(--omlu-text-secondary)]">{t.requestedAt}</dt><dd className="mt-1 text-sm font-bold">{new Date(waitingRequestedAt).toLocaleString()}</dd></div>}
          </dl>
          <p className="mt-6 font-bold text-orange-700 dark:text-orange-400">{t.stayHere}</p>
          <p className="mt-1 text-sm text-[var(--omlu-text-secondary)]">{t.autoUpdate}</p>
          <div className="mt-5 flex justify-center"><PublicThemeControl /></div>
        </section>
      </div>
    );
  }

  if (error && !bill) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--omlu-muted-surface)] p-6 text-center dark:bg-[var(--omlu-page-background)]">
        <div className="w-full max-w-md rounded-3xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-8 shadow-sm dark:border-[var(--omlu-border)] dark:bg-[var(--omlu-primary-surface)]">
          <h1 className="text-xl font-black text-[var(--omlu-text-primary)] dark:text-[var(--omlu-text-primary)]">
            {error}
          </h1>
          <p className="mt-2 text-sm text-[var(--omlu-text-secondary)] dark:text-[var(--omlu-text-secondary)]">
            {t.unavailableDesc}
          </p>
        </div>
      </div>
    );
  }

  if (!bill) return null;

  const isDetached = bill.session_status === "detached_awaiting_payment";
  const copyPaymentCode = async () => {
    if (!bill.payment_code) return;
    await navigator.clipboard.writeText(bill.payment_code);
    setCodeCopied(true);
    window.setTimeout(() => setCodeCopied(false), 3000);
  };

  const shareUrl = buildWhatsAppBillShareUrl(bill, billUrl);
  const paidMethodLabel = bill.payment_method
    ? t.paymentLabels[bill.payment_method] || bill.payment_method
    : t.statusLabels.paid;
  const billWorkflowMessage =
    bill.status === "paid"
      ? t.paymentComplete
      : bill.status === "payment_pending"
        ? bill.sent_to_counter_by_role === "staff" && !bill.payment_method
          ? t.billSentToCounter
          : t.paymentAwaitingConfirmation
        : bill.status === "issued" &&
            (bill.generated_by_role === "owner" || bill.generated_by_role === "admin")
          ? t.billReady
          : bill.status === "draft" || bill.status === "issued"
            ? t.billBeingPrepared
            : null;

  const isPaid = bill.status === "paid";

  return (
    <div className="min-h-screen bg-[var(--omlu-page-background)] px-4 py-4 text-[var(--omlu-text-primary)] sm:px-6 sm:py-6 print:bg-white print:px-0 print:py-0 print:text-black">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 print:max-w-none print:gap-0">
        <div className="print-hidden flex flex-wrap items-center justify-end gap-3">
          <PublicThemeControl />
          {!isPaid && !isDetached && (
            <button
              onClick={() => router.push(`/session/${bill.session_token}`)}
              className="min-h-11 rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-4 py-2 text-sm font-bold text-[var(--omlu-text-primary)] shadow-2xs dark:border-[var(--omlu-border)] dark:bg-[var(--omlu-primary-surface)] dark:text-[var(--omlu-text-secondary)]"
            >
              {t.back}
            </button>
          )}
          <button
            onClick={() => setLanguage(language === "en" ? "ml" : "en")}
            className="min-h-11 rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-4 py-2 text-sm font-bold text-orange-700 shadow-2xs dark:border-[var(--omlu-border)] dark:bg-[var(--omlu-primary-surface)] dark:text-orange-500"
          >
            {language === "en" ? "മലയാളം" : "English"}
          </button>
        </div>

        {/* Payment success — rendered FIRST and DOMINANT when bill is paid, above the full bill article */}
        {isPaid && (
          <section
            id="payment-success-banner"
            className={`print-hidden rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-50 sm:p-8 ${showPaymentSuccess ? "ring-2 ring-emerald-300 dark:ring-emerald-700" : ""}`}
            aria-live="polite"
            aria-labelledby="payment-success-heading"
          >
            <div className="flex flex-col items-center gap-5 text-center">
              {/* Success icon */}
              <div
                className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-emerald-600 text-white shadow-lg"
                aria-hidden="true"
              >
                <svg viewBox="0 0 32 32" className="h-10 w-10" fill="none">
                  <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2.5" opacity="0.3" />
                  <path
                    d="M9 16.5 13.5 21 23 11"
                    stroke="currentColor"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              {/* Heading — deliberately h1 so it is the dominant landmark on the page */}
              <div className="space-y-1">
                <h1 id="payment-success-heading" className="text-3xl font-black tracking-tight sm:text-4xl">
                  {t.paymentReceived}
                </h1>
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                  {t.sessionComplete}
                </p>
              </div>
              {/* Key payment facts */}
              <dl className="grid w-full max-w-xs grid-cols-2 gap-3 rounded-2xl bg-emerald-100/60 p-4 text-left text-sm dark:bg-emerald-900/30">
                <div>
                  <dt className="font-bold text-emerald-700 dark:text-emerald-300">{t.paidAmount}</dt>
                  <dd className="mt-0.5 text-base font-black">{formatBillTotal(bill)}</dd>
                </div>
                <div>
                  <dt className="font-bold text-emerald-700 dark:text-emerald-300">{t.paymentMethod}</dt>
                  <dd className="mt-0.5 font-black">{paidMethodLabel}</dd>
                </div>
              </dl>
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{t.tableReady}</p>
              {/* Actions */}
              <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
                <button
                  onClick={() => document.querySelector("article")?.scrollIntoView({ behavior: "smooth" })}
                  className="min-h-12 rounded-2xl bg-emerald-700 px-6 py-3 text-sm font-black text-white shadow-md transition hover:bg-emerald-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                >
                  {t.viewFullReceipt}
                </button>
                <button
                  onClick={() => window.close()}
                  className="min-h-12 rounded-2xl border border-emerald-300 bg-transparent px-6 py-3 text-sm font-black text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
                >
                  {t.doneLabel}
                </button>
              </div>
            </div>
          </section>
        )}

        {isDetached && bill.payment_code && (
          <section className="print-hidden rounded-3xl border border-orange-200 bg-orange-50 p-5 text-center shadow-sm dark:border-orange-900/60 dark:bg-orange-950/25 sm:p-7" aria-labelledby="bill-ready-title">
            <p className="text-sm font-black uppercase tracking-wide text-orange-700 dark:text-orange-400">{t.awaitingPayment}</p>
            <h1 id="bill-ready-title" className="mt-2 text-3xl font-black text-[var(--omlu-text-primary)]">{t.billReadyTitle}</h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[var(--omlu-text-secondary)]">{t.billReadyMessage}</p>
            <p className="mx-auto mt-2 max-w-lg text-sm font-black leading-6 text-[var(--omlu-text-primary)]">{t.showCodeAtCounter}</p>
            <div className="mx-auto mt-6 max-w-sm rounded-2xl border-2 border-dashed border-orange-300 bg-[var(--omlu-primary-surface)] p-5 dark:border-orange-800">
              <p className="text-xs font-black uppercase tracking-wide text-[var(--omlu-text-secondary)]">{t.paymentCode}</p>
              <p className="mt-2 break-all font-mono text-4xl font-black tracking-[0.18em] text-orange-700 dark:text-orange-400 sm:text-5xl">{bill.payment_code}</p>
              <button type="button" onClick={() => void copyPaymentCode()} className="mt-4 min-h-11 rounded-xl border border-[var(--omlu-border)] px-4 text-sm font-black" aria-live="polite">
                {codeCopied ? t.copied : t.copyCode}
              </button>
            </div>
            <dl className="mx-auto mt-6 grid max-w-xl grid-cols-2 gap-3 text-left text-sm sm:grid-cols-5">
              <div><dt className="text-[var(--omlu-text-secondary)]">{t.amountDue}</dt><dd className="font-black">{formatBillTotal(bill)}</dd></div>
              <div><dt className="text-[var(--omlu-text-secondary)]">{t.billNumber}</dt><dd className="break-all font-black">{bill.bill_number}</dd></div>
              <div><dt className="text-[var(--omlu-text-secondary)]">{t.table}</dt><dd className="font-black">{bill.table_number}</dd></div>
              <div><dt className="text-[var(--omlu-text-secondary)]">{t.generated}</dt><dd className="font-black">{new Date(bill.issued_at || bill.generated_at).toLocaleString()}</dd></div>
              <div><dt className="text-[var(--omlu-text-secondary)]">{t.paymentStatus}</dt><dd className="font-black">{t.statusLabels[bill.status] || bill.status}</dd></div>
            </dl>
            <button type="button" onClick={() => document.querySelector("article")?.scrollIntoView({ behavior: "smooth" })} className="mt-6 min-h-11 rounded-xl bg-orange-600 px-5 text-sm font-black text-white">{t.receiptAction}</button>
          </section>
        )}

        <article className="print-bill-sheet rounded-3xl bg-[var(--omlu-primary-surface)] p-5 shadow-sm sm:p-7 print:rounded-none print:border-0 print:bg-white print:p-8 print:text-black print:shadow-none">
          <header className="border-b border-[var(--omlu-border-strong)] pb-5 dark:border-[var(--omlu-border)] print:border-black">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-black text-[var(--omlu-text-primary)] print:text-black">
                  {bill.restaurant_name}
                </p>
                <h1 className="mt-1 text-2xl font-black">{t.title}</h1>
                <p className="mt-1 text-sm font-bold text-[var(--omlu-text-secondary)] dark:text-[var(--omlu-text-secondary)] print:text-black">
                  {t.table} {bill.table_number}
                </p>
                {bill.gst_enabled && (
                  <div className="mt-3 text-xs text-[var(--omlu-text-secondary)] dark:text-[var(--omlu-text-secondary)] print:text-black">
                    <p className="font-black">{bill.legal_business_name}</p>
                    <p>{bill.registered_billing_address}</p>
                    <p>GSTIN: {bill.gstin}</p>
                  </div>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs font-bold uppercase text-[var(--omlu-text-secondary)] print:text-black">
                  {t.status}
                </p>
                <p className="mt-1 rounded-xl bg-orange-50 px-3 py-1 text-sm font-black text-orange-700 dark:bg-orange-950/20 dark:text-orange-500 print:bg-white print:px-0 print:text-black">
                  {t.statusLabels[bill.status] || bill.status}
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <p>
                <span className="font-bold">{bill.gst_enabled ? "Invoice number" : t.billNumber}:</span>{" "}
                {bill.invoice_number || bill.bill_number}
              </p>
              <p className="sm:text-right">
                <span className="font-bold">{bill.gst_enabled ? "Invoice date" : t.generated}:</span>{" "}
                {new Date(bill.invoice_date || bill.generated_at).toLocaleString()}
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
            <h2 className="mb-4 text-sm font-black uppercase tracking-wide text-[var(--omlu-text-secondary)] dark:text-[var(--omlu-text-secondary)] print:text-black">
              {t.orders}
            </h2>
            <div className="flex flex-col gap-5">
              {bill.orders.map((order, orderIndex) => (
                <section
                  key={order.order_number}
                  className="border-b border-[var(--omlu-border)] py-4 last:border-b-0 print:border-black"
                >
                  <div className="mb-3 flex items-center justify-between gap-3 border-b border-[var(--omlu-border-strong)] pb-2 dark:border-[var(--omlu-border)] print:border-black">
                    <h3 className="font-black">
                      Order {orderIndex + 1}: {order.order_number}
                    </h3>
                    {/* On paid receipts, the kitchen status (e.g. "pending") is a stale operational
                        snapshot that is confusing to customers. Replace with a friendly receipt label.
                        The raw status is unchanged in the backend payload. */}
                    <p className="text-xs font-bold uppercase text-[var(--omlu-text-secondary)]">
                      {isPaid ? t.receiptOrderStatus : order.status}
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
                          <p className="text-xs text-[var(--omlu-text-secondary)] print:text-black">
                            {item.quantity} × {bill.currency}{" "}
                            {Number(item.unit_price).toFixed(2)}
                          </p>
                          {item.selected_options?.map((option, optionIndex) => (
                            <p key={`${option.option_name}-${optionIndex}`} className="text-xs leading-relaxed text-[var(--omlu-text-secondary)] print:text-black">
                              {option.group_name}: {option.option_name}{option.quantity > 1 ? ` × ${option.quantity}` : ""}
                            </p>
                          ))}
                        </div>
                        <p className="font-black">
                          {bill.currency} {Number(item.line_total).toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-between border-t border-[var(--omlu-border-strong)] pt-2 text-sm dark:border-[var(--omlu-border)] print:border-black">
                    <span className="font-bold">{t.subtotal}</span>
                    <span className="font-black">
                      {bill.currency} {Number(order.subtotal).toFixed(2)}
                    </span>
                  </div>
                </section>
              ))}
            </div>
          </main>

          <footer className="border-t border-[var(--omlu-border-strong)] pt-5 dark:border-[var(--omlu-border)] print:border-black">
            <div className="ml-auto flex max-w-sm flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span>{bill.gst_enabled ? "Menu subtotal" : t.subtotal}</span>
                <span className="font-bold">
                  {bill.currency} {Number(bill.subtotal).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{t.discount}</span>
                <span className="font-bold">
                  {bill.currency} {Number(bill.discount_amount).toFixed(2)}
                </span>
              </div>
              {bill.gst_enabled ? (
                <>
                  <div className="flex justify-between"><span>Taxable subtotal</span><span className="font-bold">{bill.currency} {Number(bill.taxable_amount).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>CGST ({Number(bill.gst_rate) / 2}%)</span><span className="font-bold">{bill.currency} {Number(bill.cgst_amount).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>SGST ({Number(bill.gst_rate) / 2}%)</span><span className="font-bold">{bill.currency} {Number(bill.sgst_amount).toFixed(2)}</span></div>
                  {Number(bill.igst_amount) > 0 && <div className="flex justify-between"><span>IGST ({bill.gst_rate}%)</span><span className="font-bold">{bill.currency} {Number(bill.igst_amount).toFixed(2)}</span></div>}
                </>
              ) : (
                <div className="flex justify-between">
                  <span>{t.tax}</span>
                  <span className="font-bold">{bill.currency} {Number(bill.tax_amount).toFixed(2)}</span>
                </div>
              )}
              <div className="mt-2 flex justify-between border-t border-[var(--omlu-border-strong)] pt-3 text-xl font-black dark:border-[var(--omlu-border)] print:border-black">
                <span>{t.total}</span>
                <span>
                  {bill.currency} {Number(bill.total_amount).toFixed(2)}
                </span>
              </div>
            </div>
          </footer>
        </article>

        {/* Secondary compact confirmation below the receipt for print/accessibility context */}
        {isPaid && (
          <p className="print-hidden text-center text-sm font-bold text-emerald-700 dark:text-emerald-400">
            {t.paymentComplete}
          </p>
        )}

        <div className="print-hidden px-1 py-2">
          {/* Workflow guidance only shown while payment is still pending */}
          {billWorkflowMessage && !isPaid && (
            <p className="rounded-2xl bg-orange-50 px-4 py-3 text-sm font-black text-orange-800 dark:bg-orange-950/30 dark:text-orange-400">
              {billWorkflowMessage}
            </p>
          )}
        </div>

        <div className="print-hidden grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            onClick={() => window.print()}
            className="min-h-12 rounded-xl bg-orange-600 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-orange-700"
          >
            {t.print}
          </button>
          <button
            onClick={() => window.open(shareUrl, "_blank", "noopener,noreferrer")}
            className="min-h-12 rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] px-5 py-3 text-sm font-black text-[var(--omlu-text-primary)]"
          >
            {t.whatsapp}
          </button>
        </div>
      </div>
    </div>
  );
}
