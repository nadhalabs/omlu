"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  createOrRefreshPublicBill,
  createPublicServiceRequest,
  getPublicDiningSession,
} from "@/lib/api";
import { PublicDiningSessionResponse } from "@/lib/types";
import {
  clearLegacyPublicReceiptToken,
  clearPublicSessionToken,
  savePublicSessionToken,
} from "@/lib/publicSessionStorage";
import { useRealtime } from "@/lib/realtime";
import { customerPushSupported, enableCustomerPush } from "@/lib/customerPush";

interface SessionClientProps {
  sessionToken: string;
}

type ServiceStatus = "idle" | "loading" | "success" | "error";

export default function SessionClient({ sessionToken }: SessionClientProps) {
  const router = useRouter();
  const [session, setSession] = useState<PublicDiningSessionResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [language, setLanguage] = useState<"en" | "ml">("en");
  const [serviceStatus, setServiceStatus] = useState<Record<string, ServiceStatus>>({});
  const [serviceMessage, setServiceMessage] = useState<Record<string, string>>({});
  const [billActionLoading, setBillActionLoading] = useState<"view" | "request" | null>(null);
  const [billActionError, setBillActionError] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<"idle" | "loading" | "enabled" | "unsupported" | "error">("idle");
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const fetchInFlightRef = useRef(false);
  const pendingFetchRef = useRef(false);

  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [animatedStages, setAnimatedStages] = useState<Record<string, string>>({});
  const prevStatusesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!session || !session.orders) return;
    const newAnimatedStages: Record<string, string> = {};
    session.orders.forEach((order) => {
      const prevStatus = prevStatusesRef.current[order.public_token];
      if (prevStatus && prevStatus !== order.status) {
        newAnimatedStages[order.public_token] = order.status;
      }
      prevStatusesRef.current[order.public_token] = order.status;
    });
    if (Object.keys(newAnimatedStages).length > 0) {
      setAnimatedStages((prev) => ({ ...prev, ...newAnimatedStages }));
    }
  }, [session]);

  const translations = {
    en: {
      table: "Table",
      sessionStatus: "Session status",
      opened: "Opened",
      currentBill: "Current bill",
      combinedSubtotal: "Combined subtotal",
      orders: "orders",
      noOrders: "No orders yet",
      noOrdersDesc: "Items you order from this table will appear here.",
      loading: "Loading table bill...",
      retry: "Retry",
      connectionError: "Connection issue. Showing the last loaded table bill.",
      notFound: "Table session not found",
      addMore: "Add More Items",
      addMoreMl: "കൂടുതൽ വിഭവങ്ങൾ ചേർക്കുക",
      viewBill: "View Bill",
      requestBillAction: "Request Bill",
      preparingBill: "Preparing bill...",
      requestingBill: "Requesting bill...",
      billRequestSent: "Bill request sent to staff.",
      orderingLocked: "Ordering is locked for this table session.",
      items: "Items",
      note: "Note",
      subtotal: "Subtotal",
      needSomething: "Need Something?",
      needSomethingDesc: "Ask the staff from this table.",
      callWaiter: "Call Waiter",
      water: "Water",
      requestBill: "Ask for Bill",
      requestSent: "Request sent!",
      failedSend: "Failed to send request.",
      tooManyRequests: "Too many requests. Please wait.",
      lastUpdated: "Last updated",
      realtimeOffline: "Live updates reconnecting. Checking periodically.",
      enablePush: "Notify me",
      pushEnabled: "Notifications enabled",
      pushUnsupported: "Notifications are not supported on this browser.",
      pushError: "Could not enable notifications.",
      billState: "Bill status",
      billNotRequested: "Bill not requested",
      billRequested: "Bill requested",
      billIssued: "Bill issued",
      paymentPending: "Payment pending",
      paidConfirmation: "Payment received",
      paidAt: "Paid at",
      sessionClosed: "Session closed",
      serviceHistory: "Request history",
      noServiceHistory: "No requests yet",
      requestedAt: "Requested",
      completedAt: "Completed",
      statusLabels: {
        open: "Open",
        payment_requested: "Bill requested",
        payment_pending: "Payment pending",
        paid: "Paid",
        closed: "Closed",
        cancelled: "Cancelled",
        pending: "Order received",
        accepted: "Accepted",
        preparing: "Preparing",
        ready: "Ready",
        served: "Served",
        rejected: "Rejected",
      } as Record<string, string>,
      timeline: {
        orderPlaced: "Order placed",
        orderPlacedDesc: "Your order was sent to the restaurant.",
        accepted: "Accepted",
        acceptedDesc: "The restaurant accepted your order.",
        preparing: "Preparing",
        preparingDesc: "Your food is being prepared.",
        ready: "Ready",
        readyDesc: "Your order is ready.",
        served: "Served",
        servedDesc: "Your order has been served.",
        cancelled: "Cancelled",
        cancelledDesc: "Your order was cancelled.",
      },
    },
    ml: {
      table: "മേശ",
      sessionStatus: "സെഷൻ നില",
      opened: "തുടങ്ങി",
      currentBill: "നിലവിലെ ബിൽ",
      combinedSubtotal: "ആകെ തുക",
      orders: "ഓർഡറുകൾ",
      noOrders: "ഇനിയും ഓർഡറുകളില്ല",
      noOrdersDesc: "ഈ മേശയിൽ നിന്നുള്ള ഓർഡറുകൾ ഇവിടെ കാണിക്കും.",
      loading: "ടേബിൾ ബിൽ ലോഡ് ചെയ്യുന്നു...",
      retry: "വീണ്ടും ശ്രമിക്കുക",
      connectionError: "കണക്ഷൻ പ്രശ്നം. അവസാനമായി ലഭിച്ച ബിൽ കാണിക്കുന്നു.",
      notFound: "ടേബിൾ സെഷൻ കണ്ടെത്തിയില്ല",
      addMore: "കൂടുതൽ വിഭവങ്ങൾ ചേർക്കുക",
      addMoreMl: "Add More Items",
      viewBill: "ബിൽ കാണുക",
      requestBillAction: "ബിൽ അഭ്യർത്ഥിക്കുക",
      preparingBill: "ബിൽ തയ്യാറാക്കുന്നു...",
      requestingBill: "ബിൽ അഭ്യർത്ഥിക്കുന്നു...",
      billRequestSent: "ബിൽ അഭ്യർത്ഥന സ്റ്റാഫിന് അയച്ചു.",
      orderingLocked: "ഈ ടേബിൾ സെഷനിൽ പുതിയ ഓർഡർ ലോക്ക് ചെയ്തിരിക്കുന്നു.",
      items: "വിഭവങ്ങൾ",
      note: "കുറിപ്പ്",
      subtotal: "ആകെ",
      needSomething: "എന്തെങ്കിലും ആവശ്യമുണ്ടോ?",
      needSomethingDesc: "ഈ മേശയിൽ നിന്ന് സ്റ്റാഫിനെ അറിയിക്കുക.",
      callWaiter: "വെയ്റ്ററെ വിളിക്കുക",
      water: "വെള്ളം",
      requestBill: "ബിൽ ചോദിക്കുക",
      requestSent: "അഭ്യർത്ഥന അയച്ചു!",
      failedSend: "അഭ്യർത്ഥന അയക്കാൻ സാധിച്ചില്ല.",
      tooManyRequests: "വളരെ കൂടുതൽ അഭ്യർത്ഥനകൾ. ദയവായി കാത്തിരിക്കുക.",
      lastUpdated: "അവസാനം പുതുക്കിയത്",
      realtimeOffline: "ലൈവ് അപ്ഡേറ്റുകൾ വീണ്ടും കണക്റ്റ് ചെയ്യുന്നു. ഇടയ്ക്കിടെ പരിശോധിക്കുന്നു.",
      enablePush: "അറിയിപ്പുകൾ വേണം",
      pushEnabled: "അറിയിപ്പുകൾ ഓണാക്കി",
      pushUnsupported: "ഈ ബ്രൗസറിൽ അറിയിപ്പുകൾ പിന്തുണയ്‌ക്കുന്നില്ല.",
      pushError: "അറിയിപ്പുകൾ ഓണാക്കാൻ സാധിച്ചില്ല.",
      billState: "ബിൽ നില",
      billNotRequested: "ബിൽ ചോദിച്ചിട്ടില്ല",
      billRequested: "ബിൽ ചോദിച്ചു",
      billIssued: "ബിൽ നൽകി",
      paymentPending: "ബിൽ കുടിശ്ശിക",
      paidConfirmation: "പണം ലഭിച്ചു",
      paidAt: "പണം നൽകിയ സമയം",
      sessionClosed: "സെഷൻ അടച്ചു",
      serviceHistory: "അഭ്യർത്ഥന ചരിത്രം",
      noServiceHistory: "ഇനിയും അഭ്യർത്ഥനകളില്ല",
      requestedAt: "അഭ്യർത്ഥിച്ചത്",
      completedAt: "പൂർത്തിയായത്",
      statusLabels: {
        open: "തുറന്നിരിക്കുന്നു",
        payment_requested: "ബിൽ ചോദിച്ചു",
        payment_pending: "പേയ്മെന്റ് കാത്തിരിക്കുന്നു",
        paid: "പണം നൽകി",
        closed: "അടച്ചു",
        cancelled: "റദ്ദാക്കി",
        pending: "ഓർഡർ ലഭിച്ചു",
        accepted: "സ്വീകരിച്ചു",
        preparing: "തയ്യാറാക്കുന്നു",
        ready: "തയ്യാറായി",
        served: "നൽകി",
        rejected: "നിരസിച്ചു",
      } as Record<string, string>,
      timeline: {
        orderPlaced: "ഓർഡർ സമർപ്പിച്ചു",
        orderPlacedDesc: "നിങ്ങളുടെ ഓർഡർ റെസ്റ്റോറന്റിലേക്ക് അയച്ചു.",
        accepted: "സ്വീകരിച്ചു",
        acceptedDesc: "റെസ്റ്റോറന്റ് നിങ്ങളുടെ ഓർഡർ സ്വീകരിച്ചു.",
        preparing: "തയ്യാറാക്കുന്നു",
        preparingDesc: "നിങ്ങളുടെ ഭക്ഷണം തയ്യാറാക്കുകയാണ്.",
        ready: "തയ്യാറായി",
        readyDesc: "നിങ്ങളുടെ ഓർഡർ തയ്യാറായിക്കഴിഞ്ഞു.",
        served: "നൽകി",
        servedDesc: "നിങ്ങളുടെ ഓർഡർ വിതരണം ചെയ്തു.",
        cancelled: "റദ്ദാക്കി",
        cancelledDesc: "നിങ്ങളുടെ ഓർഡർ റദ്ദാക്കിയിരിക്കുന്നു.",
      },
    },
  };

  const t = translations[language];

  const fetchSession = useCallback(
    async (showLoading = true) => {
      if (fetchInFlightRef.current) {
        pendingFetchRef.current = true;
        return;
      }
      fetchInFlightRef.current = true;
      let shouldShowLoading = showLoading;
      try {
        do {
          pendingFetchRef.current = false;
          if (shouldShowLoading) setLoading(true);
          try {
            const data = await getPublicDiningSession(sessionToken);
            setSession(data);
            setError(null);
            setLastUpdated(new Date());

            if (["closed", "cancelled"].includes(data.status)) {
              clearPublicSessionToken(data.restaurant_slug, data.table_code);
              clearLegacyPublicReceiptToken(data.restaurant_slug, data.table_code);
            } else {
              savePublicSessionToken(data.restaurant_slug, data.table_code, data.public_token);
              clearLegacyPublicReceiptToken(data.restaurant_slug, data.table_code);
            }
          } catch (err) {
            if (err instanceof ApiError) {
              setError(err.status === 404 ? t.notFound : err.message);
            } else {
              setError(t.connectionError);
            }
          } finally {
            if (shouldShowLoading) setLoading(false);
            shouldShowLoading = false;
          }
        } while (pendingFetchRef.current);
      } finally {
        fetchInFlightRef.current = false;
      }
    },
    [sessionToken, t.connectionError, t.notFound]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => fetchSession(true), 0);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchSession(false);
      }
    };
    const handleOnline = () => fetchSession(false);

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
    };
  }, [fetchSession]);

  const realtimeStatus = useRealtime({
    target: { kind: "session", token: sessionToken },
    onEvent: () => void fetchSession(false),
    onReconnect: () => void fetchSession(false),
  });

  useEffect(() => {
    const interval = window.setInterval(() => fetchSession(false), 6_000);
    return () => window.clearInterval(interval);
  }, [fetchSession]);

  const serviceTypes = [
    { type: "waiter", label: t.callWaiter },
    { type: "water", label: t.water },
    { type: "bill", label: t.requestBill },
  ] as const;

  const handleAddMore = () => {
    if (!session) return;
    savePublicSessionToken(
      session.restaurant_slug,
      session.table_code,
      session.public_token
    );
    router.push(
      `/menu/${encodeURIComponent(session.restaurant_slug)}/${encodeURIComponent(
        session.table_code
      )}?session=${encodeURIComponent(session.public_token)}`
    );
  };

  const handleViewBill = async () => {
    if (!session || billActionLoading) return;
    setBillActionLoading("view");
    setBillActionError(null);
    try {
      await createOrRefreshPublicBill(session.public_token);
      router.push(`/bill/${session.public_token}`);
    } catch (err) {
      setBillActionError(err instanceof Error ? err.message : "Failed to prepare bill.");
    } finally {
      setBillActionLoading(null);
    }
  };

  const handleRequestBill = async () => {
    if (!session || billActionLoading) return;
    setBillActionLoading("request");
    setBillActionError(null);
    try {
      await createOrRefreshPublicBill(session.public_token);
      await createPublicServiceRequest(session.restaurant_slug, session.table_code, {
        request_type: "bill",
      });
      setBillActionError(null);
      setServiceMessage((prev) => ({ ...prev, bill: t.billRequestSent }));
      router.push(`/bill/${session.public_token}`);
    } catch (err) {
      setBillActionError(err instanceof Error ? err.message : "Failed to request bill.");
    } finally {
      setBillActionLoading(null);
    }
  };

  const handleServiceRequest = async (type: "waiter" | "water" | "bill") => {
    if (!session) return;
    setServiceStatus((prev) => ({ ...prev, [type]: "loading" }));
    setServiceMessage((prev) => ({ ...prev, [type]: "" }));
    try {
      await createPublicServiceRequest(session.restaurant_slug, session.table_code, {
        request_type: type,
      });
      setServiceStatus((prev) => ({ ...prev, [type]: "success" }));
      setServiceMessage((prev) => ({ ...prev, [type]: t.requestSent }));
      setTimeout(() => {
        setServiceStatus((prev) => ({ ...prev, [type]: "idle" }));
        setServiceMessage((prev) => ({ ...prev, [type]: "" }));
      }, 12_000);
    } catch (err) {
      let message = t.failedSend;
      if (err instanceof ApiError && err.status === 429) {
        message = t.tooManyRequests;
      } else if (err instanceof Error) {
        message = err.message;
      }
      setServiceStatus((prev) => ({ ...prev, [type]: "error" }));
      setServiceMessage((prev) => ({ ...prev, [type]: message }));
      setTimeout(() => {
        setServiceStatus((prev) => ({ ...prev, [type]: "idle" }));
        setServiceMessage((prev) => ({ ...prev, [type]: "" }));
      }, 8_000);
    }
  };

  const handleEnablePush = async () => {
    if (!session || pushStatus === "loading") return;
    if (!customerPushSupported()) {
      setPushStatus("unsupported");
      setPushMessage(t.pushUnsupported);
      return;
    }
    setPushStatus("loading");
    setPushMessage(null);
    try {
      await enableCustomerPush(session.public_token);
      setPushStatus("enabled");
      setPushMessage(t.pushEnabled);
    } catch (err) {
      setPushStatus("error");
      setPushMessage(err instanceof Error ? err.message : t.pushError);
    }
  };

  if (loading && !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 py-8 dark:bg-zinc-950">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-amber-600" />
        <p className="mt-4 font-medium text-zinc-600 dark:text-zinc-400">
          {t.loading}
        </p>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-6 text-center dark:bg-zinc-950">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-4 text-5xl">!</div>
          <h1 className="mb-2 text-xl font-bold text-zinc-950 dark:text-zinc-50">
            {error}
          </h1>
          <button
            onClick={() => fetchSession(true)}
            className="mt-6 min-h-12 rounded-2xl bg-amber-600 px-6 py-3 font-bold text-white transition hover:bg-amber-700"
          >
            {t.retry}
          </button>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const latestActiveOrderToken = (() => {
    if (!session.orders || session.orders.length === 0) return null;
    const activeStatuses = ["pending", "accepted", "preparing", "ready"];
    for (let i = session.orders.length - 1; i >= 0; i--) {
      if (activeStatuses.includes(session.orders[i].status)) {
        return session.orders[i].public_token;
      }
    }
    return session.orders[session.orders.length - 1].public_token;
  })();

  const canOrderMore = session.can_order_more && session.status === "open";
  const billStatus = session.bill?.status;
  const billStatusLabel =
    session.status === "closed"
      ? t.sessionClosed
      : billStatus === "paid"
      ? t.paidConfirmation
      : billStatus === "payment_pending"
      ? t.paymentPending
      : billStatus === "issued"
      ? t.billIssued
      : billStatus === "draft" || session.status === "payment_requested"
      ? t.billRequested
      : t.billNotRequested;
  const billTotal = session.bill
    ? new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: session.bill.currency || "INR",
      }).format(Number(session.bill.total_amount))
    : null;
  const requestStatusLabel = (status: string) =>
    status === "resolved" ? "completed" : status;

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={handleEnablePush}
            disabled={pushStatus === "loading" || pushStatus === "enabled"}
            className="min-h-10 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 shadow-2xs disabled:opacity-60 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
          >
            {pushStatus === "enabled" ? t.pushEnabled : pushStatus === "loading" ? "..." : t.enablePush}
          </button>
          <button
            onClick={() => setLanguage(language === "en" ? "ml" : "en")}
            className="min-h-10 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-amber-700 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-amber-500"
          >
            {language === "en" ? "മലയാളം" : "English"}
          </button>
        </div>

        {pushMessage && (
          <p className={`rounded-2xl px-4 py-3 text-sm font-bold ${
            pushStatus === "enabled"
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          }`}>
            {pushMessage}
          </p>
        )}

        <header className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-amber-700 dark:text-amber-500">
                {session.restaurant_name}
              </p>
              <h1 className="mt-1 text-2xl font-black text-zinc-950 dark:text-zinc-50">
                {t.currentBill}
              </h1>
              <p className="mt-1 text-sm font-bold text-zinc-500 dark:text-zinc-400">
                {t.table} {session.table_number}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-zinc-400">
                {t.sessionStatus}
              </p>
              <p className="mt-1 rounded-xl bg-amber-50 px-3 py-1 text-sm font-black text-amber-700 dark:bg-amber-950/20 dark:text-amber-500">
                {t.statusLabels[session.status] || session.status}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-800/50">
              <p className="text-xs font-bold uppercase text-zinc-400">
                {t.orders}
              </p>
              <p className="mt-1 text-2xl font-black">{session.order_count}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4 text-right dark:bg-emerald-950/20">
              <p className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-400">
                {t.combinedSubtotal}
              </p>
              <p className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-400">
                ₹{Number(session.combined_subtotal).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-amber-700 dark:text-amber-500">
                  {t.billState}
                </p>
                <p className="mt-1 text-lg font-black text-zinc-950 dark:text-zinc-50">
                  {billStatusLabel}
                </p>
                {session.bill?.paid_at && (
                  <p className="mt-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    {t.paidAt}: {new Date(session.bill.paid_at).toLocaleString()}
                  </p>
                )}
              </div>
              {billTotal && (
                <p className="text-right text-2xl font-black text-amber-700 dark:text-amber-500">
                  {billTotal}
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3">
            {canOrderMore && (
              <button
                onClick={handleAddMore}
                className="min-h-14 rounded-2xl bg-amber-600 px-5 py-4 text-center text-base font-black text-white shadow-md transition hover:bg-amber-700 active:bg-amber-800"
              >
                {t.addMore} · {t.addMoreMl}
              </button>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                onClick={handleViewBill}
                disabled={billActionLoading !== null}
                className="min-h-14 rounded-2xl bg-zinc-900 px-5 py-4 text-base font-black text-white shadow-md transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
              >
                {billActionLoading === "view" ? t.preparingBill : t.viewBill}
              </button>
              {session.status === "open" && (
                <button
                  onClick={handleRequestBill}
                  disabled={billActionLoading !== null}
                  className="min-h-14 rounded-2xl bg-emerald-600 px-5 py-4 text-base font-black text-white shadow-md transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {billActionLoading === "request" ? t.requestingBill : t.requestBillAction}
                </button>
              )}
            </div>
            {billActionError && (
              <p className="rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
                {billActionError}
              </p>
            )}
            {!canOrderMore && (
              <p className="rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
                {t.orderingLocked}
              </p>
            )}
          </div>

          {error && (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
              <span>{error}</span>
              <button onClick={() => fetchSession(false)} className="min-h-9 underline">
                {t.retry}
              </button>
            </div>
          )}

          {lastUpdated && (
            <p className="mt-3 text-right text-[10px] font-semibold text-zinc-400">
              {t.lastUpdated}: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
          {realtimeStatus !== "live" && (
            <p className="mt-2 rounded-xl bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              {t.realtimeOffline}
            </p>
          )}
        </header>

        <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-4 text-sm font-black uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {t.needSomething}
          </h2>
          <p className="mb-4 text-xs font-medium text-zinc-500 dark:text-zinc-500">
            {t.needSomethingDesc}
          </p>
          {session.service_requests_enabled ? (
            <div className="grid grid-cols-3 gap-3">
              {serviceTypes.map(({ type, label }) => {
                const status = serviceStatus[type] || "idle";
                const message = serviceMessage[type];
                return (
                  <div key={type} className="flex flex-col gap-1">
                    <button
                      onClick={() => handleServiceRequest(type)}
                      disabled={status === "loading" || status === "success"}
                      className={`min-h-16 rounded-2xl border p-3 text-xs font-black transition disabled:cursor-not-allowed ${
                        status === "success"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-950/20 dark:text-emerald-400"
                          : status === "error"
                          ? "border-red-200 bg-red-50 text-red-600 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-400"
                          : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-amber-300 hover:bg-amber-50 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-300"
                      }`}
                    >
                      {status === "loading" ? "..." : status === "success" ? "✓" : label}
                    </button>
                    {message && (
                      <p className="text-center text-[10px] font-semibold text-zinc-500">
                        {message}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-2xl bg-zinc-50 p-4 text-sm font-semibold text-zinc-500 dark:bg-zinc-800/50">
              Service requests are disabled.
            </p>
          )}

          <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <h3 className="text-xs font-black uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {t.serviceHistory}
            </h3>
            {session.service_requests.length === 0 ? (
              <p className="mt-3 rounded-2xl bg-zinc-50 p-4 text-sm font-semibold text-zinc-500 dark:bg-zinc-800/50">
                {t.noServiceHistory}
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {session.service_requests.map((request, index) => (
                  <div
                    key={`${request.request_type}-${request.created_at}-${index}`}
                    className="flex items-start justify-between gap-3 rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-800/50"
                  >
                    <div>
                      <p className="text-sm font-black capitalize text-zinc-900 dark:text-zinc-100">
                        {request.request_type}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-zinc-500">
                        {t.requestedAt}: {new Date(request.created_at).toLocaleTimeString()}
                      </p>
                      {request.resolved_at && (
                        <p className="text-[11px] font-semibold text-zinc-500">
                          {t.completedAt}: {new Date(request.resolved_at).toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                    <p className="rounded-xl bg-white px-3 py-1 text-xs font-black capitalize text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                      {requestStatusLabel(request.status)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <main className="flex flex-col gap-4">
          {session.orders.length === 0 ? (
            <section className="rounded-3xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
              <h2 className="text-lg font-black">{t.noOrders}</h2>
              <p className="mt-2 text-sm text-zinc-500">{t.noOrdersDesc}</p>
            </section>
          ) : (
            session.orders.map((order, index) => {
              const isExpanded = expandedOrders[order.public_token] !== undefined
                ? expandedOrders[order.public_token]
                : (order.public_token === latestActiveOrderToken);

              const handleToggle = () => {
                setExpandedOrders(prev => ({
                  ...prev,
                  [order.public_token]: !isExpanded
                }));
              };

              const stages = order.status === "rejected"
                ? [
                    { key: "pending" },
                    { key: "rejected" }
                  ]
                : [
                    { key: "pending" },
                    { key: "accepted" },
                    { key: "preparing" },
                    { key: "ready" },
                    { key: "served" }
                  ];

              const getStageConfig = (key: string) => {
                switch (key) {
                  case "pending":
                    return { title: t.timeline.orderPlaced, desc: t.timeline.orderPlacedDesc };
                  case "accepted":
                    return { title: t.timeline.accepted, desc: t.timeline.acceptedDesc };
                  case "preparing":
                    return { title: t.timeline.preparing, desc: t.timeline.preparingDesc };
                  case "ready":
                    return { title: t.timeline.ready, desc: t.timeline.readyDesc };
                  case "served":
                    return { title: t.timeline.served, desc: t.timeline.servedDesc };
                  case "rejected":
                    return { title: t.timeline.cancelled, desc: t.timeline.cancelledDesc };
                  default:
                    return { title: key, desc: "" };
                }
              };

              const normalStatuses = ["pending", "accepted", "preparing", "ready", "served"];
              const currentIdx = normalStatuses.indexOf(order.status);

              return (
                <section
                  key={order.public_token}
                  className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div
                    onClick={handleToggle}
                    className="flex cursor-pointer items-center justify-between gap-3 border-b border-zinc-100 pb-3 dark:border-zinc-800 select-none"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold uppercase text-zinc-400">
                          Order {index + 1} of {session.order_count}
                        </span>
                        <span className="text-[10px] font-semibold text-zinc-400">
                          • {new Date(order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <h2 className="text-lg font-black text-zinc-950 dark:text-zinc-50 flex items-center gap-2">
                        {order.order_number}
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="rounded-xl bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {t.statusLabels[order.status] || order.status}
                      </p>
                      <svg
                        className={`h-5 w-5 text-zinc-400 transition-transform duration-200 ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-6 border-b border-zinc-100 pb-5 dark:border-zinc-800">
                      <div className="flex flex-col">
                        {stages.map((stage, sIdx) => {
                          let state: "completed" | "current" | "future" = "future";
                          if (order.status === "rejected") {
                            if (stage.key === "pending") state = "completed";
                            else if (stage.key === "rejected") state = "current";
                          } else {
                            const stageIdx = normalStatuses.indexOf(stage.key);
                            if (stageIdx < currentIdx) state = "completed";
                            else if (stageIdx === currentIdx) state = "current";
                            else state = "future";
                          }

                          let timestamp: string | null = null;
                          if (order.status_history) {
                            const historyEntry = order.status_history.find(h => h.new_status === stage.key);
                            if (historyEntry) {
                              timestamp = new Date(historyEntry.changed_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              });
                            }
                          }
                          if (stage.key === "pending" && !timestamp) {
                            timestamp = new Date(order.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            });
                          }

                          const { title, desc } = getStageConfig(stage.key);
                          const isLast = sIdx === stages.length - 1;
                          const isAnimated = animatedStages[order.public_token] === stage.key;

                          return (
                            <div key={stage.key} className="flex min-h-[64px] last:min-h-0">
                              {/* Left: Time */}
                              <div className="w-16 flex-none pr-3 pt-1 text-right text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                                {timestamp || ""}
                              </div>

                              {/* Middle: Circle and connector */}
                              <div className="relative flex w-8 flex-none flex-col items-center">
                                <div
                                  className={`z-10 flex h-6 w-6 items-center justify-center rounded-full text-white transition-all duration-300 ${
                                    state === "completed"
                                      ? "bg-emerald-600 text-xs font-bold"
                                      : state === "current"
                                      ? "bg-amber-600 ring-4 ring-amber-100 dark:ring-amber-950/40"
                                      : "bg-zinc-200 dark:bg-zinc-800"
                                  } ${isAnimated ? "motion-safe:animate-[bounce_0.6s_ease-in-out_2]" : ""}`}
                                >
                                  {state === "completed" ? (
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  ) : state === "current" ? (
                                    <div className="h-2 w-2 rounded-full bg-white" />
                                  ) : null}
                                </div>

                                {!isLast && (
                                  <div
                                    className={`absolute top-6 bottom-0 w-[2px] ${
                                      state === "completed" ? "bg-emerald-600" : "bg-zinc-200 dark:bg-zinc-800"
                                    }`}
                                  />
                                )}
                              </div>

                              {/* Right: Content */}
                              <div className="flex-1 pb-6 pl-2">
                                <h3
                                  className={`text-sm font-black transition-colors duration-300 ${
                                    state === "current"
                                      ? "text-zinc-950 dark:text-zinc-50"
                                      : state === "completed"
                                      ? "text-zinc-700 dark:text-zinc-300"
                                      : "text-zinc-400 dark:text-zinc-600"
                                  }`}
                                >
                                  {title}
                                </h3>
                                {state !== "future" && (
                                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                                    {desc}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex flex-col gap-3">
                    {order.items.map((item, itemIndex) => (
                      <div
                        key={`${order.public_token}-${itemIndex}`}
                        className="flex items-start justify-between gap-4"
                      >
                        <div>
                          <p className="text-sm font-bold">{item.item_name}</p>
                          <p className="text-xs font-semibold text-zinc-500">
                            ₹{Number(item.unit_price).toFixed(2)} × {item.quantity}
                          </p>
                          {item.item_note && (
                            <p className="mt-1 text-xs italic text-amber-700 dark:text-amber-500">
                              {t.note}: {item.item_note}
                            </p>
                          )}
                        </div>
                        <p className="text-sm font-black">
                          ₹{Number(item.total_price).toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>

                  {order.customer_note && (
                    <div className="mt-4 rounded-2xl bg-zinc-50 p-3 text-xs text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-300">
                      <span className="font-bold">{t.note}:</span> {order.customer_note}
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-800">
                    <p className="text-sm font-bold text-zinc-500">{t.subtotal}</p>
                    <p className="text-lg font-black text-amber-700 dark:text-amber-500">
                      ₹{Number(order.subtotal).toFixed(2)}
                    </p>
                  </div>
                </section>
              );
            })
          )}
        </main>
      </div>
    </div>
  );
}
