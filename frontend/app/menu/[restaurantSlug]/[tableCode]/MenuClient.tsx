"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PublicThemeControl } from "@/components/PublicThemeControl";
import Image from "next/image";
import {
  getPublicMenu,
  getPublicDiningSession,
  getActivePublicDiningSession,
  addOrderToDiningSession,
  createFirstTableOrder,
  getTableSessionStatus,
  joinSecureTableSession,
  ApiError,
  isDefiniteAuthFailure,
} from "@/lib/api";
import {
  PublicMenuResponse,
  PublicDiningSessionResponse,
  MenuItem,
  OrderItemRequest,
  SelectedOptionRequest,
} from "@/lib/types";
import {
  clearLegacyPublicReceiptToken,
  clearPublicSessionToken,
  clearParticipantToken,
  readParticipantToken,
  readSessionParticipantToken,
  saveParticipantToken,
  saveSessionParticipantToken,
  readPublicSessionToken,
  savePublicSessionToken,
} from "@/lib/publicSessionStorage";
import { useRealtime } from "@/lib/realtime";
import { completionPath, readCompletedTable } from "@/lib/customerCompletion";
import { detachedBillPath, readDetachedSession } from "@/lib/customerDetachment";

export type CustomerMenuState =
  | "ready"
  | "join_required"
  | "ordering_active"
  | "bill_requested"
  | "payment_pending"
  | "completed"
  | "expired";

interface MenuClientProps {
  restaurantSlug: string;
  tableCode: string;
}

type CartLine = {
  key: string;
  menu_item_id: number;
  quantity: number;
  item_note: string;
  selected_options: SelectedOptionRequest[];
};

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

export default function MenuClient(props: MenuClientProps) {
  const searchParams = useSearchParams();
  const queryToken = searchParams.get("session");
  const [completionState, setCompletionState] = useState<"checking" | "completed" | "active">("checking");
  const [completedToken, setCompletedToken] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const completed = readCompletedTable(props.restaurantSlug, props.tableCode);
      const historySessionToken = typeof window !== "undefined" ? window.history.state?.omluCustomerSessionToken : null;
      const isRestoringSameCompletedVisit = Boolean(
        completed &&
        historySessionToken &&
        completed.sessionToken === historySessionToken &&
        (!queryToken || queryToken === completed.sessionToken)
      );

      if (isRestoringSameCompletedVisit && completed) {
        setCompletedToken(completed.sessionToken);
        setCompletionState("completed");
      } else {
        setCompletionState("active");
      }
    }, 0);
    return () => clearTimeout(timeout);
  }, [props.restaurantSlug, props.tableCode, queryToken]);

  if (completionState === "checking") {
    return <FinishingVisitLoader />;
  }

  if (completionState === "completed" && completedToken) {
    return <CompletedSessionRedirect sessionToken={completedToken} />;
  }

  return <ActiveMenuClient {...props} />;
}

function TableOrderStatusCard({
  menuState,
  tableNumber,
  joinCode,
  setJoinCode,
  joining,
  handleJoinTable,
  joinError,
  handleStartOrdering,
  isStartingSession,
  startSessionError,
  sessionToken,
  t,
  router,
}: {
  menuState: CustomerMenuState;
  tableNumber: string;
  joinCode: string;
  setJoinCode: (code: string) => void;
  joining: boolean;
  handleJoinTable: () => void;
  joinError: string | null;
  handleStartOrdering: () => void;
  isStartingSession: boolean;
  startSessionError: string | null;
  sessionToken?: string;
  t: Record<string, string>;
  router: ReturnType<typeof useRouter>;
}) {
  if (menuState === "ready") {
    return (
      <section className="rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-4 shadow-xs dark:border-[var(--omlu-border)]" aria-labelledby="status-card-title">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 id="status-card-title" className="text-sm font-black text-[var(--omlu-text-primary)]">
              {t.readyToOrderTitle} · {t.table} {tableNumber}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--omlu-text-secondary)]">
              {t.readyToOrderDesc.replace("{table}", tableNumber)}
            </p>
          </div>
          <button
            type="button"
            disabled={isStartingSession}
            onClick={handleStartOrdering}
            className="shrink-0 min-h-10 rounded-xl bg-orange-600 px-4 py-2 text-xs font-black text-white hover:bg-orange-700 active:bg-orange-800 disabled:opacity-50 cursor-pointer shadow-xs transition"
          >
            {isStartingSession ? t.startingOrder : t.startOrdering}
          </button>
        </div>
        {startSessionError && (
          <p role="alert" className="mt-2 text-xs font-semibold text-red-700 dark:text-red-400">{startSessionError}</p>
        )}
      </section>
    );
  }

  if (menuState === "ordering_active") {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3.5 shadow-xs dark:border-emerald-900/50 dark:bg-emerald-950/20" aria-labelledby="status-card-title">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="status-card-title" className="text-xs font-black text-emerald-950 dark:text-emerald-300">
                {t.orderingActiveTitle}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {t.activeBadge}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-emerald-900 dark:text-emerald-400">
              {t.orderingActiveDesc.replace("{table}", tableNumber)}
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (menuState === "join_required") {
    return (
      <section className="rounded-2xl border border-orange-200 bg-orange-50/80 p-4 shadow-xs dark:border-orange-900/50 dark:bg-orange-950/20" aria-labelledby="join-table-title">
        <h2 id="join-table-title" className="text-sm font-black text-[var(--omlu-text-primary)]">
          {t.tableActiveTitle.replace("{table}", tableNumber)}
        </h2>
        <p className="mt-0.5 text-xs text-[var(--omlu-text-secondary)]">
          {t.joinCodePrompt}
        </p>
        <div className="mt-3 flex gap-2">
          <input
            id="join-code-input"
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            autoComplete="one-time-code"
            aria-label="4-digit table join code"
            className="min-w-0 flex-1 rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-4 py-2 text-center text-base font-black tracking-[0.35em] text-[var(--omlu-text-primary)] outline-none focus:ring-2 focus:ring-orange-600"
          />
          <button
            type="button"
            disabled={joining || joinCode.length !== 4}
            onClick={handleJoinTable}
            className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-black text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-[var(--omlu-muted-surface)] disabled:text-[var(--omlu-text-secondary)] transition shadow-xs cursor-pointer"
          >
            {joining ? t.joiningTable : t.joinTable}
          </button>
        </div>
        {joinError && <p role="alert" className="mt-2 text-xs font-semibold text-red-700 dark:text-red-400">{joinError}</p>}
      </section>
    );
  }

  if (menuState === "bill_requested") {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-xs dark:border-amber-900/50 dark:bg-amber-950/20" aria-labelledby="status-card-title">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 id="status-card-title" className="text-sm font-black text-amber-950 dark:text-amber-200">
              {t.billRequestedTitle}
            </h2>
            <p className="mt-0.5 text-xs text-amber-900 dark:text-amber-300">
              {t.billRequestedDesc}
            </p>
          </div>
          {sessionToken && (
            <button
              type="button"
              onClick={() => router.push(`/session/${sessionToken}`)}
              className="shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white hover:bg-amber-700 cursor-pointer shadow-xs transition"
            >
              {t.viewBill}
            </button>
          )}
        </div>
      </section>
    );
  }

  if (menuState === "payment_pending") {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-xs dark:border-amber-900/50 dark:bg-amber-950/20" aria-labelledby="status-card-title">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 id="status-card-title" className="text-sm font-black text-amber-950 dark:text-amber-200">
              {t.paymentPendingTitle}
            </h2>
            <p className="mt-0.5 text-xs text-amber-900 dark:text-amber-300">
              {t.paymentPendingDesc}
            </p>
          </div>
          {sessionToken && (
            <button
              type="button"
              onClick={() => router.push(`/session/${sessionToken}`)}
              className="shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white hover:bg-amber-700 cursor-pointer shadow-xs transition"
            >
              {t.viewBill}
            </button>
          )}
        </div>
      </section>
    );
  }

  if (menuState === "completed") {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-xs dark:border-emerald-900/50 dark:bg-emerald-950/20" aria-labelledby="status-card-title">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 id="status-card-title" className="text-sm font-black text-emerald-950 dark:text-emerald-200">
              {t.orderCompletedTitle}
            </h2>
            <p className="mt-0.5 text-xs text-emerald-900 dark:text-emerald-300">
              {t.orderCompletedDesc}
            </p>
          </div>
          {sessionToken && (
            <button
              type="button"
              onClick={() => router.push(`/session/${sessionToken}`)}
              className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700 cursor-pointer shadow-xs transition"
            >
              {t.viewReceipt}
            </button>
          )}
        </div>
      </section>
    );
  }

  if (menuState === "expired") {
    return (
      <section className="rounded-2xl border border-red-200 bg-red-50/80 p-4 shadow-xs dark:border-red-900/50 dark:bg-red-950/20" aria-labelledby="status-card-title">
        <div>
          <h2 id="status-card-title" className="text-sm font-black text-red-950 dark:text-red-200">
            {t.expiredTitle}
          </h2>
          <p className="mt-0.5 text-xs text-red-900 dark:text-red-300">
            {t.expiredDesc}
          </p>
        </div>
      </section>
    );
  }

  return null;
}

function ActiveMenuClient({
  restaurantSlug,
  tableCode,
}: MenuClientProps) {
  const router = useRouter();

  // Client-side states
  const [menuData, setMenuData] = useState<PublicMenuResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<"en" | "ml">("en");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  
  // Cart & notes states
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [customerNote, setCustomerNote] = useState<string>("");
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>("");
  const [customisingItem, setCustomisingItem] = useState<MenuItem | null>(null);
  const [draftOptions, setDraftOptions] = useState<Record<number, Record<number, number>>>({});
  
  // Order submission & session states
  const [isPlacingOrder, setIsPlacingOrder] = useState<boolean>(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [currentSession, setCurrentSession] =
    useState<PublicDiningSessionResponse | null>(null);
  const [sessionLoading, setSessionLoading] = useState<boolean>(false);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [sessionCompleteNotice, setSessionCompleteNotice] = useState<string | null>(null);
  const [expiredSessionNotice, setExpiredSessionNotice] = useState<string | null>(null);
  const [participantToken, setParticipantToken] = useState<string | null>(null);
  const [tableOccupied, setTableOccupied] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !currentSession?.public_token) return;
    window.history.replaceState(
      {
        ...window.history.state,
        omluCustomerSessionToken: currentSession.public_token,
      },
      "",
      window.location.href
    );
  }, [currentSession?.public_token]);

  // Fetch menu data
  const fetchMenu = useCallback(async (showInitialLoader = false) => {
    if (showInitialLoader) setLoading(true);
    setError(null);
    try {
      const data = await getPublicMenu(restaurantSlug, tableCode);
      setMenuData(data);
      setActiveCategory((current) =>
        current && data.categories.some((category) => category.id === current)
          ? current
          : data.categories[0]?.id ?? null
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Could not connect to the backend server.");
      }
    } finally {
      if (showInitialLoader) setLoading(false);
    }
  }, [restaurantSlug, tableCode]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchMenu(true);
      const storageKey = `omlu:order-draft:${restaurantSlug}:${tableCode}`;
      const key = localStorage.getItem(storageKey) || crypto.randomUUID();
      localStorage.setItem(storageKey, key);
      setIdempotencyKey(key);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [fetchMenu, restaurantSlug, tableCode]);

  useEffect(() => {
    const timeout = window.setTimeout(async () => {
      try {
        const status = await getTableSessionStatus(restaurantSlug, tableCode);
        setTableOccupied(status.occupied);
      } catch {
        // Menu browsing remains available if occupancy status cannot be loaded.
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [restaurantSlug, tableCode]);

  useRealtime({
    target: { kind: "menu", restaurantSlug, tableCode },
    onEvent: () => void fetchMenu(false),
    onReconnect: () => void fetchMenu(false),
  });

  useEffect(() => {
    if (!isCartOpen && !customisingItem) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || isPlacingOrder) return;
      if (customisingItem) {
        setCustomisingItem(null);
        setDraftOptions({});
      } else {
        setIsCartOpen(false);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [customisingItem, isCartOpen, isPlacingOrder]);

  const clearOrderingState = useCallback(() => {
    setCurrentSession(null);
    setCart({});
    setCustomerNote("");
    setIsCartOpen(false);
    setCheckoutError(null);
    setCustomisingItem(null);
    setDraftOptions({});
  }, []);

  const removeSessionQueryParam = useCallback(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("session")) return;
    url.searchParams.delete("session");
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, []);

  const validateSavedSession = useCallback(async (
    options: { clearCachedStateFirst?: boolean } = {}
  ) => {
    const queryToken = new URLSearchParams(window.location.search).get("session");
    const detached = queryToken ? readDetachedSession(queryToken) : null;
    if (detached) {
      clearOrderingState();
      setParticipantToken(null);
      router.replace(detachedBillPath(detached));
      return;
    }
    const savedToken = readPublicSessionToken(restaurantSlug, tableCode);
    let savedParticipantToken = readParticipantToken(restaurantSlug, tableCode);

    setSessionLoading(true);
    clearLegacyPublicReceiptToken(restaurantSlug, tableCode);
    if (options.clearCachedStateFirst) {
      clearOrderingState();
      setSessionCompleteNotice(null);
      setExpiredSessionNotice(null);
      setSessionNotice(null);
    }

    let tokenToValidate = queryToken || savedToken;

    if (!savedParticipantToken && tokenToValidate) {
      savedParticipantToken = readSessionParticipantToken(tokenToValidate);
      if (savedParticipantToken) {
        saveParticipantToken(restaurantSlug, tableCode, savedParticipantToken);
      }
    }

    if (!tokenToValidate && savedParticipantToken) {
      try {
        const active = await getActivePublicDiningSession(restaurantSlug, tableCode);
        if (active?.public_token) {
          tokenToValidate = active.public_token;
          savePublicSessionToken(restaurantSlug, tableCode, tokenToValidate);
          saveSessionParticipantToken(tokenToValidate, savedParticipantToken);
        }
      } catch {}
    }

    if (!savedParticipantToken && tokenToValidate) {
      savedParticipantToken = readSessionParticipantToken(tokenToValidate);
      if (savedParticipantToken) {
        saveParticipantToken(restaurantSlug, tableCode, savedParticipantToken);
      }
    }

    if (!tokenToValidate || !savedParticipantToken) {
      clearOrderingState();
      setSessionCompleteNotice(null);
      setExpiredSessionNotice(null);
      setSessionNotice(null);
      setSessionLoading(false);
      return;
    }

    try {
      const session = await getPublicDiningSession(tokenToValidate, savedParticipantToken);
      const belongsToThisTable =
        session.restaurant_slug === restaurantSlug &&
        session.table_code === tableCode;

      if (!belongsToThisTable) {
        clearPublicSessionToken(restaurantSlug, tableCode);
        clearOrderingState();
        setSessionCompleteNotice(null);
        if (queryToken) {
          removeSessionQueryParam();
          setExpiredSessionNotice("This table session link is no longer valid. Scan the table QR again to start a new order.");
          setSessionNotice(null);
        } else {
          setExpiredSessionNotice(null);
          setSessionNotice(null);
        }
        return;
      }

      if (["closed", "cancelled"].includes(session.status)) {
        clearPublicSessionToken(restaurantSlug, tableCode);
        clearLegacyPublicReceiptToken(restaurantSlug, tableCode);
        clearOrderingState();
        removeSessionQueryParam();
        setSessionCompleteNotice(queryToken ? "complete" : null);
        setExpiredSessionNotice(queryToken ? null : null);
        setSessionNotice(null);
        return;
      }

      savePublicSessionToken(restaurantSlug, tableCode, session.public_token);
      saveParticipantToken(restaurantSlug, tableCode, savedParticipantToken);
      saveSessionParticipantToken(session.public_token, savedParticipantToken);
      setParticipantToken(savedParticipantToken);
      setTableOccupied(true);
      clearLegacyPublicReceiptToken(restaurantSlug, tableCode);
      setSessionCompleteNotice(null);
      setExpiredSessionNotice(null);
      setCurrentSession(session);
      setSessionNotice(
        session.status === "open"
          ? null
          : "This table session is no longer open. New ordering is disabled."
      );
    } catch (err) {
      if (isDefiniteAuthFailure(err)) {
        clearPublicSessionToken(restaurantSlug, tableCode);
        clearParticipantToken(restaurantSlug, tableCode);
        setParticipantToken(null);
        clearLegacyPublicReceiptToken(restaurantSlug, tableCode);
        clearOrderingState();
        setSessionCompleteNotice(null);
        if (queryToken) {
          removeSessionQueryParam();
          setExpiredSessionNotice("This table session link is no longer valid. Scan the table QR again to start a new order.");
          setSessionNotice(null);
        } else {
          setExpiredSessionNotice(null);
          setSessionNotice(null);
        }
      } else {
        // Temporary network/server error or timeout:
        // Do NOT clear participantToken or public session tokens!
        setSessionNotice("Connection issue. Retrying table session status...");
      }
    } finally {
      setSessionLoading(false);
    }
  }, [clearOrderingState, removeSessionQueryParam, restaurantSlug, router, tableCode]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void validateSavedSession(), 0);
    return () => window.clearTimeout(timeout);
  }, [validateSavedSession]);

  useRealtime({
    enabled: Boolean(participantToken && currentSession),
    target: {
      kind: "session",
      token: currentSession?.public_token || "",
      participantToken: participantToken || undefined,
    },
    onEvent: () => void validateSavedSession(),
    onReconnect: () => void validateSavedSession(),
  });

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      void validateSavedSession({ clearCachedStateFirst: true });
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, [validateSavedSession]);

  useEffect(() => {
    const enforceCompletedHistory = () => {
      const completed = readCompletedTable(restaurantSlug, tableCode);
      if (!completed) return;
      clearOrderingState();
      setParticipantToken(null);
      router.replace(completionPath(completed.sessionToken));
    };
    enforceCompletedHistory();
    const handlePageShow = (event: PageTransitionEvent) => { if (event.persisted) enforceCompletedHistory(); };
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("popstate", enforceCompletedHistory);
    window.addEventListener("focus", enforceCompletedHistory);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("popstate", enforceCompletedHistory);
      window.removeEventListener("focus", enforceCompletedHistory);
    };
  }, [clearOrderingState, restaurantSlug, router, tableCode]);

  useEffect(() => {
    const enforceDetachedHistory = () => {
      const queryToken = new URLSearchParams(window.location.search).get("session");
      const detached = queryToken ? readDetachedSession(queryToken) : null;
      if (!detached) return;
      clearOrderingState();
      setParticipantToken(null);
      router.replace(detachedBillPath(detached));
    };
    enforceDetachedHistory();
    window.addEventListener("pageshow", enforceDetachedHistory);
    window.addEventListener("popstate", enforceDetachedHistory);
    window.addEventListener("focus", enforceDetachedHistory);
    return () => {
      window.removeEventListener("pageshow", enforceDetachedHistory);
      window.removeEventListener("popstate", enforceDetachedHistory);
      window.removeEventListener("focus", enforceDetachedHistory);
    };
  }, [clearOrderingState, router]);

  // Local translations for UI labels
  const translations = {
    en: {
      dineIn: "Dine-in",
      searchPlaceholder: "Search food and drinks...",
      cart: "Cart",
      subtotal: "Subtotal",
      item: "item",
      items: "items",
      add: "Add",
      noItems: "No items found matching your search",
      table: "Table",
      retry: "Retry",
      connectionError: "Could not load the menu. Please check your connection.",
      loadingText: "Loading menu...",
      viewCart: "View Cart",
      reviewCart: "Review cart",
      viewCurrentOrder: "View current order",
      placeOrder: "Place Order",
      submitting: "Placing Order...",
      customerNote: "Add general instructions / note for kitchen...",
      itemNotePlaceholder: "Instructions (e.g. Less spicy)",
      checkoutErrorTitle: "Checkout Error",
      close: "Back to Menu",
      yourCart: "Your Cart",
      emptyCartMsg: "Your cart is empty",
      checkoutFailed: "Checkout failed. Please try again.",
      currentBill: "Current bill",
      previousOrders: "previous orders",
      billLocked: "Ordering is currently locked for this table session.",
      checkingSession: "Checking current table bill...",
      viewFullBill: "View full table bill",
      viewFinalReceipt: "View final bill",
      sessionComplete: "Your dining session is complete. Scan the table QR again to start a new order.",
      clearSearch: "Clear search",
      unavailable: "Unavailable",
      choose: "Choose",
      chooseOptions: "Choose options",
      from: "From",
      closeOptions: "Close options",
      required: "Required",
      optional: "Optional",
      chooseOne: "Choose one",
      chooseMultiple: "Choose multiple",
      included: "Included",
      total: "Total",
      selectToContinue: "Select the required choices to continue.",
      chooseYour: "Choose your",
      readyToOrderTitle: "Ready to order",
      readyToOrderDesc: "Start an order for Table {table} to add items and send them to the restaurant.",
      startOrdering: "Start ordering",
      startingOrder: "Starting order…",
      orderingActiveTitle: "Ordering active",
      orderingActiveDesc: "Ordering for Table {table}. Add items below and review your cart when ready.",
      activeBadge: "Active",
      tableActiveTitle: "Table {table} · Table already active",
      joinCodePrompt: "Enter the join code provided by someone at the table.",
      joinTable: "Join table",
      joiningTable: "Joining…",
      billRequestedTitle: "Bill requested",
      billRequestedDesc: "New items cannot be added while the restaurant prepares your bill.",
      paymentPendingTitle: "Payment pending",
      paymentPendingDesc: "Your table has been released. Show your payment code at the counter.",
      viewBill: "View bill",
      orderCompletedTitle: "Order completed",
      orderCompletedDesc: "This table session has ended.",
      viewReceipt: "View receipt",
      expiredTitle: "Table session expired",
      expiredDesc: "Your table session link is no longer valid. Scan the table QR again to start a new order.",
    },
    ml: {
      dineIn: "ഡൈൻ-ഇൻ",
      searchPlaceholder: "ഭക്ഷണങ്ങളും പാനീയങ്ങളും തിരയുക...",
      cart: "കാർട്ട്",
      subtotal: "ആകെ തുക",
      item: "ഇനം",
      items: "ഇനങ്ങൾ",
      add: "ചേർക്കുക",
      noItems: "തിരച്ചിലിന് അനുയോമായ വിഭവങ്ങൾ ഒന്നും കണ്ടെത്തിയില്ല",
      table: "മേശ",
      retry: "വീണ്ടും ശ്രമിക്കുക",
      connectionError: "മെനു ലോഡ് ചെയ്യാൻ കഴിഞ്ഞില്ല. ദയവായി കണക്ഷൻ പരിശോധിക്കുക.",
      loadingText: "മെനു ലോഡ് ചെയ്യുന്നു...",
      viewCart: "കാർട്ട് കാണുക",
      reviewCart: "കാർട്ട് റിവ്യൂ ചെയ്യുക",
      viewCurrentOrder: "നിലവിലെ ഓർഡർ കാണുക",
      placeOrder: "ഓർഡർ ചെയ്യുക",
      submitting: "ഓർഡർ ചെയ്യുന്നു...",
      customerNote: "പ്രത്യേക നിർദ്ദേശങ്ങൾ ഇവിടെ എഴുതുക...",
      itemNotePlaceholder: "നിർദ്ദേശങ്ങൾ (ഉദാ: മസാല കുറയ്ക്കണം)",
      checkoutErrorTitle: "ഓർഡർ ചെയ്യുന്നതിൽ പിശക്",
      close: "തിരികെ മെനുവിലേക്ക്",
      yourCart: "നിങ്ങളുടെ കാർട്ട്",
      emptyCartMsg: "കാർട്ടിൽ വിഭവങ്ങൾ ഒന്നുമില്ല",
      checkoutFailed: "ഓർഡർ സബ്മിറ്റ് ചെയ്യാൻ സാധിച്ചില്ല. വീണ്ടും ശ്രമിക്കുക.",
      currentBill: "നിലവിലെ ബിൽ",
      previousOrders: "മുൻ ഓർഡറുകൾ",
      billLocked: "ഈ മേശയിലെ സെഷനിൽ പുതിയ ഓർഡർ ഇപ്പോൾ ലോക്ക് ചെയ്തിരിക്കുന്നു.",
      checkingSession: "നിലവിലെ ടേബിൾ ബിൽ പരിശോധിക്കുന്നു...",
      viewFullBill: "മുഴുവൻ ടേബിൾ ബിൽ കാണുക",
      viewFinalReceipt: "അവസാന ബിൽ കാണുക",
      sessionComplete: "നിങ്ങളുടെ ഡൈനിംഗ് സെഷൻ പൂർത്തിയായി. പുതിയ ഓർഡർ തുടങ്ങാൻ ടേബിൾ QR വീണ്ടും സ്കാൻ ചെയ്യുക.",
      clearSearch: "തിരച്ചിൽ മായ്ക്കുക",
      unavailable: "ലഭ്യമല്ല",
      choose: "തിരഞ്ഞെടുക്കുക",
      chooseOptions: "ഓപ്ഷനുകൾ തിരഞ്ഞെടുക്കുക",
      from: "മുതൽ",
      closeOptions: "ഓപ്ഷനുകൾ അടയ്ക്കുക",
      required: "നിർബന്ധം",
      optional: "ഐച്ഛികം",
      chooseOne: "ഒന്ന് തിരഞ്ഞെടുക്കുക",
      chooseMultiple: "ഒന്നിലധികം തിരഞ്ഞെടുക്കുക",
      included: "വിലയിൽ ഉൾപ്പെടുന്നു",
      total: "ആകെ",
      selectToContinue: "തുടരാൻ ആവശ്യമായ ഓപ്ഷനുകൾ തിരഞ്ഞെടുക്കുക.",
      chooseYour: "തിരഞ്ഞെടുക്കുക:",
      readyToOrderTitle: "ഓർഡർ ചെയ്യാൻ തയ്യാറാണ്",
      readyToOrderDesc: "വിഭവങ്ങൾ ചേർത്ത് റെസ്റ്റോറന്റിലേക്ക് അയക്കാൻ Table {table}-നായി ഓർഡർ ആരംഭിക്കുക.",
      startOrdering: "ഓർഡർ ആരംഭിക്കുക",
      startingOrder: "ആരംഭിക്കുന്നു…",
      orderingActiveTitle: "ഓർഡറിംഗ് സജീവമാണ്",
      orderingActiveDesc: "Table {table}-ലേക്ക് വിഭവങ്ങൾ തിരഞ്ഞെടുത്ത് കാർട്ടിൽ റിവ്യൂ ചെയ്യുക.",
      activeBadge: "സജീവം",
      tableActiveTitle: "Table {table}-ൽ നിലവിൽ ഓർഡർ ആരംഭിച്ചിട്ടുണ്ട്",
      joinCodePrompt: "മേശയിലുള്ള ആരോടെങ്കിലും ചോദിച്ച് 4 അക്ക കോഡ് നൽകുക.",
      joinTable: "ടേബിളിൽ ചേരുക",
      joiningTable: "ചേരുന്നു…",
      billRequestedTitle: "ബിൽ ആവശ്യപ്പെട്ടു",
      billRequestedDesc: "ബിൽ തയാറാക്കുമ്പോൾ പുതിയ ഓർഡറുകൾ നൽകാൻ കഴിയില്ല.",
      paymentPendingTitle: "പണമടയ്ക്കൽ ബാക്കി",
      paymentPendingDesc: "മേശ ഒഴിവാക്കി. കൗണ്ടറിൽ പേയ്മെന്റ് കോഡ് കാണിക്കുക.",
      viewBill: "ബിൽ കാണുക",
      orderCompletedTitle: "ഓർഡർ പൂർത്തിയായി",
      orderCompletedDesc: "ഈ ടേബിൾ സെഷൻ അവസാനിച്ചു.",
      viewReceipt: "രസീത് കാണുക",
      expiredTitle: "സെഷൻ കാലാവധി കഴിഞ്ഞു",
      expiredDesc: "ലിങ്ക് അസാധുവാണ്. പുതിയ ഓർഡറിനായി QR വീണ്ടും സ്കാൻ ചെയ്യുക.",
    },
  };

  const t = translations[language];

  // Derive single customer menu state
  const getCustomerMenuState = (): CustomerMenuState => {
    if (expiredSessionNotice) return "expired";
    if (sessionCompleteNotice || (currentSession && ["closed", "paid", "cancelled"].includes(currentSession.status))) return "completed";
    if (currentSession?.status === "payment_requested") return "bill_requested";
    if (currentSession && ["payment_pending", "detached_awaiting_payment"].includes(currentSession.status)) return "payment_pending";
    if (currentSession?.status === "open" && participantToken) return "ordering_active";
    if (tableOccupied && !participantToken) return "join_required";
    return "ready";
  };

  const menuState = getCustomerMenuState();
  const orderingDisabled = ["bill_requested", "payment_pending", "completed", "expired"].includes(menuState);

  // Helper: Get localized text with English fallback
  const getLocalizedText = (enVal: string, mlVal: string | null) => {
    if (language === "ml" && mlVal && mlVal.trim() !== "") {
      return mlVal;
    }
    return enVal;
  };

  // Cart operations
  const optionKey = (itemId: number, options: SelectedOptionRequest[]) =>
    `${itemId}:${options
      .map((option) => `${option.group_id}-${option.option_id}-${option.quantity}`)
      .sort()
      .join("|")}`;

  const selectedOptionsFromDraft = (): SelectedOptionRequest[] =>
    Object.entries(draftOptions).flatMap(([groupId, options]) =>
      Object.entries(options)
        .filter(([, quantity]) => quantity > 0)
        .map(([optionId, quantity]) => ({
          group_id: Number(groupId),
          option_id: Number(optionId),
          quantity,
        }))
    );

  const addLineToCart = (item: MenuItem, selectedOptions: SelectedOptionRequest[] = []) => {
    const key = optionKey(item.id, selectedOptions);
    setCart((prev) => ({
      ...prev,
      [key]: prev[key]
        ? { ...prev[key], quantity: prev[key].quantity + 1 }
        : { key, menu_item_id: item.id, quantity: 1, item_note: "", selected_options: selectedOptions },
    }));
  };

  const addToCart = (item: MenuItem) => {
    if ((item.option_groups || []).length > 0) {
      setDraftOptions({});
      setCustomisingItem(item);
      return;
    }
    addLineToCart(item);
  };

  const incrementQty = (lineKey: string) => {
    setCart((prev) => ({
      ...prev,
      [lineKey]: { ...prev[lineKey], quantity: (prev[lineKey]?.quantity || 0) + 1 },
    }));
  };

  const decrementQty = (lineKey: string) => {
    setCart((prev) => {
      const currentQty = prev[lineKey]?.quantity || 0;
      if (currentQty <= 1) {
        const newCart = { ...prev };
        delete newCart[lineKey];
        return newCart;
      }
      return {
        ...prev,
        [lineKey]: { ...prev[lineKey], quantity: currentQty - 1 },
      };
    });
  };

  const removeItem = (lineKey: string) => {
    setCart((prev) => {
      const newCart = { ...prev };
      delete newCart[lineKey];
      return newCart;
    });
  };

  const handleItemNoteChange = (lineKey: string, note: string) => {
    setCart((prev) => ({
      ...prev,
      [lineKey]: { ...prev[lineKey], item_note: note },
    }));
  };

  const toggleDraftOption = (groupId: number, optionId: number, multi: boolean) => {
    setDraftOptions((prev) => {
      const current = prev[groupId] || {};
      const selected = Boolean(current[optionId]);
      if (!multi) {
        return { ...prev, [groupId]: selected ? {} : { [optionId]: 1 } };
      }
      const nextGroup = { ...current };
      if (selected) delete nextGroup[optionId];
      else nextGroup[optionId] = 1;
      return { ...prev, [groupId]: nextGroup };
    });
  };

  // Search filtering
  const filterItems = (items: MenuItem[]) => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter((item) => {
      const nameEn = item.name_en.toLowerCase();
      const nameMl = (item.name_ml || "").toLowerCase();
      const descEn = (item.description_en || "").toLowerCase();
      const descMl = (item.description_ml || "").toLowerCase();
      return (
        nameEn.includes(query) ||
        nameMl.includes(query) ||
        descEn.includes(query) ||
        descMl.includes(query)
      );
    });
  };

  // Order submission
  const handlePlaceOrder = async () => {
    if (isPlacingOrder) return;
    setIsPlacingOrder(true);
    setCheckoutError(null);

    const orderItemsPayload: OrderItemRequest[] = Object.values(cart).map((line) => ({
      menu_item_id: line.menu_item_id,
      quantity: line.quantity,
      item_note: line.item_note.trim() || null,
      selected_options: line.selected_options,
    }));

    const payload = {
      items: orderItemsPayload,
      customer_note: customerNote.trim() || null,
    };

    try {
      if (currentSession && currentSession.status !== "open") {
        throw new ApiError(409, t.billLocked);
      }

      let activeParticipantToken = participantToken;
      let activeSession = currentSession;
      if (!activeSession && !tableOccupied) {
        const authority = await createFirstTableOrder(
          restaurantSlug,
          tableCode,
          payload,
          idempotencyKey,
        );
        activeParticipantToken = authority.participant_token;
        activeSession = authority.session;
        saveParticipantToken(restaurantSlug, tableCode, authority.participant_token);
        saveSessionParticipantToken(authority.session.public_token, authority.participant_token);
        savePublicSessionToken(restaurantSlug, tableCode, authority.session.public_token);
        setParticipantToken(authority.participant_token);
        setCurrentSession(authority.session);
        setTableOccupied(true);
      } else if (!activeParticipantToken || !activeSession) {
        throw new ApiError(401, "Enter the table’s 4-digit join code to order with this group.");
      }
      const sessionResponse = activeSession.order_count === 1 && !currentSession
        ? activeSession
        : activeSession.status === "open"
        ? await addOrderToDiningSession(
            activeSession.public_token,
            payload,
            idempotencyKey,
            activeParticipantToken,
          )
        : null;

      const sessionToken = sessionResponse?.public_token;

      if (!sessionToken) {
        throw new ApiError(500, "Order was placed, but no table session was returned.");
      }

      savePublicSessionToken(restaurantSlug, tableCode, sessionToken);
      
      // Order placed successfully! Clear cart & redirect
      setCart({});
      setCustomerNote("");
      setIsCartOpen(false);
      const nextKey = crypto.randomUUID();
      localStorage.setItem(`omlu:order-draft:${restaurantSlug}:${tableCode}`, nextKey);
      setIdempotencyKey(nextKey);
      
      router.replace(`/session/${sessionToken}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) setTableOccupied(true);
        setCheckoutError(err.message);
      } else {
        setCheckoutError(t.checkoutFailed);
      }
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const handleJoinTable = async () => {
    if (joining || !/^\d{4}$/.test(joinCode)) return;
    setJoining(true);
    setJoinError(null);
    try {
      const authority = await joinSecureTableSession(restaurantSlug, tableCode, joinCode);
      const sessionToken = authority.session.public_token;
      saveParticipantToken(restaurantSlug, tableCode, authority.participant_token);
      savePublicSessionToken(restaurantSlug, tableCode, sessionToken);
      saveSessionParticipantToken(sessionToken, authority.participant_token);
      setParticipantToken(authority.participant_token);
      const session = await getPublicDiningSession(sessionToken, authority.participant_token);
      setCurrentSession(session);
      setJoinCode("");
    } catch (err) {
      setJoinError(err instanceof ApiError ? err.message : "Could not join this table.");
    } finally {
      setJoining(false);
    }
  };

  // Render Loading State
  if (loading && !menuData) {
    return (
      <div className="min-h-screen bg-[var(--omlu-muted-surface)] px-4 py-5 dark:bg-[var(--omlu-page-background)]" aria-busy="true" aria-label={t.loadingText}>
        <div className="mx-auto max-w-3xl sm:max-w-4xl animate-pulse">
          <div className="h-16 rounded-2xl bg-[var(--omlu-primary-surface)]" />
          <div className="mt-4 h-12 rounded-2xl bg-[var(--omlu-muted-surface)]" />
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="h-32 rounded-2xl bg-[var(--omlu-primary-surface)]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Render Error State
  if (error && !menuData) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-[var(--omlu-muted-surface)] dark:bg-[var(--omlu-page-background)] p-6 text-center">
        <div className="max-w-md bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border-strong)] dark:border-[var(--omlu-border)] rounded-2xl p-8 shadow-sm">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-[var(--omlu-text-primary)] mb-2">
            {error === "Restaurant not found" ||
            error === "Restaurant is inactive" ||
            error === "Table not found" ||
            error === "Table is inactive"
              ? error
              : t.connectionError}
          </h2>
          <button
            onClick={() => void fetchMenu(true)}
            className="mt-6 px-6 py-2.5 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-[var(--omlu-primary-action-text)] font-semibold rounded-xl transition shadow-sm cursor-pointer"
          >
            {t.retry}
          </button>
        </div>
      </div>
    );
  }

  if (!menuData) return null;

  const { restaurant, table, categories } = menuData;

  // Compute category structures matching search query
  const displayCategories = categories
    .map((category) => {
      const matchedItems = filterItems(category.items);
      return {
        ...category,
        items: matchedItems,
      };
    })
    .filter((category) => category.items.length > 0);
  const visibleCategories = searchQuery.trim()
    ? displayCategories
    : displayCategories.filter((category) => category.id === activeCategory);

  // Cart total calculations
  const allItemsMap: Record<number, MenuItem> = {};
  categories.forEach((cat) => {
    cat.items.forEach((item) => {
      allItemsMap[item.id] = item;
    });
  });

  let totalQty = 0;
  let subtotal = 0;
  const optionPrice = (item: MenuItem, selectedOptions: SelectedOptionRequest[]) => {
    const groups = item.option_groups || [];
    const variant = selectedOptions
      .map((selection) => groups.find((group) => group.id === selection.group_id)?.options.find((option) => option.id === selection.option_id))
      .find((option) => option && groups.find((group) => group.id === option.group_id)?.type === "variant");
    const addons = selectedOptions.reduce((sum, selection) => {
      const group = groups.find((candidate) => candidate.id === selection.group_id);
      const option = group?.options.find((candidate) => candidate.id === selection.option_id);
      if (!group || !option || group.type !== "addon") return sum;
      return sum + Number(option.price_delta) * selection.quantity;
    }, 0);
    return (variant ? Number(variant.price_delta) : Number(item.price)) + addons;
  };

  const menuPriceLabel = (item: MenuItem) => {
    const requiredVariantPrices = (item.option_groups || [])
      .filter((group) => group.type === "variant" && group.required)
      .flatMap((group) => group.options.filter((option) => option.available).map((option) => Number(option.price_delta)))
      .filter((price) => Number.isFinite(price));
    if (requiredVariantPrices.length > 0) {
      const minPrice = Math.min(...requiredVariantPrices);
      const maxPrice = Math.max(...requiredVariantPrices);
      if (minPrice !== maxPrice) {
        return `${t.from} ₹${minPrice.toFixed(2)}`;
      }
    }
    return `₹${Number(item.price).toFixed(2)}`;
  };

  const selectedOptionLabels = (item: MenuItem, selectedOptions: SelectedOptionRequest[]) => {
    const groups = item.option_groups || [];
    return selectedOptions.flatMap((selection) => {
      const group = groups.find((candidate) => candidate.id === selection.group_id);
      const option = group?.options.find((candidate) => candidate.id === selection.option_id);
      return option ? [`${group?.name}: ${option.name}${selection.quantity > 1 ? ` x${selection.quantity}` : ""}`] : [];
    });
  };

  const hasRequiredSelections = (item: MenuItem, selectedOptions: SelectedOptionRequest[]) => {
    return (item.option_groups || []).every((group) => {
      const count = selectedOptions
        .filter((selection) => selection.group_id === group.id)
        .reduce((sum, selection) => sum + selection.quantity, 0);
      const min = Math.max(group.minimum_selections, group.required ? 1 : 0);
      return count >= min && (!group.maximum_selections || count <= group.maximum_selections);
    });
  };

  const draftSelectedOptions = selectedOptionsFromDraft();
  const customisationComplete = customisingItem
    ? hasRequiredSelections(customisingItem, draftSelectedOptions)
    : false;
  const missingRequiredGroup = customisingItem?.option_groups?.find((group) => {
    const selected = draftSelectedOptions
      .filter((option) => option.group_id === group.id)
      .reduce((sum, option) => sum + option.quantity, 0);
    return selected < Math.max(group.minimum_selections, group.required ? 1 : 0);
  });

  Object.values(cart).forEach((line) => {
    const item = allItemsMap[line.menu_item_id];
    if (item) {
      totalQty += line.quantity;
      subtotal += optionPrice(item, line.selected_options) * line.quantity;
    }
  });

  const formattedSubtotal = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(subtotal);

  // Scroll to Category Header
  const scrollToCategory = (categoryId: number) => {
    setActiveCategory(categoryId);
    const element = document.getElementById(`category-${categoryId}`);
    if (element) {
      const headerOffset = 140; // Approximate height of top sticky bars
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.scrollY - headerOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
    const tab = document.getElementById(`cat-tab-${categoryId}`);
    if (tab) {
      tab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  };

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-[var(--omlu-page-background)] pb-[calc(6.5rem+env(safe-area-inset-bottom))] text-[var(--omlu-text-primary)]">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-40 border-b border-[var(--omlu-border)] bg-[color:var(--omlu-primary-surface)]/95 px-3 py-2.5 backdrop-blur-md sm:px-6">
        <div className="mx-auto flex max-w-3xl sm:max-w-4xl items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-black leading-tight text-[var(--omlu-text-primary)] sm:text-base">
              {restaurant.name}
            </h1>
            <p className="truncate text-[11px] font-bold text-[var(--omlu-text-secondary)] sm:text-xs">
              {t.table} {table.table_number} · {t.dineIn}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              aria-label={`${t.cart}: ${totalQty} ${t.items}`}
              className="relative flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] px-2.5 py-1 text-xs font-bold text-[var(--omlu-text-primary)] hover:border-[var(--omlu-border-strong)] transition cursor-pointer"
            >
              <span>{t.cart}</span>
              {totalQty > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] font-black text-white">
                  {totalQty}
                </span>
              )}
            </button>
            <PublicThemeControl />
            <button
              type="button"
              onClick={() => setLanguage(language === "en" ? "ml" : "en")}
              aria-label={language === "en" ? "Switch to Malayalam" : "Switch to English"}
              className="flex min-h-9 items-center rounded-full border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] px-2.5 py-1 text-xs font-bold text-[var(--omlu-text-primary)] hover:border-[var(--omlu-border-strong)] transition cursor-pointer"
            >
              {language === "en" ? "മലയാളം" : "English"}
            </button>
          </div>
        </div>
      </header>

      {/* Floating search and category bar */}
      <div className="sticky top-[57px] z-30 border-b border-[var(--omlu-border)] bg-[color:var(--omlu-primary-surface)]/95 px-4 py-2.5 backdrop-blur-md sm:px-6">
        <div className="max-w-3xl sm:max-w-4xl mx-auto flex flex-col gap-3">
          {sessionLoading && (
            <div className="text-xs font-semibold text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900/40 rounded-xl px-3 py-2">
              {t.checkingSession}
            </div>
          )}

          {/* Authoritative Table Order Status Card */}
          <TableOrderStatusCard
            menuState={menuState}
            tableNumber={table.table_number}
            joinCode={joinCode}
            setJoinCode={setJoinCode}
            joining={joining}
            handleJoinTable={handleJoinTable}
            joinError={joinError}
            handleStartOrdering={() => setIsCartOpen(true)}
            isStartingSession={false}
            startSessionError={null}
            sessionToken={currentSession?.public_token}
            t={t}
            router={router}
          />

          {sessionNotice && menuState === "ordering_active" && (
            <div className="text-xs font-semibold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 rounded-xl px-3 py-2">
              {language === "en" ? sessionNotice : t.billLocked}
            </div>
          )}

          {!sessionCompleteNotice && !expiredSessionNotice && (
            <div className="relative">
              <label htmlFor="menu-search" className="sr-only">{t.searchPlaceholder}</label>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--omlu-text-secondary)]"><circle cx="11" cy="11" r="7" strokeWidth="2"/><path d="m16 16 4 4" strokeWidth="2" strokeLinecap="round"/></svg>
              <input
                id="menu-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="h-11 w-full rounded-xl border border-[var(--omlu-border)] bg-[var(--omlu-input-background)] py-2 pl-9 pr-9 text-xs sm:text-sm outline-none focus:ring-2 focus:ring-orange-600"
              />
              {searchQuery && <button type="button" onClick={() => setSearchQuery("")} aria-label={t.clearSearch} className="absolute right-0 top-0 flex h-11 w-9 items-center justify-center text-base text-[var(--omlu-text-secondary)] cursor-pointer">×</button>}
            </div>
          )}

          {/* Category Tabs */}
          {displayCategories.length > 0 && !sessionCompleteNotice && !expiredSessionNotice && (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
              {displayCategories.map((category) => (
                <button
                  key={category.id}
                  id={`cat-tab-${category.id}`}
                  onClick={() => scrollToCategory(category.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold whitespace-nowrap cursor-pointer transition ${
                    activeCategory === category.id
                      ? "bg-orange-600 text-white shadow-xs"
                      : "bg-[var(--omlu-muted-surface)] text-[var(--omlu-text-secondary)] hover:bg-[var(--omlu-border)]"
                  }`}
                >
                  {getLocalizedText(category.name_en, category.name_ml)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-3xl sm:max-w-4xl mx-auto px-4 mt-6 sm:px-6 w-full flex-1">
        {error && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200" role="alert">
            <span>Menu refresh failed. Your last loaded menu is still shown.</span>
            <button type="button" onClick={() => void fetchMenu(false)} className="rounded-xl bg-[var(--omlu-primary-surface)] px-4 py-2 font-black text-red-800 shadow-sm cursor-pointer dark:bg-[var(--omlu-primary-surface)] dark:text-red-200">
              {t.retry}
            </button>
          </div>
        )}
        {displayCategories.length === 0 && !sessionCompleteNotice && !expiredSessionNotice ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-[var(--omlu-text-secondary)] text-5xl mb-4">
              🍽️
            </div>
            <p className="text-[var(--omlu-text-secondary)] font-medium">
              {t.noItems}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {visibleCategories.map((category) => (
              <section
                key={category.id}
                id={`category-${category.id}`}
                className="scroll-mt-36"
              >
                <h2 className="sr-only">
                  {getLocalizedText(category.name_en, category.name_ml)}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {category.items.map((item) => {
                    const simpleKey = optionKey(item.id, []);
                    const cartQty = Object.values(cart)
                      .filter((line) => line.menu_item_id === item.id)
                      .reduce((sum, line) => sum + line.quantity, 0);
                    const isConfigurable = (item.option_groups || []).length > 0;
                    return (
                      <div
                        key={item.id}
                        className="flex min-h-[104px] gap-3 rounded-2xl border border-[var(--omlu-border)] bg-[var(--omlu-primary-surface)] p-4 shadow-xs hover:border-[var(--omlu-border-strong)] transition"
                      >
                        <div className="flex-1 flex flex-col justify-between min-w-0">
                          <div>
                            <h3 className="line-clamp-2 break-words font-bold leading-snug text-[var(--omlu-text-primary)]">
                              {getLocalizedText(item.name_en, item.name_ml)}
                            </h3>
                            {getLocalizedText(item.description_en || "", item.description_ml) && (
                              <p className="text-xs text-[var(--omlu-text-secondary)] mt-1 line-clamp-2">
                                {getLocalizedText(
                                  item.description_en || "",
                                  item.description_ml
                                )}
                              </p>
                            )}
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <span className="font-extrabold tabular-nums text-[var(--omlu-text-primary)] text-sm">
                              {menuPriceLabel(item)}
                            </span>
                            {orderingDisabled ? (
                              <span className="rounded-md border border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--omlu-text-secondary)]">
                                {t.unavailable}
                              </span>
                            ) : !item.is_available ? (
                              <span className="rounded-md border border-red-300 bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                                {t.unavailable}
                              </span>
                            ) : cartQty === 0 || isConfigurable ? (
                              <button
                                type="button"
                                onClick={() => void addToCart(item)}
                                className="min-h-10 rounded-xl bg-orange-600 px-3.5 text-xs font-bold text-white hover:bg-orange-700 cursor-pointer shadow-xs transition"
                              >
                                {isConfigurable ? t.chooseOptions : t.add}
                              </button>
                            ) : (
                              <div className="flex items-center border border-orange-600 rounded-lg overflow-hidden bg-orange-50/50 dark:bg-orange-950/10">
                                <button
                                  type="button"
                                  onClick={() => decrementQty(simpleKey)}
                                  className="px-2.5 py-1 text-orange-600 font-bold hover:bg-orange-600 hover:text-white transition cursor-pointer text-xs min-h-9 min-w-9"
                                >
                                  −
                                </button>
                                <span className="px-2 text-xs font-bold text-[var(--omlu-text-primary)]">
                                  {cartQty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => incrementQty(simpleKey)}
                                  className="px-2.5 py-1 text-orange-600 font-bold hover:bg-orange-600 hover:text-white transition cursor-pointer text-xs min-h-9 min-w-9"
                                >
                                  +
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        {item.image_url && (
                          <div className="relative w-20 h-20 bg-[var(--omlu-muted-surface)] rounded-lg overflow-hidden flex-shrink-0 self-center">
                            <Image
                              src={item.image_url}
                              alt={item.name_en}
                              fill
                              sizes="80px"
                              unoptimized
                              className="object-cover"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Sticky Bottom Cart Bar totalQty > 0 && !orderingDisabled */}
      {totalQty > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--omlu-border)] bg-[color:var(--omlu-primary-surface)]/95 px-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] pt-3 shadow-lg backdrop-blur-md sm:px-6">
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="mx-auto flex min-h-12 w-full max-w-4xl items-center justify-between rounded-2xl bg-orange-600 px-4 py-3 text-white font-bold shadow-md hover:bg-orange-700 transition cursor-pointer"
          >
            <div className="flex flex-col text-left">
              <span className="text-xs sm:text-sm font-bold">
                {totalQty} {totalQty === 1 ? t.item : t.items} · {formattedSubtotal}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-bold">
                {orderingDisabled ? t.viewCurrentOrder : t.reviewCart}
              </span>
            </div>
          </button>
        </div>
      )}

      {/* Option Customisation Modal */}
      {customisingItem && (
        <div className="fixed inset-0 z-50 flex items-end justify-center overscroll-contain bg-black/60 sm:items-center sm:p-4">
          <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-[var(--omlu-primary-surface)] shadow-2xl sm:max-h-[85vh] sm:rounded-3xl sm:border sm:border-[var(--omlu-border)]" role="dialog" aria-modal="true" aria-labelledby="menu-options-title" aria-describedby="menu-options-description">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--omlu-border)] px-5 py-4 sm:px-6">
              <div>
                <h2 id="menu-options-title" className="break-words text-xl font-black text-[var(--omlu-text-primary)]">
                  {getLocalizedText(customisingItem.name_en, customisingItem.name_ml)}
                </h2>
                <p id="menu-options-description" className="mt-1 text-sm text-[var(--omlu-text-secondary)]">
                  {language === "en"
                    ? `${t.chooseYour} ${(customisingItem.option_groups?.[0]?.name || "preferences").toLowerCase()}.`
                    : `${t.chooseYour} ${customisingItem.option_groups?.[0]?.name || "ഓപ്ഷനുകൾ"}.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCustomisingItem(null)}
                aria-label={t.closeOptions}
                className="grid min-h-11 min-w-11 place-items-center rounded-full bg-[var(--omlu-muted-surface)] text-xl font-bold text-[var(--omlu-text-secondary)] cursor-pointer"
              >
                ×
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4 sm:px-6">
              {(customisingItem.option_groups || []).map((group) => {
                const selectedCount = Object.values(draftOptions[group.id] || {}).reduce((sum, quantity) => sum + quantity, 0);
                const min = Math.max(group.minimum_selections, group.required ? 1 : 0);
                const max = group.maximum_selections;
                const multi = group.type === "addon" && max !== 1;
                return (
                  <fieldset key={group.id} className="min-w-0">
                    <legend className="sr-only">{group.name}</legend>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-base font-black text-[var(--omlu-text-primary)]">{group.name}</h3>
                        <p className="mt-0.5 text-xs font-semibold text-[var(--omlu-text-secondary)]">
                          {multi ? t.chooseMultiple : t.chooseOne} · {min > 0 ? t.required : t.optional}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {group.options.map((option) => {
                        const checked = Boolean(draftOptions[group.id]?.[option.id]);
                        const disabled = !option.available || (!checked && Boolean(max) && selectedCount >= max);
                        return (
                          <button
                            key={option.id}
                            disabled={disabled}
                            onClick={() => toggleDraftOption(group.id, option.id, multi)}
                            aria-pressed={checked}
                            className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-40 cursor-pointer ${
                              checked
                                ? "border-orange-500 bg-orange-50 text-orange-950 dark:border-orange-500 dark:bg-orange-950/40 dark:text-[var(--omlu-text-primary)]"
                                : "border-[var(--omlu-border-strong)] bg-[var(--omlu-muted-surface)] text-[var(--omlu-text-primary)] dark:border-[var(--omlu-border)] dark:bg-[var(--omlu-page-background)] dark:text-[var(--omlu-text-secondary)] hover:border-orange-300"
                            }`}
                          >
                            <span className="flex items-center gap-3 min-w-0">
                              <span
                                aria-hidden="true"
                                className={`flex h-5 w-5 shrink-0 items-center justify-center ${multi ? "rounded-md" : "rounded-full"} border-2 ${
                                  checked
                                    ? "border-orange-600 bg-orange-600 text-[10px] text-white"
                                    : "border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] text-transparent"
                                }`}
                              >
                                ✓
                              </span>
                              <span className="font-bold">{option.name}</span>
                            </span>
                            <span className="font-bold tabular-nums text-xs">
                              {Number(option.price_delta) === 0
                                ? t.included
                                : `${Number(option.price_delta) > 0 ? "+" : ""}₹${Math.abs(Number(option.price_delta)).toFixed(2)}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}
            </div>
            <div className="sticky bottom-0 border-t border-[var(--omlu-border)] bg-[var(--omlu-muted-surface)] px-5 py-4 sm:px-6">
              {missingRequiredGroup && (
                <p role="alert" className="mb-3 text-xs font-bold text-orange-700 dark:text-orange-400">
                  {language === "en" ? `Choose ${missingRequiredGroup.name.toLowerCase()} to continue.` : t.selectToContinue}
                </p>
              )}
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-bold text-[var(--omlu-text-primary)]">{t.total}</span>
                <span className="text-xl font-black tabular-nums text-[var(--omlu-text-primary)]">
                  {customisationComplete ? `₹${optionPrice(customisingItem, draftSelectedOptions).toFixed(2)}` : "—"}
                </span>
              </div>
              <button
                type="button"
                disabled={!customisationComplete}
                onClick={() => {
                  addLineToCart(customisingItem, draftSelectedOptions);
                  setCustomisingItem(null);
                  setDraftOptions({});
                }}
                className="min-h-14 w-full rounded-2xl bg-orange-600 px-5 py-3.5 text-base font-black text-white shadow-md disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                Add to cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-over Cart Modal View */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] shadow-2xl dark:border-[var(--omlu-border)]" role="dialog" aria-modal="true" aria-labelledby="menu-cart-title">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--omlu-border-strong)] dark:border-[var(--omlu-border)] px-6 py-4">
              <h2 id="menu-cart-title" className="break-words text-lg font-bold text-[var(--omlu-text-primary)]">
                {t.yourCart} ({totalQty})
              </h2>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="text-[var(--omlu-text-secondary)] hover:text-[var(--omlu-text-primary)] font-semibold cursor-pointer text-sm"
              >
                {t.close}
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-6">
              {checkoutError && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 p-4 rounded-2xl text-sm font-medium">
                  <strong>{t.checkoutErrorTitle}:</strong> {checkoutError}
                </div>
              )}

              {Object.keys(cart).length === 0 ? (
                <p className="text-center text-[var(--omlu-text-secondary)] font-medium py-8">
                  {t.emptyCartMsg}
                </p>
              ) : (
                <div className="flex flex-col gap-5">
                  {Object.values(cart).map((line) => {
                    const item = allItemsMap[line.menu_item_id];
                    if (!item) return null;
                    const unit = optionPrice(item, line.selected_options);
                    const itemTotal = unit * line.quantity;
                    const labels = selectedOptionLabels(item, line.selected_options);

                    return (
                      <div
                        key={line.key}
                        className="flex flex-col gap-2 pb-4 border-b border-[var(--omlu-border-strong)] dark:border-[var(--omlu-border)]"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="font-bold text-sm text-[var(--omlu-text-primary)]">
                              {getLocalizedText(item.name_en, item.name_ml)}
                            </h4>
                            <span className="text-xs text-orange-600 dark:text-orange-500 font-bold">
                              ₹{unit.toFixed(2)} × {line.quantity}
                            </span>
                            {labels.length > 0 && (
                              <div className="mt-1 flex flex-col gap-0.5">
                                {labels.map((label) => (
                                  <span key={label} className="text-[11px] text-[var(--omlu-text-secondary)]">
                                    {label}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="font-bold text-sm text-[var(--omlu-text-primary)]">
                              ₹{itemTotal.toFixed(2)}
                            </span>
                            {/* Qty controls if not orderingDisabled */}
                            {!orderingDisabled && (
                              <div className="flex items-center border border-[var(--omlu-border-strong)] dark:border-[var(--omlu-border)] rounded-lg overflow-hidden bg-[var(--omlu-muted-surface)]">
                                <button
                                  type="button"
                                  onClick={() => decrementQty(line.key)}
                                  className="px-2 py-0.5 text-[var(--omlu-text-secondary)] font-bold hover:bg-[var(--omlu-muted-surface)] cursor-pointer text-sm"
                                >
                                  −
                                </button>
                                <span className="px-2 text-xs font-bold text-[var(--omlu-text-primary)]">
                                  {line.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => incrementQty(line.key)}
                                  className="px-2 py-0.5 text-[var(--omlu-text-secondary)] font-bold hover:bg-[var(--omlu-muted-surface)] cursor-pointer text-sm"
                                >
                                  +
                                </button>
                              </div>
                            )}
                            {/* Remove button if not orderingDisabled */}
                            {!orderingDisabled && (
                              <button
                                type="button"
                                onClick={() => removeItem(line.key)}
                                className="text-red-500 hover:text-red-700 text-xs font-bold cursor-pointer"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Item note field if not orderingDisabled */}
                        {!orderingDisabled && (
                          <input
                            type="text"
                            value={line.item_note}
                            onChange={(e) =>
                              handleItemNoteChange(line.key, e.target.value)
                            }
                            placeholder={t.itemNotePlaceholder}
                            className="w-full px-3 py-1.5 bg-[var(--omlu-muted-surface)] border border-[var(--omlu-border-strong)] dark:border-[var(--omlu-border)] rounded-lg text-xs outline-none focus:ring-1 focus:ring-orange-600"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* General Order Instructions */}
              {Object.keys(cart).length > 0 && !orderingDisabled && (
                <div className="mt-2">
                  <h4 className="font-bold text-xs text-[var(--omlu-text-secondary)] uppercase tracking-wider mb-2">
                    {t.customerNote}
                  </h4>
                  <textarea
                    rows={2}
                    value={customerNote}
                    onChange={(e) => setCustomerNote(e.target.value)}
                    placeholder={t.customerNote}
                    className="w-full px-3 py-2 bg-[var(--omlu-muted-surface)] border border-[var(--omlu-border-strong)] dark:border-[var(--omlu-border)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-600 text-[var(--omlu-text-primary)]"
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {Object.keys(cart).length > 0 && (
              <div className="border-t border-[var(--omlu-border-strong)] dark:border-[var(--omlu-border)] px-6 py-4 flex flex-col gap-4 bg-[var(--omlu-muted-surface)]">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--omlu-text-secondary)] font-medium">
                    {t.subtotal}
                  </span>
                  <span className="text-lg font-black text-orange-600 dark:text-orange-500">
                    {formattedSubtotal}
                  </span>
                </div>
                {orderingDisabled ? (
                  currentSession?.public_token ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCartOpen(false);
                        router.push(`/session/${currentSession.public_token}`);
                      }}
                      className="w-full py-3.5 rounded-2xl font-bold bg-amber-600 hover:bg-amber-700 text-white text-center shadow-md transition cursor-pointer"
                    >
                      {t.viewBill}
                    </button>
                  ) : null
                ) : (
                  <button
                    type="button"
                    disabled={isPlacingOrder}
                    onClick={handlePlaceOrder}
                    className={`w-full py-3.5 rounded-2xl font-bold text-[var(--omlu-primary-action-text)] text-center shadow-md transition cursor-pointer flex items-center justify-center gap-2 ${
                      isPlacingOrder
                        ? "bg-[var(--omlu-muted-surface)] cursor-not-allowed"
                        : "bg-orange-600 hover:bg-orange-700 active:bg-orange-800"
                    }`}
                  >
                    {isPlacingOrder ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        {t.submitting}
                      </>
                    ) : (
                      t.placeOrder
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
