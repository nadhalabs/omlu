"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getPublicOrder,
  createOrRefreshPublicBill,
  createPublicServiceRequest,
  ApiError,
} from "@/lib/api";
import { PublicOrderResponse } from "@/lib/types";
import { savePublicSessionToken } from "@/lib/publicSessionStorage";
import { useRealtime } from "@/lib/realtime";

interface OrderTrackingClientProps {
  publicToken: string;
}

type SRStatus = "idle" | "loading" | "success" | "error";

export default function OrderTrackingClient({
  publicToken,
}: OrderTrackingClientProps) {
  const router = useRouter();
  const [orderData, setOrderData] = useState<PublicOrderResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [language, setLanguage] = useState<"en" | "ml">("en");

  // Service request state
  const [srStatus, setSrStatus] = useState<Record<string, SRStatus>>({});
  const [srMessage, setSrMessage] = useState<Record<string, string>>({});

  const translations = {
    en: {
      title: "Order Tracking",
      table: "Table",
      status: "Status",
      lastUpdated: "Last updated",
      retry: "Retry",
      connectionError: "Could not fetch order tracking details. Please try again.",
      orderNotFound: "Order Not Found",
      orderNotFoundDesc: "The requested tracking link is invalid or expired.",
      orderProgress: "Order Progress",
      orderRejected: "Order Rejected",
      orderRejectedDesc: "The kitchen was unable to process your order. Please check with staff or place a new order.",
      itemsOrdered: "Items Ordered",
      yourNote: "Your Note",
      totalPrice: "Total Price",
      needSomething: "Need Something?",
      needSomethingDesc: "Tap to alert the staff — they will attend to you shortly.",
      callWaiter: "Call Waiter",
      water: "Water",
      requestBill: "Request Bill",
      viewFullBill: "View full table bill",
      combinedSubtotal: "Combined subtotal",
      requestSent: "Request sent!",
      failedSend: "Failed to send request.",
      tooManyRequests: "Too many requests. Please wait.",
      wait: "Please wait...",
      statusLabels: {
        pending: "Order received",
        accepted: "Accepted",
        preparing: "Preparing",
        ready: "Ready",
        served: "Served",
        rejected: "Rejected",
      } as Record<string, string>,
      stageLabels: ["Received", "Accepted", "Preparing", "Ready", "Served"],
    },
    ml: {
      title: "ഓർഡർ ട്രാക്കിംഗ്",
      table: "മേശ",
      status: "നില",
      lastUpdated: "അവസാനം പുതുക്കിയത്",
      retry: "വീണ്ടും ശ്രമിക്കുക",
      connectionError: "ട്രാക്കിംഗ് വിവരങ്ങൾ ലഭ്യമാക്കാൻ കഴിഞ്ഞില്ല. ദയവായി വീണ്ടും ശ്രമിക്കുക.",
      orderNotFound: "ഓർഡർ കണ്ടെത്തിയില്ല",
      orderNotFoundDesc: "അഭ്യർത്ഥിച്ച ലിങ്ക് അസാധുവാണ് അല്ലെങ്കിൽ കാലഹരണപ്പെട്ടു.",
      orderProgress: "ഓർഡർ പുരോഗതി",
      orderRejected: "ഓർഡർ നിരസിച്ചു",
      orderRejectedDesc: "അടുക്കളയിൽ നിങ്ങളുടെ ഓർഡർ പ്രോസസ്സ് ചെയ്യാൻ സാധിച്ചില്ല. ദയവായി ജീവനക്കാരുമായി ബന്ധപ്പെടുക അല്ലെങ്കിൽ പുതിയ ഓർഡർ നൽകുക.",
      itemsOrdered: "ഓർഡർ ചെയ്ത വിഭവങ്ങൾ",
      yourNote: "നിങ്ങളുടെ നിർദ്ദേശം",
      totalPrice: "ആകെ തുക",
      needSomething: "എന്തെങ്കിലും ആവശ്യമുണ്ടോ?",
      needSomethingDesc: "ജീവനക്കാരെ അറിയിക്കാൻ താഴെയുള്ള ബട്ടണുകൾ ഉപയോഗിക്കുക.",
      callWaiter: "വെയ്റ്ററെ വിളിക്കുക",
      water: "വെള്ളം",
      requestBill: "ബിൽ ചോദിക്കുക",
      viewFullBill: "മുഴുവൻ ടേബിൾ ബിൽ കാണുക",
      combinedSubtotal: "ആകെ തുക",
      requestSent: "സന്ദേശം അയച്ചു!",
      failedSend: "സന്ദേശം അയക്കാൻ സാധിച്ചില്ല.",
      tooManyRequests: "വളരെ കൂടുതൽ സന്ദേശങ്ങൾ അയച്ചു. ദയവായി കാത്തിരിക്കുക.",
      wait: "ദയവായി കാത്തിരിക്കുക...",
      statusLabels: {
        pending: "ഓർഡർ ലഭിച്ചു",
        accepted: "സ്വീകരിച്ചു",
        preparing: "തയ്യാറാക്കുന്നു",
        ready: "തയ്യാറായി",
        served: "നൽകി",
        rejected: "നിരസിച്ചു",
      } as Record<string, string>,
      stageLabels: ["ലഭിച്ചു", "സ്വീകരിച്ചു", "തയ്യാറാക്കുന്നു", "തയ്യാറായി", "നൽകി"],
    }
  };

  const t = translations[language];

  const SR_TYPES = [
    { type: "waiter", label: `🙋 ${t.callWaiter}` },
    { type: "water", label: `💧 ${t.water}` },
    { type: "bill", label: `🧾 ${t.requestBill}` },
  ] as const;

  // Fetch Order function
  const fetchOrder = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const data = await getPublicOrder(publicToken);
      setOrderData(data);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Connection issue. Showing last loaded details.");
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [publicToken]);

  useRealtime({
    target: { kind: "order", token: publicToken },
    onEvent: () => void fetchOrder(false),
    onReconnect: () => void fetchOrder(false),
  });

  // Initial fetch and visibility change handler
  useEffect(() => {
    const timeout = window.setTimeout(() => fetchOrder(true), 0);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchOrder(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchOrder]);

  // Polling setup
  useEffect(() => {
    if (!orderData) return;
    const status = orderData.status;

    if (status === "served" || status === "rejected") {
      return;
    }

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchOrder(false);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchOrder, orderData]);

  const stages = ["pending", "accepted", "preparing", "ready", "served"];

  const getStageIndex = (status: string) => {
    return stages.indexOf(status);
  };

  if (loading && !orderData) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-950 px-4 py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-600"></div>
        <p className="mt-4 text-zinc-600 dark:text-zinc-400 font-medium">
          {language === "en" ? "Loading order details..." : "ഓർഡർ വിവരങ്ങൾ ലോഡ് ചെയ്യുന്നു..."}
        </p>
      </div>
    );
  }

  if (error === "Order not found" && !orderData) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 text-center">
        <div className="max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
          <div className="text-red-500 text-5xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
            {t.orderNotFound}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t.orderNotFoundDesc}
          </p>
        </div>
      </div>
    );
  }

  if (error && !orderData) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 text-center">
        <div className="max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 shadow-sm">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 mb-2">
            {language === "en" ? "Connection Error" : "കണക്ഷൻ തകരാർ"}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
            {t.connectionError}
          </p>
          <button
            onClick={() => fetchOrder(true)}
            className="px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-xl transition cursor-pointer"
          >
            {t.retry}
          </button>
        </div>
      </div>
    );
  }

  if (!orderData) return null;

  const currentStatusIndex = getStageIndex(orderData.status);
  const isRejected = orderData.status === "rejected";

  return (
    <div className="flex flex-col flex-1 min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 py-8 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto w-full flex flex-col gap-6">
        
        {/* Language Selector bar at top */}
        <div className="flex justify-end">
          <button
            onClick={() => setLanguage(language === "en" ? "ml" : "en")}
            className="text-xs font-bold text-orange-600 dark:text-orange-500 hover:underline px-3 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 cursor-pointer shadow-2xs"
          >
            🌐 {language === "en" ? "മലയാളം" : "English"}
          </button>
        </div>

        {/* Main Header */}
        <header className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-xs flex flex-col gap-3 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-500 to-orange-600"></div>
          <div className="flex items-start justify-between gap-4 mt-2">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-500">
                {orderData.restaurant_name}
              </span>
              <h1 className="text-2xl font-black text-zinc-950 dark:text-zinc-50 mt-0.5">
                {orderData.order_number}
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-bold mt-1">
                {t.table} {orderData.table_number}
              </p>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs text-zinc-400 dark:text-zinc-500 font-semibold">
                {t.status}
              </span>
              <span
                className={`text-sm font-bold px-3 py-1 rounded-lg mt-1 ${
                  isRejected
                    ? "bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400"
                    : "bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-500"
                }`}
              >
                {t.statusLabels[orderData.status] || orderData.status}
              </span>
            </div>
          </div>

          {error && (
            <div className="mt-2 text-xs font-semibold bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 p-3 rounded-xl flex items-center justify-between">
              <span>{error}</span>
              <button
                onClick={() => fetchOrder(false)}
                className="underline hover:text-red-700 dark:hover:text-red-300 ml-2"
              >
                {t.retry}
              </button>
            </div>
          )}

          {lastUpdated && (
            <div className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 self-end">
              {t.lastUpdated}: {lastUpdated.toLocaleTimeString()}
            </div>
          )}

          {orderData.dining_session_token && (
            <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                    {t.combinedSubtotal}
                  </p>
                  <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">
                    ₹{Number(orderData.session_subtotal || orderData.subtotal).toFixed(2)}
                  </p>
                  {orderData.session_order_count !== null &&
                    orderData.session_order_count !== undefined && (
                    <p className="text-xs font-semibold text-emerald-700/80 dark:text-emerald-300/80">
                      {orderData.session_order_count} orders
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    if (
                      orderData.restaurant_slug &&
                      orderData.table_code &&
                      orderData.dining_session_token
                    ) {
                      savePublicSessionToken(
                        orderData.restaurant_slug,
                        orderData.table_code,
                        orderData.dining_session_token
                      );
                    }
                    router.push(`/session/${orderData.dining_session_token}`);
                  }}
                  className="min-h-12 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700"
                >
                  {t.viewFullBill}
                </button>
              </div>
            </div>
          )}
        </header>

        {/* Visual Timeline Panel */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-xs flex flex-col gap-4">
          <h2 className="text-sm font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
            {t.orderProgress}
          </h2>

          {isRejected ? (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 text-red-700 dark:text-red-400 rounded-2xl p-5 flex items-start gap-3">
              <span className="text-2xl">❌</span>
              <div>
                <h3 className="font-bold text-sm">{t.orderRejected}</h3>
                <p className="text-xs mt-1 text-red-600/90 dark:text-red-400/90">
                  {t.orderRejectedDesc}
                </p>
              </div>
            </div>
          ) : (
            /* Horizontal Timeline */
            <div className="relative flex items-center justify-between mt-2">
              <div className="absolute left-6 right-6 top-[15px] h-0.5 bg-zinc-200 dark:bg-zinc-800 -z-0"></div>
              <div
                className="absolute left-6 top-[15px] h-0.5 bg-orange-600 -z-0 transition-all duration-500"
                style={{
                  width: `${
                    currentStatusIndex > 0
                      ? (currentStatusIndex / (stages.length - 1)) * 100
                      : 0
                  }%`,
                  right: "auto",
                }}
              ></div>

              {t.stageLabels.map((label, idx) => {
                const isCompleted = idx < currentStatusIndex;
                const isActive = idx === currentStatusIndex;
                return (
                  <div
                    key={label}
                    className="flex flex-col items-center z-10 w-12"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition duration-300 ${
                        isCompleted
                          ? "bg-orange-600 text-white"
                          : isActive
                          ? "bg-orange-600 text-white ring-4 ring-orange-100 dark:ring-orange-950/30"
                          : "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500"
                      }`}
                    >
                      {isCompleted ? "✓" : idx + 1}
                    </div>
                    <span
                      className={`text-[9px] sm:text-[10px] font-bold text-center mt-2 ${
                        isActive
                          ? "text-orange-600 dark:text-orange-500 font-extrabold"
                          : isCompleted
                          ? "text-zinc-800 dark:text-zinc-200"
                          : "text-zinc-400 dark:text-zinc-500"
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Order Details Panel */}
        <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-xs flex flex-col gap-4">
          <h2 className="text-sm font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800 pb-2">
            {t.itemsOrdered}
          </h2>

          <div className="flex flex-col gap-4">
            {orderData.items.map((item, idx) => (
              <div
                key={idx}
                className="flex items-start justify-between gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800/50 last:border-b-0 last:pb-0"
              >
                <div>
                  <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-50">
                    {item.item_name}
                  </h4>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500 font-semibold">
                    ₹{Number(item.unit_price).toFixed(2)} × {item.quantity}
                  </span>
                  {item.item_note && (
                    <p className="text-xs text-orange-600 dark:text-orange-500 mt-1 italic">
                      Note: {item.item_note}
                    </p>
                  )}
                </div>
                <span className="font-bold text-sm text-zinc-950 dark:text-zinc-50 whitespace-nowrap">
                  ₹{Number(item.total_price).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          {orderData.customer_note && (
            <div className="mt-4 bg-zinc-50 dark:bg-zinc-800/30 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-850/50">
              <h4 className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
                {t.yourNote}
              </h4>
              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                {orderData.customer_note}
              </p>
            </div>
          )}

          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 flex items-center justify-between">
            <span className="text-zinc-500 dark:text-zinc-400 font-bold text-sm">
              {t.totalPrice}
            </span>
            <span className="text-lg font-black text-orange-600 dark:text-orange-500">
              ₹{Number(orderData.subtotal).toFixed(2)}
            </span>
          </div>
        </section>

        {/* Service Request Buttons */}
        {orderData.service_requests_enabled !== false &&
          !isRejected &&
          orderData.status !== "served" &&
          orderData.restaurant_slug &&
          orderData.table_code && (
          <section className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-xs flex flex-col gap-4">
            <h2 className="text-sm font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
              {t.needSomething}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              {t.needSomethingDesc}
            </p>
            <div className="grid grid-cols-3 gap-3">
              {SR_TYPES.map(({ type, label }) => {
                const status = srStatus[type] || "idle";
                const msg = srMessage[type];
                return (
                  <div key={type} className="flex flex-col gap-1">
                    <button
                      id={`sr-btn-${type}`}
                      disabled={status === "loading" || status === "success"}
                      onClick={async () => {
                        setSrStatus((prev) => ({ ...prev, [type]: "loading" }));
                        setSrMessage((prev) => ({ ...prev, [type]: "" }));
                        try {
                          if (type === "bill" && orderData.dining_session_token) {
                            await createOrRefreshPublicBill(orderData.dining_session_token);
                          }
                          await createPublicServiceRequest(
                            orderData.restaurant_slug!,
                            orderData.table_code!,
                            { request_type: type as "waiter" | "water" | "bill", public_order_token: publicToken }
                          );
                          setSrStatus((prev) => ({ ...prev, [type]: "success" }));
                          setSrMessage((prev) => ({ ...prev, [type]: t.requestSent }));
                          setTimeout(() => {
                            setSrStatus((prev) => ({ ...prev, [type]: "idle" }));
                            setSrMessage((prev) => ({ ...prev, [type]: "" }));
                          }, 15_000);
                        } catch (err) {
                          let msg = t.failedSend;
                          if (err instanceof ApiError && err.status === 429) {
                            msg = t.tooManyRequests;
                          } else if (err instanceof Error) {
                            msg = err.message;
                          }
                          setSrStatus((prev) => ({ ...prev, [type]: "error" }));
                          setSrMessage((prev) => ({ ...prev, [type]: msg }));
                          setTimeout(() => {
                            setSrStatus((prev) => ({ ...prev, [type]: "idle" }));
                            setSrMessage((prev) => ({ ...prev, [type]: "" }));
                          }, 8_000);
                        }
                      }}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border text-center transition-all duration-200 cursor-pointer disabled:cursor-not-allowed ${
                        status === "success"
                          ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700/40"
                          : status === "error"
                          ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/40"
                          : status === "loading"
                          ? "bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-700/40 opacity-70"
                          : "bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 hover:bg-orange-50 dark:hover:bg-orange-950/20 hover:border-orange-300 dark:hover:border-orange-600/50"
                      }`}
                    >
                      <span className="text-xl">
                        {status === "success" ? "✓" : status === "loading" ? "⏳" : label.split(" ")[0]}
                      </span>
                      <span className={`text-[10px] font-extrabold uppercase tracking-wide ${
                        status === "success"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : status === "error"
                          ? "text-red-500 dark:text-red-400"
                          : "text-zinc-700 dark:text-zinc-300"
                      }`}>
                        {label.split(" ").slice(1).join(" ")}
                      </span>
                    </button>
                    {msg && (
                      <p className={`text-[9px] text-center font-semibold leading-tight ${
                        status === "success" ? "text-emerald-500" : "text-red-400"
                      }`}>
                        {msg}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
