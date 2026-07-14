"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  createOrRefreshPublicBill,
  createPublicServiceRequest,
  getPublicDiningSession,
} from "@/lib/api";
import { PublicDiningSessionResponse } from "@/lib/types";
import {
  clearPublicSessionToken,
  savePublicSessionToken,
} from "@/lib/publicSessionStorage";
import { useRealtime } from "@/lib/realtime";

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
    },
  };

  const t = translations[language];

  const fetchSession = useCallback(
    async (showLoading = true) => {
      if (showLoading) setLoading(true);
      try {
        const data = await getPublicDiningSession(sessionToken);
        setSession(data);
        setError(null);
        setLastUpdated(new Date());

        if (["paid", "closed", "cancelled"].includes(data.status)) {
          clearPublicSessionToken(data.restaurant_slug, data.table_code);
        } else {
          savePublicSessionToken(data.restaurant_slug, data.table_code, data.public_token);
        }
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.status === 404 ? t.notFound : err.message);
        } else {
          setError(t.connectionError);
        }
      } finally {
        if (showLoading) setLoading(false);
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

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchSession]);

  useRealtime({
    target: { kind: "session", token: sessionToken },
    onEvent: () => void fetchSession(false),
    onReconnect: () => void fetchSession(false),
  });

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

  const canOrderMore = session.can_order_more && session.status === "open";

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <div className="flex justify-end">
          <button
            onClick={() => setLanguage(language === "en" ? "ml" : "en")}
            className="min-h-10 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-amber-700 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-amber-500"
          >
            {language === "en" ? "മലയാളം" : "English"}
          </button>
        </div>

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
        </section>

        <main className="flex flex-col gap-4">
          {session.orders.length === 0 ? (
            <section className="rounded-3xl border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
              <h2 className="text-lg font-black">{t.noOrders}</h2>
              <p className="mt-2 text-sm text-zinc-500">{t.noOrdersDesc}</p>
            </section>
          ) : (
            session.orders.map((order, index) => (
              <section
                key={order.public_token}
                className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-3 border-b border-zinc-100 pb-3 dark:border-zinc-800">
                  <div>
                    <p className="text-xs font-bold uppercase text-zinc-400">
                      Order {index + 1} of {session.order_count}
                    </p>
                    <h2 className="text-lg font-black text-zinc-950 dark:text-zinc-50">
                      {order.order_number}
                    </h2>
                  </div>
                  <p className="rounded-xl bg-zinc-100 px-3 py-1 text-xs font-black text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {t.statusLabels[order.status] || order.status}
                  </p>
                </div>

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
            ))
          )}
        </main>
      </div>
    </div>
  );
}
