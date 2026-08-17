"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AndroidDownloadCard } from "@/components/AndroidDownloadCard";
import { getKitchenOrders, updateKitchenOrderStatus, getStaffMe, ApiError } from "@/lib/api";
import { KitchenOrderResponse, CurrentStaffResponse } from "@/lib/types";
import { useRealtime } from "@/lib/realtime";
import { registerAuthenticatedCleanup } from "@/lib/authRuntime.mjs";
import { useOmluUi } from "@/components/OmluUiProvider";
import { useConfirmedSignOut } from "@/components/useConfirmedSignOut";
import { KitchenHeader } from "./KitchenHeader";
import { KitchenBoard } from "./KitchenBoard";
import { KitchenAvailabilityDialog } from "./KitchenAvailabilityDialog";
import { KitchenBoardRefreshCoordinator } from "@/lib/kitchenBoardRefresh.mjs";
import { KitchenOrderAlert, NewKitchenTicketTracker } from "@/lib/kitchenOrderAlert.mjs";

const HEALTHY_RECONCILIATION_MS = 90_000;
const DEGRADED_RECONCILIATION_MS = 15_000;
const EVENT_BATCH_MS = 100;
const SELF_MUTATION_TTL_MS = 5_000;

interface KitchenDashboardClientProps {
  restaurantSlug: string;
}

export default function KitchenDashboardClient({
  restaurantSlug,
}: KitchenDashboardClientProps) {
  const router = useRouter();
  const { confirm: confirmDialog, toast } = useOmluUi();
  const { requestSignOut, signOutPending } = useConfirmedSignOut();

  // Authentication states
  const [staffInfo, setStaffInfo] = useState<CurrentStaffResponse | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Main kitchen data states
  const [orders, setOrders] = useState<KitchenOrderResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Sound & Fullscreen configuration
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [focusMode, setFocusMode] = useState<boolean>(false);
  const [availabilityOpen, setAvailabilityOpen] = useState<boolean>(false);

  // Action status mapping to disable buttons while pending (token -> boolean)
  const [updatingTokens, setUpdatingTokens] = useState<Record<string, boolean>>({});

  // Establish an initial baseline, then alert once for genuinely new tickets.
  const ticketTrackerRef = useRef(new NewKitchenTicketTracker());
  const orderAlertRef = useRef<KitchenOrderAlert | null>(null);
  const refreshCoordinatorRef = useRef<KitchenBoardRefreshCoordinator | null>(null);
  const hasConnectedRef = useRef(false);
  const pendingMutationsRef = useRef(new Map<string, string>());
  const selfMutationEventsRef = useRef(new Map<string, { status: string; expiresAt: number }>());
  const confirmedMutationRef = useRef(new Map<string, number>());
  const operationVersionRef = useRef(0);

  // Keep a tick state to force elapsed durations to re-render every 10 seconds
  const [, setTick] = useState<number>(0);

  // Load sound preference
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const saved = localStorage.getItem("kitchen_sound_enabled");
      if (saved === "true") {
        setSoundEnabled(true);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  // Set up timer for wait duration tick
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 10000);
    const unregister = registerAuthenticatedCleanup(() => clearInterval(interval));
    return () => {
      unregister();
      clearInterval(interval);
    };
  }, []);

  // Play one preloaded, cooldown-protected alert. Audio failures never affect
  // order rendering or reconciliation.
  const playNewOrderAlert = useCallback(() => {
    if (!soundEnabled) return;
    orderAlertRef.current?.play();
  }, [soundEnabled]);

  useEffect(() => {
    const alert = new KitchenOrderAlert({
      onFailure: (error: unknown) => {
        if (process.env.NODE_ENV === "development") console.warn("Kitchen alert playback failed", error);
      },
    });
    orderAlertRef.current = alert;
    alert.preload();
    return () => {
      alert.dispose();
      if (orderAlertRef.current === alert) orderAlertRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!soundEnabled) return;
    const unlock = () => {
      void orderAlertRef.current?.unlock();
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [soundEnabled]);

  // Toggle sound and activate context (Correction #9)
  const handleToggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    localStorage.setItem("kitchen_sound_enabled", String(nextVal));

    if (nextVal) {
      void orderAlertRef.current?.unlock();
      toast("🔊 Sound notifications enabled", "success");
    } else {
      toast("🔇 Sound notifications muted", "information");
    }
  };

  // Fullscreen handlers (Correction #11)
  const exitFocusMode = useCallback(() => {
    setFocusMode(false);
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
  }, []);

  const enterFocusMode = async () => {
    setFocusMode(true);
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      // The enlarged layout remains active even if browser full-screen is denied.
    }
  };

  const handleToggleFullscreen = () => {
    if (focusMode) {
      exitFocusMode();
    } else {
      void enterFocusMode();
    }
  };

  useEffect(() => {
    if (!focusMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !availabilityOpen) exitFocusMode();
    };
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setFocusMode(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [availabilityOpen, exitFocusMode, focusMode]);

  // Fetch kitchen orders
  const performFetchOrders = useCallback(
    async (showLoading = true) => {
      const requestVersion = ++operationVersionRef.current;
      if (showLoading) setLoading(true);

      try {
        const fetched = await getKitchenOrders(restaurantSlug);
        setOrders((current) => {
          const currentByToken = new Map(current.map((order) => [order.public_token, order]));
          const reconciled = fetched.flatMap((serverOrder) => {
            const pendingStatus = pendingMutationsRef.current.get(serverOrder.public_token);
            const confirmedVersion = confirmedMutationRef.current.get(serverOrder.public_token);
            if (!pendingStatus && (!confirmedVersion || confirmedVersion < requestVersion)) {
              return [serverOrder];
            }
            const optimisticOrder = currentByToken.get(serverOrder.public_token);
            // A terminal optimistic transition intentionally removes the card.
            // Otherwise keep its newer local status when this GET predates the
            // pending or newly confirmed PATCH.
            return optimisticOrder ? [optimisticOrder] : [];
          });
          for (const [token, confirmedVersion] of confirmedMutationRef.current) {
            if (confirmedVersion < requestVersion) confirmedMutationRef.current.delete(token);
          }
          return reconciled;
        });
        setError(null);
        setLastUpdated(new Date());

        if (ticketTrackerRef.current.observe(fetched)) playNewOrderAlert();
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            router.replace("/login");
          } else {
            setError(err.message);
          }
        } else {
          setError("Connection issue. Showing loaded details.");
        }
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [playNewOrderAlert, restaurantSlug, router]
  );

  const fetchOrders = useCallback(
    (showLoading = true, queueIfActive = false) =>
      (refreshCoordinatorRef.current ??= new KitchenBoardRefreshCoordinator()).refresh(
        () => performFetchOrders(showLoading),
        { queueIfActive },
      ),
    [performFetchOrders],
  );

  const scheduleEventReconciliation = useCallback(() => {
    (refreshCoordinatorRef.current ??= new KitchenBoardRefreshCoordinator()).schedule(
      () => performFetchOrders(false),
      EVENT_BATCH_MS,
    );
  }, [performFetchOrders]);

  useEffect(() => {
    const coordinator = new KitchenBoardRefreshCoordinator();
    refreshCoordinatorRef.current = coordinator;
    ticketTrackerRef.current = new NewKitchenTicketTracker();
    hasConnectedRef.current = false;
    pendingMutationsRef.current.clear();
    selfMutationEventsRef.current.clear();
    confirmedMutationRef.current.clear();
    return () => coordinator.dispose();
  }, [restaurantSlug]);

  // Auth check on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const staff = await getStaffMe();

        if (staff.restaurant_slug !== restaurantSlug) {
          setAuthError("Access Denied: You do not have permission for this restaurant.");
          setAuthLoading(false);
          return;
        }

        const allowedRoles = ["owner", "admin", "kitchen"];
        if (!allowedRoles.includes(staff.role)) {
          setAuthError(`Access Denied: Role '${staff.role}' is not permitted to view the kitchen dashboard.`);
          setAuthLoading(false);
          return;
        }

        setStaffInfo(staff);
        setAuthLoading(false);
        void fetchOrders(true);
      } catch {
        router.replace("/login");
      }
    };

    const timeout = window.setTimeout(() => void checkAuth(), 0);
    return () => window.clearTimeout(timeout);
  }, [fetchOrders, restaurantSlug, router]);

  // Realtime Connection Subscription
  const realtimeStatus = useRealtime({
    enabled: Boolean(staffInfo && !authError),
    target: { kind: "staff", channel: "kitchen" },
    onEvent: (event) => {
      const publicToken = event.state?.public_token?.toString();
      const status = event.state?.status?.toString();
      const pending = publicToken ? selfMutationEventsRef.current.get(publicToken) : undefined;
      if (
        event.type === "order.status_changed" &&
        publicToken &&
        status &&
        pending?.status === status &&
        pending.expiresAt >= Date.now()
      ) {
        selfMutationEventsRef.current.delete(publicToken);
        return;
      }
      scheduleEventReconciliation();
    },
    onReconnect: () => {
      if (!hasConnectedRef.current) {
        hasConnectedRef.current = true;
        return;
      }
      void fetchOrders(false, true);
    },
  });

  // Reconcile slowly while realtime is healthy and fall back automatically
  // when the connection is degraded. Hidden boards do not poll.
  useEffect(() => {
    if (authLoading || authError || !staffInfo) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void fetchOrders(false, true);
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const intervalMs = realtimeStatus === "live"
      ? HEALTHY_RECONCILIATION_MS
      : DEGRADED_RECONCILIATION_MS;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchOrders(false);
    }, intervalMs);
    const unregister = registerAuthenticatedCleanup(() => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(interval);
    });
    return () => {
      unregister();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(interval);
    };
  }, [authLoading, authError, fetchOrders, realtimeStatus, staffInfo]);

  // Handle status update endpoint
  const handleUpdateStatus = async (publicToken: string, nextStatus: string) => {
    if (pendingMutationsRef.current.has(publicToken)) return;
    const previousOrder = orders.find((order) => order.public_token === publicToken);
    if (!previousOrder) return;
    setUpdatingTokens((prev) => ({ ...prev, [publicToken]: true }));
    for (const [token, mutation] of selfMutationEventsRef.current) {
      if (mutation.expiresAt < Date.now()) selfMutationEventsRef.current.delete(token);
    }
    pendingMutationsRef.current.set(publicToken, nextStatus);
    selfMutationEventsRef.current.set(publicToken, {
      status: nextStatus,
      expiresAt: Date.now() + SELF_MUTATION_TTL_MS,
    });

    // Optimistic UI update
    setOrders((current) =>
      nextStatus === "served" || nextStatus === "rejected"
        ? current.filter((order) => order.public_token !== publicToken)
        : current.map((order) =>
            order.public_token === publicToken
              ? { ...order, status: nextStatus }
              : order
          )
    );

    try {
      const updated = await updateKitchenOrderStatus(
        restaurantSlug,
        publicToken,
        nextStatus
      );

      confirmedMutationRef.current.set(publicToken, ++operationVersionRef.current);
      setOrders((prev) => {
        if (nextStatus === "served" || nextStatus === "rejected") {
          return prev.filter((o) => o.public_token !== publicToken);
        }
        return prev.map((o) =>
          o.public_token === publicToken && o.status === nextStatus ? updated : o
        );
      });
      pendingMutationsRef.current.delete(publicToken);
      setError(null);
    } catch (err) {
      pendingMutationsRef.current.delete(publicToken);
      selfMutationEventsRef.current.delete(publicToken);
      confirmedMutationRef.current.delete(publicToken);
      setOrders((current) => {
        const currentOrder = current.find((order) => order.public_token === publicToken);
        if (currentOrder && currentOrder.status !== nextStatus) return current;
        return [
          ...current.filter((order) => order.public_token !== publicToken),
          previousOrder,
        ].sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at));
      });
      void fetchOrders(false, true);
      if (err instanceof ApiError) {
        if (err.status === 401) {
          router.replace("/login");
        } else {
          toast(`Order restored. ${err.message} Tap the action to retry.`, "error");
        }
      } else {
        toast("Order restored after a connection error. Tap the action to retry.", "error");
      }
    } finally {
      setUpdatingTokens((prev) => ({ ...prev, [publicToken]: false }));
    }
  };

  // Confirmation dialog wrapper
  const confirmReject = async (token: string) => {
    const confirmed = await confirmDialog({
      title: "Reject order?",
      message: "This will cancel the order and update the customer’s screen. It cannot be undone.",
      confirmLabel: "Reject order",
      cancelLabel: "Keep order",
      tone: "destructive",
    });

    if (!confirmed) return;
    await handleUpdateStatus(token, "rejected");
  };

  // Auth loading state
  if (authLoading) {
    return (
      <div className="omlu-operational-shell flex flex-col flex-1 items-center justify-center min-h-screen px-4 py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500" />
        <p className="mt-4 text-[var(--omlu-text-secondary)] font-bold text-sm">
          Verifying session credentials…
        </p>
      </div>
    );
  }

  // Auth error state
  if (authError) {
    return (
      <div className="omlu-operational-shell flex flex-col flex-1 items-center justify-center min-h-screen p-6 text-center">
        <div className="max-w-md bg-[var(--omlu-primary-surface)] border border-[var(--omlu-border)] rounded-3xl p-8 shadow-2xl">
          <div className="text-red-500 text-5xl mb-4">⛔</div>
          <h2 className="text-xl font-bold text-[var(--omlu-text-primary)] mb-2">Access Denied</h2>
          <p className="text-sm text-[var(--omlu-text-secondary)] mb-6">{authError}</p>
          <button
            type="button"
            onClick={requestSignOut}
            disabled={signOutPending}
            className="px-6 py-2.5 bg-red-700 text-[var(--omlu-strong-action-text)] font-semibold rounded-xl transition cursor-pointer disabled:opacity-50"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  if (!staffInfo) return null;

  const dashboardHref =
    staffInfo.role === "owner" || staffInfo.role === "admin"
      ? "/admin/dashboard"
      : "/staff";

  return (
    <div className={`omlu-operational-shell flex flex-col flex-1 min-h-screen ${focusMode ? "p-3 md:p-4" : "p-4 md:p-6"}`}>
      {/* Header Bar */}
      <KitchenHeader
        restaurantSlug={restaurantSlug}
        realtimeStatus={realtimeStatus}
        lastUpdated={lastUpdated}
        soundEnabled={soundEnabled}
        onToggleSound={handleToggleSound}
        focusMode={focusMode}
        onToggleFullscreen={handleToggleFullscreen}
        onOpenAvailability={() => setAvailabilityOpen(true)}
        dashboardHref={dashboardHref}
        staffName={staffInfo.name}
        staffRole={staffInfo.role}
        onRefresh={() => void fetchOrders(true)}
        onSignOut={requestSignOut}
        signOutPending={signOutPending}
        hasError={Boolean(error)}
      />

      {!focusMode && <AndroidDownloadCard variant="compact" dismissible className="mb-4" />}

      {/* Connection & API Error Banner */}
      {error && (
        <div role="alert" className="bg-red-950/40 border border-red-900/50 text-red-300 px-4 py-3 rounded-2xl text-sm font-medium mb-4 flex justify-between items-center">
          <span>⚠️ {error}</span>
          <button
            type="button"
            onClick={() => void fetchOrders(false)}
            className="underline hover:text-red-200 font-bold ml-3"
          >
            Retry Sync
          </button>
        </div>
      )}

      {/* Board & Lanes */}
      <KitchenBoard
        orders={orders}
        updatingTokens={updatingTokens}
        onAccept={(tok) => void handleUpdateStatus(tok, "accepted")}
        onReject={(tok) => void confirmReject(tok)}
        onStartPrep={(tok) => void handleUpdateStatus(tok, "preparing")}
        onMarkReady={(tok) => void handleUpdateStatus(tok, "ready")}
        onMarkServed={(tok) => void handleUpdateStatus(tok, "served")}
        loading={loading}
      />

      {/* Availability Drawer */}
      <KitchenAvailabilityDialog open={availabilityOpen} onClose={() => setAvailabilityOpen(false)} />
    </div>
  );
}
