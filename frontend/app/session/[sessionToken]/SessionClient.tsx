"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PublicThemeControl } from "@/components/PublicThemeControl";
import {
  ApiError,
  createPublicServiceRequest,
  requestPublicSessionBill,
  getPublicDiningSession,
  getTableParticipantAuthority,
  isDefiniteAuthFailure,
} from "@/lib/api";
import { PublicDiningSessionResponse } from "@/lib/types";
import {
  clearLegacyPublicReceiptToken,
  clearParticipantToken,
  clearPublicSessionToken,
  savePublicSessionToken,
  readParticipantToken,
  readSessionParticipantToken,
  saveParticipantToken,
  saveSessionParticipantToken,
  clearSessionParticipantToken,
} from "@/lib/publicSessionStorage";
import { clearCustomerCartState, completionPath, markCompletedSession, readCompletedSession } from "@/lib/customerCompletion";
import { useRealtime } from "@/lib/realtime";
import { customerPushSupported, enableCustomerPush } from "@/lib/customerPush";
import { detachedBillPath, markDetachedSession, readDetachedSession } from "@/lib/customerDetachment";

interface SessionClientProps {
  sessionToken: string;
}

type ServiceStatus = "idle" | "loading" | "success" | "error";

function CompletedSessionRedirect({ sessionToken }: { sessionToken: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(completionPath(sessionToken));
  }, [router, sessionToken]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--omlu-page-background)] px-4 py-8">
      <p className="text-sm font-semibold text-[var(--omlu-text-secondary)]">Finishing your visit…</p>
    </div>
  );
}

function FinishingVisitLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--omlu-page-background)] px-4 py-8">
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-orange-600 border-t-transparent" />
        <p className="text-sm font-semibold text-[var(--omlu-text-secondary)]">Finishing your visit…</p>
      </div>
    </div>
  );
}

export default function SessionClient(props: SessionClientProps) {
  const [completionState, setCompletionState] = useState<"checking" | "completed" | "active">("checking");

  useEffect(() => {
    const timeout = setTimeout(() => {
      const completed = readCompletedSession(props.sessionToken);
      if (completed) {
        setCompletionState("completed");
      } else {
        setCompletionState("active");
      }
    }, 0);
    return () => clearTimeout(timeout);
  }, [props.sessionToken]);

  if (completionState === "checking") {
    return <FinishingVisitLoader />;
  }

  if (completionState === "completed") {
    return <CompletedSessionRedirect sessionToken={props.sessionToken} />;
  }

  return <ActiveSessionClient {...props} />;
}

function ActiveSessionClient({ sessionToken }: SessionClientProps) {
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
  const [reopenNotice, setReopenNotice] = useState<string | null>(null);
  const [participantToken, setParticipantToken] = useState<string | null>(() => readSessionParticipantToken(sessionToken));
  const [visibleJoinCode, setVisibleJoinCode] = useState<string | null>(null);
  const [joinCodeCopied, setJoinCodeCopied] = useState(false);
  const fetchInFlightRef = useRef(false);
  const pendingFetchRef = useRef(false);
  const previousStatusRef = useRef<string | null>(null);


  useEffect(() => {
    if (typeof window === "undefined" || !sessionToken) return;
    window.history.replaceState(
      {
        ...window.history.state,
        omluCustomerSessionToken: sessionToken,
      },
      "",
      window.location.href
    );
  }, [sessionToken]);

  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [animatedStages, setAnimatedStages] = useState<Record<string, string>>({});
  const prevStatusesRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const enforce = () => {
      const detached = readDetachedSession(sessionToken);
      if (detached) router.replace(detachedBillPath(detached));
      else if (readCompletedSession(sessionToken)) router.replace(completionPath(sessionToken));
    };
    enforce();
    window.addEventListener("pageshow", enforce);
    window.addEventListener("popstate", enforce);
    window.addEventListener("focus", enforce);
    return () => { window.removeEventListener("pageshow", enforce); window.removeEventListener("popstate", enforce); window.removeEventListener("focus", enforce); };
  }, [router, sessionToken]);
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
            let authority = readSessionParticipantToken(sessionToken) || participantToken;
            if (!authority && session?.restaurant_slug && session?.table_code) {
              authority = readParticipantToken(session.restaurant_slug, session.table_code);
              if (authority) {
                saveSessionParticipantToken(sessionToken, authority);
              }
            }
            if (!authority) throw new ApiError(401, "Your access to this table has ended.");
            const data = await getPublicDiningSession(sessionToken, authority);
            if (previousStatusRef.current === "payment_requested" && data.status === "open") {
              setReopenNotice("Ordering has been reopened.");
            }
            previousStatusRef.current = data.status;
            setSession(data);
            setError(null);
            setLastUpdated(new Date());

            if (["closed", "cancelled"].includes(data.status)) {
              setVisibleJoinCode(null);
              clearPublicSessionToken(data.restaurant_slug, data.table_code);
              clearParticipantToken(data.restaurant_slug, data.table_code);
              clearLegacyPublicReceiptToken(data.restaurant_slug, data.table_code);
              clearSessionParticipantToken(sessionToken);
              clearCustomerCartState(data.restaurant_slug, data.table_code, sessionToken);
              setParticipantToken(null);
              markCompletedSession({ sessionToken, restaurantSlug: data.restaurant_slug, restaurantName: data.restaurant_name, tableCode: data.table_code });
              router.replace(completionPath(sessionToken));
              return;
            } else {
              saveParticipantToken(data.restaurant_slug, data.table_code, authority);
              saveSessionParticipantToken(sessionToken, authority);
              setParticipantToken(authority);
              const participantAuthority = await getTableParticipantAuthority(sessionToken, authority);
              setVisibleJoinCode(participantAuthority.join_code);
              setJoinCodeCopied(false);
              savePublicSessionToken(data.restaurant_slug, data.table_code, data.public_token);
              clearLegacyPublicReceiptToken(data.restaurant_slug, data.table_code);
            }
          } catch (err) {
            if (isDefiniteAuthFailure(err)) {
              setVisibleJoinCode(null);
              setParticipantToken(null);
              setError(err instanceof ApiError ? err.message : t.notFound);
            } else if (!session) {
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
    [participantToken, router, session, sessionToken, t.connectionError, t.notFound]
  );

  const copyJoinCode = useCallback(async () => {
    if (!visibleJoinCode) return;
    await navigator.clipboard.writeText(visibleJoinCode);
    setJoinCodeCopied(true);
  }, [visibleJoinCode]);

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
    enabled: Boolean(participantToken),
    target: { kind: "session", token: sessionToken, participantToken: participantToken || undefined },
    onEvent: (event) => {
      if (event.type === "bill.detached_for_payment") {
        const detached = readDetachedSession(sessionToken);
        if (detached) router.replace(detachedBillPath(detached));
        return;
      }
      if (event.type === "session.ordering_reopened") {
        setReopenNotice("Ordering has been reopened.");
      }
      void fetchSession(false);
    },
    onReconnect: () => void fetchSession(false),
  });

  useEffect(() => {
    const intervalMs = realtimeStatus === "live" ? 90_000 : 15_000;
    const interval = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      fetchSession(false);
    }, intervalMs);
    return () => window.clearInterval(interval);
  }, [fetchSession, realtimeStatus]);

  const serviceTypes = [
    { type: "waiter", label: t.callWaiter },
    { type: "water", label: t.water },
  ] as const;

  const handleAddMore = () => {
    if (!session) return;
    savePublicSessionToken(
      session.restaurant_slug,
      session.table_code,
      session.public_token
    );
    const activeParticipantToken = participantToken || readSessionParticipantToken(session.public_token);
    if (activeParticipantToken) {
      saveParticipantToken(
        session.restaurant_slug,
        session.table_code,
        activeParticipantToken
      );
      saveSessionParticipantToken(session.public_token, activeParticipantToken);
    }
    router.push(
      `/menu/${encodeURIComponent(session.restaurant_slug)}/${encodeURIComponent(
        session.table_code
      )}?session=${encodeURIComponent(session.public_token)}`
    );
  };

  const handleViewBill = () => {
    document.getElementById("provisional-bill")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleRequestBill = async () => {
    if (!session || billActionLoading) return;
    setBillActionLoading("request");
    setBillActionError(null);
    try {
      if (!participantToken) throw new Error("Your access to this table has ended.");
      await requestPublicSessionBill(session.public_token, participantToken);
      setBillActionError(null);
      setServiceMessage((prev) => ({ ...prev, bill: t.billRequestSent }));
      await fetchSession(false);
    } catch (err) {
      setBillActionError(err instanceof Error ? err.message : "Failed to request bill.");
    } finally {
      setBillActionLoading(null);
    }
  };

  useEffect(() => {
    if (!session?.bill?.receipt_token || !["issued", "payment_pending", "paid"].includes(session.bill.status)) return;
    markDetachedSession({ sessionToken: session.public_token, restaurantSlug: session.restaurant_slug, restaurantName: session.restaurant_name, tableCode: session.table_code, receiptToken: session.bill.receipt_token });
    router.replace(detachedBillPath({ sessionToken: session.public_token, receiptToken: session.bill.receipt_token }));
  }, [router, session]);

  const handleServiceRequest = async (type: "waiter" | "water") => {
    if (!session) return;
    setServiceStatus((prev) => ({ ...prev, [type]: "loading" }));
    setServiceMessage((prev) => ({ ...prev, [type]: "" }));
    try {
      if (!participantToken) throw new Error("Your access to this table has ended.");
      await createPublicServiceRequest(session.restaurant_slug, session.table_code, {
        request_type: type,
      }, participantToken);
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
      if (!participantToken) throw new Error("Your access to this table has ended.");
      await enableCustomerPush(session.public_token, participantToken);
      setPushStatus("enabled");
      setPushMessage(t.pushEnabled);
    } catch (err) {
      setPushStatus("error");
      setPushMessage(err instanceof Error ? err.message : t.pushError);
    }
  };

  if (loading && !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--omlu-muted-surface)] px-4 py-8 dark:bg-[var(--omlu-page-background)]">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-orange-600" />
        <p className="mt-4 font-medium text-[var(--omlu-text-secondary)] dark:text-[var(--omlu-text-secondary)]">
          {t.loading}
        </p>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--omlu-muted-surface)] p-6 text-center dark:bg-[var(--omlu-page-background)]">
        <div className="w-full max-w-md rounded-3xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-8 shadow-sm dark:border-[var(--omlu-border)] dark:bg-[var(--omlu-primary-surface)]">
          <div className="mb-4 text-5xl">!</div>
          <h1 className="mb-2 text-xl font-bold text-[var(--omlu-text-primary)] dark:text-[var(--omlu-text-primary)]">
            {error}
          </h1>
          <button
            onClick={() => fetchSession(true)}
            className="mt-6 min-h-12 rounded-2xl bg-orange-600 px-6 py-3 font-bold text-[var(--omlu-primary-action-text)] transition hover:bg-orange-700"
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
    <div className="min-h-screen bg-[var(--omlu-muted-surface)] px-4 py-6 text-[var(--omlu-text-primary)] dark:bg-[var(--omlu-page-background)] dark:text-[var(--omlu-text-secondary)] sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-extrabold text-[var(--omlu-text-primary)]">{session.restaurant_name}</h1>
            <p className="text-xs font-semibold text-[var(--omlu-text-secondary)]">{t.table} {session.table_number}</p>
          </div>
          <div className="flex gap-2">
          <PublicThemeControl />
          <button
            onClick={handleEnablePush}
            disabled={pushStatus === "loading" || pushStatus === "enabled"}
            className="min-h-10 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 shadow-2xs disabled:opacity-60 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
          >
            {pushStatus === "enabled" ? t.pushEnabled : pushStatus === "loading" ? "..." : t.enablePush}
          </button>
          <button
            onClick={() => setLanguage(language === "en" ? "ml" : "en")}
            className="min-h-10 rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3 py-2 text-xs font-bold text-orange-700 shadow-2xs dark:border-[var(--omlu-border)] dark:bg-[var(--omlu-primary-surface)] dark:text-orange-500"
          >
            {language === "en" ? "മലയാളം" : "English"}
          </button>
          </div>
        </div>

        {pushMessage && (
          <p className={`rounded-2xl px-4 py-3 text-sm font-bold ${
            pushStatus === "enabled"
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "bg-[var(--omlu-muted-surface)] text-[var(--omlu-text-primary)] dark:bg-[var(--omlu-primary-surface)] dark:text-[var(--omlu-text-secondary)]"
          }`}>
            {pushMessage}
          </p>
        )}

        {reopenNotice && (
          <p className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
            {reopenNotice}
          </p>
        )}


        <header className="rounded-3xl bg-[var(--omlu-primary-surface)] p-5 shadow-xs">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-[var(--omlu-text-secondary)]">{session.order_count ? (language === "en" ? "Your order" : "നിങ്ങളുടെ ഓർഡർ") : t.noOrders}</p>
              <h2 className="mt-1 text-xl font-black text-[var(--omlu-text-primary)]">{session.orders.length ? t.statusLabels[session.orders[session.orders.length - 1].status] : (language === "en" ? "Ready when you are" : "നിങ്ങൾ തയ്യാറാകുമ്പോൾ")}</h2>
            </div>
            <div className="text-right tabular-nums">
              <p className="text-xs font-semibold text-[var(--omlu-text-secondary)]">
                {t.sessionStatus}
              </p>
              <p className="mt-1 rounded-xl bg-orange-50 px-3 py-1 text-sm font-black text-orange-700 dark:bg-orange-950/20 dark:text-orange-500">
                {t.statusLabels[session.status] || session.status}
              </p>
            </div>
          </div>

          {participantToken && visibleJoinCode && ["open", "payment_requested", "payment_pending"].includes(session.status) && (
            <section className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--omlu-border)] pt-3" aria-labelledby="session-invite-title">
              <div className="min-w-0 text-sm"><h2 id="session-invite-title" className="font-bold">Invite someone to this table</h2><p className="text-xs text-[var(--omlu-text-secondary)]">Join code: <span className="font-black tracking-[0.16em] tabular-nums">{visibleJoinCode}</span></p></div>
              <button type="button" onClick={() => void copyJoinCode()} className="min-h-11 shrink-0 rounded-xl border border-[var(--omlu-border)] px-3 text-xs font-black">
                {joinCodeCopied ? "Copied" : "Copy code"}
              </button>
            </section>
          )}

          <div className="mt-5 flex items-end justify-between gap-3 border-t border-[var(--omlu-border)] pt-4">
            <div>
              <p className="text-xs font-bold uppercase text-[var(--omlu-text-secondary)]">
                {t.orders}
              </p>
              <p className="mt-1 text-sm font-black">{session.order_count}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-[var(--omlu-text-secondary)]">
                {t.combinedSubtotal}
              </p>
              <p className="mt-1 text-2xl font-black tabular-nums text-[var(--omlu-text-primary)]">
                ₹{Number(session.combined_subtotal).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-[var(--omlu-muted-surface)] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-orange-700 dark:text-orange-500">
                  {t.billState}
                </p>
                <p className="mt-1 text-lg font-black text-[var(--omlu-text-primary)] dark:text-[var(--omlu-text-primary)]">
                  {billStatusLabel}
                </p>
                {session.bill?.paid_at && (
                  <p className="mt-1 text-xs font-semibold text-[var(--omlu-text-secondary)] dark:text-[var(--omlu-text-secondary)]">
                    {t.paidAt}: {new Date(session.bill.paid_at).toLocaleString()}
                  </p>
                )}
              </div>
              {billTotal && (
                <p className="text-right text-2xl font-black text-orange-700 dark:text-orange-500">
                  {billTotal}
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3">
            {canOrderMore && (
              <button
                onClick={handleAddMore}
                className="min-h-12 rounded-xl bg-orange-600 px-5 py-3 text-center text-sm font-black text-white shadow-sm hover:bg-orange-700"
              >
                {t.addMore}
              </button>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {session.bill?.status === "draft" && <button
                onClick={handleViewBill}
                disabled={billActionLoading !== null}
                className="min-h-14 rounded-2xl bg-[var(--omlu-primary-surface)] px-5 py-4 text-base font-black text-[var(--omlu-primary-action-text)] shadow-md transition hover:bg-[var(--omlu-muted-surface)] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[var(--omlu-muted-surface)] dark:text-[var(--omlu-text-primary)] dark:hover:bg-[var(--omlu-primary-surface)]"
              >
                {session.bill?.status === "draft" ? "Review current bill" : t.viewBill}
              </button>}
              {session.status === "open" && (
                <button
                  onClick={handleRequestBill}
                  disabled={billActionLoading !== null}
                  className="min-h-12 rounded-xl border border-[var(--omlu-border)] bg-transparent px-5 py-3 text-sm font-black text-[var(--omlu-text-primary)] disabled:opacity-60"
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
            {session.status === "payment_requested" && (
              <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-sm font-bold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                {language === "en"
                  ? "Bill requested · Staff reviewing. Final amount may change until the bill is issued."
                  : "ബിൽ അഭ്യർത്ഥിച്ചു. ജീവനക്കാർ നിങ്ങളുടെ ബിൽ പരിശോധിക്കുകയാണ്. ജീവനക്കാർ പ്രോസസ്സ് ചെയ്യുമ്പോൾ നിങ്ങൾക്ക് വിഭവങ്ങൾ കാണാം."}
              </p>
            )}
            {!canOrderMore && session.status !== "payment_requested" && (
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
            <p className="mt-3 text-right text-[10px] font-semibold text-[var(--omlu-text-secondary)]">
              {t.lastUpdated}: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
          {realtimeStatus !== "live" && (
            <p className="mt-2 rounded-xl bg-[var(--omlu-muted-surface)] px-3 py-2 text-xs font-semibold text-[var(--omlu-text-secondary)] dark:bg-[var(--omlu-muted-surface)] dark:text-[var(--omlu-text-secondary)]">
              {t.realtimeOffline}
            </p>
          )}
        </header>

        <section className="border-y border-[var(--omlu-border)] py-5">
          <h2 className="mb-3 text-base font-black text-[var(--omlu-text-primary)]">
            {t.needSomething}
          </h2>
          {session.service_requests_enabled ? (
            <div className="grid grid-cols-2 gap-3">
              {serviceTypes.map(({ type, label }) => {
                const status = serviceStatus[type] || "idle";
                const message = serviceMessage[type];
                return (
                  <div key={type} className="flex flex-col gap-1">
                    <button
                      onClick={() => handleServiceRequest(type)}
                      disabled={status === "loading" || status === "success"}
                      className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-black transition disabled:cursor-not-allowed ${
                        status === "success"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-950/20 dark:text-emerald-400"
                          : status === "error"
                          ? "border-red-200 bg-red-50 text-red-600 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-400"
                          : "border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)] text-[var(--omlu-text-primary)] hover:border-orange-300 hover:bg-orange-50 dark:border-[var(--omlu-border)] dark:bg-[var(--omlu-muted-surface)] dark:text-[var(--omlu-text-secondary)]"
                      }`}
                    >
                      {status === "loading" ? "..." : status === "success" ? "✓" : label}
                    </button>
                    {message && (
                      <p className="text-center text-[10px] font-semibold text-[var(--omlu-text-secondary)]">
                        {message}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="rounded-2xl bg-[var(--omlu-muted-surface)] p-4 text-sm font-semibold text-[var(--omlu-text-secondary)] dark:bg-[var(--omlu-muted-surface)]">
              Service requests are disabled.
            </p>
          )}

          {session.service_requests.length > 0 && <div className="mt-5 border-t border-[var(--omlu-border)] pt-4">
            <h3 className="text-xs font-black uppercase tracking-wide text-[var(--omlu-text-secondary)] dark:text-[var(--omlu-text-secondary)]">
              {t.serviceHistory}
            </h3>
              <div className="mt-3 flex flex-col gap-2">
                {session.service_requests.map((request, index) => (
                  <div
                    key={`${request.request_type}-${request.created_at}-${index}`}
                    className="flex items-start justify-between gap-3 rounded-2xl bg-[var(--omlu-muted-surface)] p-3 dark:bg-[var(--omlu-muted-surface)]"
                  >
                    <div>
                      <p className="text-sm font-black capitalize text-[var(--omlu-text-primary)] dark:text-[var(--omlu-text-secondary)]">
                        {request.request_type}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-[var(--omlu-text-secondary)]">
                        {t.requestedAt}: {new Date(request.created_at).toLocaleTimeString()}
                      </p>
                      {request.resolved_at && (
                        <p className="text-[11px] font-semibold text-[var(--omlu-text-secondary)]">
                          {t.completedAt}: {new Date(request.resolved_at).toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                    <p className="rounded-xl bg-[var(--omlu-primary-surface)] px-3 py-1 text-xs font-black capitalize text-[var(--omlu-text-primary)] dark:bg-[var(--omlu-primary-surface)] dark:text-[var(--omlu-text-secondary)]">
                      {requestStatusLabel(request.status)}
                    </p>
                  </div>
                ))}
              </div>
          </div>}
        </section>

        {session.bill?.status === "draft" && (
          <section id="provisional-bill" className="scroll-mt-4 rounded-3xl border border-amber-200 bg-[var(--omlu-primary-surface)] p-5" aria-label="Provisional bill">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-black uppercase tracking-wide text-amber-700">Status: Draft</p><p className="mt-1 text-sm font-bold">Invoice number: Not issued</p><p className="text-sm font-bold">Invoice date: —</p></div>
              <p className="text-xl font-black">₹{Number(session.bill.total_amount).toFixed(2)}</p>
            </div>
            <div className="mt-4 grid gap-2 border-t border-[var(--omlu-border)] pt-4 text-sm font-semibold">
              <div className="flex justify-between"><span>Subtotal</span><span>₹{Number(session.bill.subtotal).toFixed(2)}</span></div>
              <div className="flex justify-between"><span>Discount</span><span>− ₹{Number(session.bill.discount_amount).toFixed(2)}</span></div>
              {Number(session.bill.cgst_amount) > 0 && <div className="flex justify-between"><span>CGST</span><span>₹{Number(session.bill.cgst_amount).toFixed(2)}</span></div>}
              {Number(session.bill.sgst_amount) > 0 && <div className="flex justify-between"><span>SGST</span><span>₹{Number(session.bill.sgst_amount).toFixed(2)}</span></div>}
              {Number(session.bill.igst_amount) > 0 && <div className="flex justify-between"><span>IGST</span><span>₹{Number(session.bill.igst_amount).toFixed(2)}</span></div>}
              <div className="flex justify-between border-t border-[var(--omlu-border)] pt-2 text-base font-black"><span>Provisional total</span><span>₹{Number(session.bill.total_amount).toFixed(2)}</span></div>
            </div>
          </section>
        )}

        <main className="flex flex-col gap-4">
          {session.orders.length === 0 ? (
            <section className="rounded-3xl border border-dashed border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-8 text-center dark:border-[var(--omlu-border)] dark:bg-[var(--omlu-primary-surface)]">
              <h2 className="text-lg font-black">{t.noOrders}</h2>
              <p className="mt-2 text-sm text-[var(--omlu-text-secondary)]">{t.noOrdersDesc}</p>
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
                  className="rounded-2xl bg-[var(--omlu-primary-surface)] p-4 shadow-xs"
                >
                  <div
                    onClick={handleToggle}
                    className="flex cursor-pointer items-center justify-between gap-3 border-b border-[var(--omlu-border-strong)] pb-3 dark:border-[var(--omlu-border)] select-none"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold uppercase text-[var(--omlu-text-secondary)]">
                          Order {index + 1} of {session.order_count}
                        </span>
                        <span className="text-[10px] font-semibold text-[var(--omlu-text-secondary)]">
                          • {new Date(order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <h2 className="text-lg font-black text-[var(--omlu-text-primary)] dark:text-[var(--omlu-text-primary)] flex items-center gap-2">
                        {order.order_number}
                      </h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="rounded-xl bg-[var(--omlu-muted-surface)] px-3 py-1 text-xs font-black text-[var(--omlu-text-primary)] dark:bg-[var(--omlu-muted-surface)] dark:text-[var(--omlu-text-secondary)]">
                        {t.statusLabels[order.status] || order.status}
                      </p>
                      <svg
                        className={`h-5 w-5 text-[var(--omlu-text-secondary)] transition-transform duration-200 ${
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
                    <div className="mt-4 border-b border-[var(--omlu-border)] pb-4">
                      <div className="flex items-start overflow-x-auto pb-2" aria-label={`Order progress: ${t.statusLabels[order.status] || order.status}`}>
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
                            <div key={stage.key} className="relative flex min-w-[76px] flex-1 flex-col items-center text-center">
                              {/* Left: Time */}
                              <span className="sr-only">{timestamp || ""}</span>

                              {/* Middle: Circle and connector */}
                              <div className="relative flex h-7 w-full flex-none flex-col items-center">
                                <div
                                  className={`z-10 flex h-6 w-6 items-center justify-center rounded-full text-[var(--omlu-primary-action-text)] transition-all duration-300 ${
                                    state === "completed"
                                      ? "bg-emerald-600 text-xs font-bold"
                                      : state === "current"
                                      ? "bg-orange-600 ring-4 ring-orange-100 dark:ring-orange-950/40"
                                      : "bg-[var(--omlu-muted-surface)] dark:bg-[var(--omlu-muted-surface)]"
                                  } ${isAnimated ? "motion-safe:animate-[bounce_0.6s_ease-in-out_2]" : ""}`}
                                >
                                  {state === "completed" ? (
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  ) : state === "current" ? (
                                    <div className="h-2 w-2 rounded-full bg-[var(--omlu-primary-surface)]" />
                                  ) : null}
                                </div>

                                {!isLast && (
                                  <div
                                    className={`absolute left-1/2 top-3 h-[2px] w-full ${
                                      state === "completed" ? "bg-emerald-600" : "bg-[var(--omlu-muted-surface)] dark:bg-[var(--omlu-muted-surface)]"
                                    }`}
                                  />
                                )}
                              </div>

                              {/* Right: Content */}
                              <div className="mt-1 min-w-0 px-1">
                                <h3
                                  className={`text-[11px] font-black leading-tight transition-colors duration-300 ${
                                    state === "current"
                                      ? "text-[var(--omlu-text-primary)] dark:text-[var(--omlu-text-primary)]"
                                      : state === "completed"
                                      ? "text-[var(--omlu-text-primary)] dark:text-[var(--omlu-text-secondary)]"
                                      : "text-[var(--omlu-text-secondary)] dark:text-[var(--omlu-text-secondary)]"
                                  }`}
                                >
                                  {title}
                                </h3>
                                <span className="sr-only">{desc}</span>
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
                          <p className="text-xs font-semibold text-[var(--omlu-text-secondary)]">
                            ₹{Number(item.unit_price).toFixed(2)} × {item.quantity}
                          </p>
                          {item.item_note && (
                            <p className="mt-1 text-xs italic text-orange-700 dark:text-orange-500">
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
                    <div className="mt-4 rounded-2xl bg-[var(--omlu-muted-surface)] p-3 text-xs text-[var(--omlu-text-secondary)] dark:bg-[var(--omlu-muted-surface)] dark:text-[var(--omlu-text-secondary)]">
                      <span className="font-bold">{t.note}:</span> {order.customer_note}
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-between border-t border-[var(--omlu-border-strong)] pt-3 dark:border-[var(--omlu-border)]">
                    <p className="text-sm font-bold text-[var(--omlu-text-secondary)]">{t.subtotal}</p>
                    <p className="text-lg font-black text-orange-700 dark:text-orange-500">
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
