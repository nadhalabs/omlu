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

  // Track known order tokens locally to prevent double play or alerts for initial orders
  const knownTokensRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef<boolean>(true);
  const isFetchingRef = useRef<boolean>(false);

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

  // Web Audio synth beep
  const playNewOrderBeep = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const audioWindow = window as Window & typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
      };
      const AudioCtx = window.AudioContext || audioWindow.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc1.frequency.setValueAtTime(880, ctx.currentTime + 0.15);

      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(440, ctx.currentTime);

      gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.45);
      osc2.stop(ctx.currentTime + 0.45);
    } catch (e) {
      console.warn("AudioContext playback failed", e);
    }
  }, [soundEnabled]);

  // Toggle sound and activate context (Correction #9)
  const handleToggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    localStorage.setItem("kitchen_sound_enabled", String(nextVal));

    if (nextVal) {
      try {
        const audioWindow = window as Window & typeof globalThis & {
          webkitAudioContext?: typeof AudioContext;
        };
        const AudioCtx = window.AudioContext || audioWindow.webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === "suspended") {
            void ctx.resume();
          }
        }
      } catch {}
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
  const fetchOrders = useCallback(
    async (showLoading = true) => {
      if (isFetchingRef.current) return;
      isFetchingRef.current = true;

      if (showLoading) setLoading(true);

      try {
        const fetched = await getKitchenOrders(restaurantSlug);
        setOrders(fetched);
        setError(null);
        setLastUpdated(new Date());

        const pendingTokens = fetched
          .filter((o) => o.status === "pending")
          .map((o) => o.public_token);

        if (isInitialLoadRef.current) {
          pendingTokens.forEach((tok) => knownTokensRef.current.add(tok));
          isInitialLoadRef.current = false;
        } else {
          let hasNew = false;
          pendingTokens.forEach((tok) => {
            if (!knownTokensRef.current.has(tok)) {
              knownTokensRef.current.add(tok);
              hasNew = true;
            }
          });

          if (hasNew) {
            playNewOrderBeep();
          }
        }
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
        isFetchingRef.current = false;
      }
    },
    [playNewOrderBeep, restaurantSlug, router]
  );

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

  // Setup tab visibility and polling loop
  useEffect(() => {
    if (authLoading || authError || !staffInfo) return;

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchOrders(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchOrders(false);
      }
    }, 5000);
    const unregister = registerAuthenticatedCleanup(() => {
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(interval);
    });

    return () => {
      unregister();
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(interval);
    };
  }, [authLoading, authError, fetchOrders, staffInfo]);

  // Realtime Connection Subscription
  const realtimeStatus = useRealtime({
    enabled: Boolean(staffInfo && !authError),
    target: { kind: "staff", channel: "kitchen" },
    onEvent: () => void fetchOrders(false),
    onReconnect: () => void fetchOrders(false),
  });

  // Handle status update endpoint
  const handleUpdateStatus = async (publicToken: string, nextStatus: string) => {
    if (updatingTokens[publicToken]) return;
    setUpdatingTokens((prev) => ({ ...prev, [publicToken]: true }));
    const previousOrders = orders;

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

      setOrders((prev) => {
        if (nextStatus === "served" || nextStatus === "rejected") {
          return prev.filter((o) => o.public_token !== publicToken);
        }
        return prev.map((o) => (o.public_token === publicToken ? updated : o));
      });
      setError(null);
    } catch (err) {
      setOrders(previousOrders);
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
  const triggerConfirm = async (token: string, action: "reject" | "served") => {
    const rejecting = action === "reject";
    const confirmed = await confirmDialog({
      title: rejecting ? "Reject order?" : "Mark order as served?",
      message: rejecting
        ? "This will cancel the order and update the customer’s screen. It cannot be undone."
        : "Confirm the order was served. It will be removed from the active Kitchen view.",
      confirmLabel: rejecting ? "Reject order" : "Mark as served",
      cancelLabel: rejecting ? "Keep order" : "Cancel",
      tone: rejecting ? "destructive" : "default",
    });

    if (!confirmed) return;
    await handleUpdateStatus(token, rejecting ? "rejected" : "served");
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
        onReject={(tok) => void triggerConfirm(tok, "reject")}
        onStartPrep={(tok) => void handleUpdateStatus(tok, "preparing")}
        onMarkReady={(tok) => void handleUpdateStatus(tok, "ready")}
        onMarkServed={(tok) => void triggerConfirm(tok, "served")}
        loading={loading}
      />

      {/* Availability Drawer */}
      <KitchenAvailabilityDialog open={availabilityOpen} onClose={() => setAvailabilityOpen(false)} />
    </div>
  );
}
