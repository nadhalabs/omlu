"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AndroidDownloadCard } from "@/components/AndroidDownloadCard";
import { useRouter } from "next/navigation";
import { getKitchenOrders, updateKitchenOrderStatus, getStaffMe, ApiError } from "@/lib/api";
import { KitchenOrderResponse, CurrentStaffResponse } from "@/lib/types";
import { useRealtime } from "@/lib/realtime";
import { registerAuthenticatedCleanup } from "@/lib/authRuntime.mjs";
import { useOmluUi } from "@/components/OmluUiProvider";
import { useConfirmedSignOut } from "@/components/useConfirmedSignOut";
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

  // Sound configuration
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);
  const [focusMode, setFocusMode] = useState(false);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);

  // Action status mapping to disable buttons (token -> boolean)
  const [updatingTokens, setUpdatingTokens] = useState<Record<string, boolean>>({});

  // Track known order tokens locally to prevent double play or alerts for initial orders
  const knownTokensRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef<boolean>(true);
  const isFetchingRef = useRef<boolean>(false);

  // Keep a tick state to force elapsed durations to re-render every 10 seconds
  const [tick, setTick] = useState<number>(0);

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
      
      // Ring tone sequence using 2 oscillators
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.type = "sine";
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5 note
      osc1.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5 note

      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(440, ctx.currentTime); // A4 note
      
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

  // Toggle sound and activate context (required by browser audio security model)
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
            ctx.resume();
          }
        }
      } catch {}
    }
  };

  const exitFocusMode = useCallback(() => {
    setFocusMode(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);

  const enterFocusMode = async () => {
    setFocusMode(true);
    try {
      await document.documentElement.requestFullscreen?.();
    } catch {
      // The enlarged layout remains active when browser full-screen is denied.
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
  const fetchOrders = useCallback(async (showLoading = true) => {
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
          // Token expired or invalid
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
  }, [playNewOrderBeep, restaurantSlug, router]);

  // Auth check on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const staff = await getStaffMe();
        
        // 1. Verify restaurant tenant isolation
        if (staff.restaurant_slug !== restaurantSlug) {
          setAuthError("Access Denied: You do not have permission for this restaurant.");
          setAuthLoading(false);
          return;
        }

        // 2. Enforce allowed roles
        const allowedRoles = ["owner", "admin", "kitchen"];
        if (!allowedRoles.includes(staff.role)) {
          setAuthError(`Access Denied: Role '${staff.role}' is not permitted to view the kitchen dashboard.`);
          setAuthLoading(false);
          return;
        }

        setStaffInfo(staff);
        setAuthLoading(false);
        
        // Trigger initial data load
        fetchOrders(true);
      } catch {
        // Redirect to login if unauthenticated or token expired
        router.replace("/login");
      }
    };

    const timeout = window.setTimeout(() => checkAuth(), 0);
    return () => window.clearTimeout(timeout);
  }, [fetchOrders, restaurantSlug, router]);

  // Setup tab visible events and polling loop
  useEffect(() => {
    if (authLoading || authError || !staffInfo) return;

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchOrders(false);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        fetchOrders(false);
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
    setOrders((current) =>
      nextStatus === "served" || nextStatus === "rejected"
        ? current.filter((order) => order.public_token !== publicToken)
        : current.map((order) =>
            order.public_token === publicToken
              ? { ...order, status: nextStatus }
              : order,
          ),
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

  // Confirmation flow wrapper
  const triggerConfirm = async (token: string, action: "reject" | "served") => {
    const rejecting = action === "reject";
    if (!await confirmDialog({ title: rejecting ? "Reject order?" : "Mark order as served?", message: rejecting ? "This will cancel the order and update the customer’s screen. It cannot be undone." : "Confirm the order was served. It will be removed from the active Kitchen view.", confirmLabel: rejecting ? "Reject order" : "Mark as served", cancelLabel: rejecting ? "Keep order" : "Cancel", tone: rejecting ? "destructive" : "default" })) return;
    await handleUpdateStatus(token, rejecting ? "rejected" : "served");
  };

  // Render elapsed duration
  const getElapsedTime = (createdStr: string) => {
    void tick;
    const created = new Date(createdStr);
    const diffMs = new Date().getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ${diffMins % 60}m ago`;
  };

  // Render Auth Loading State
  if (authLoading) {
    return (
      <div className="omlu-light-shell flex flex-col flex-1 items-center justify-center min-h-screen px-4 py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
        <p className="mt-4 text-zinc-500 font-bold text-sm">
          Verifying session credentials...
        </p>
      </div>
    );
  }

  // Render Auth Authorization Errors
  if (authError) {
    return (
      <div className="omlu-light-shell flex flex-col flex-1 items-center justify-center min-h-screen p-6 text-center">
        <div className="max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl">
          <div className="text-red-500 text-5xl mb-4">⛔</div>
          <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-sm text-zinc-500 mb-6">{authError}</p>
          <button
            onClick={requestSignOut}
            disabled={signOutPending}
            className="px-6 py-2.5 bg-red-700 text-white font-semibold rounded-xl transition cursor-pointer disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-600"
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

  // Sort orders into columns
  const cols = {
    pending: orders.filter((o) => o.status === "pending"),
    accepted: orders.filter((o) => o.status === "accepted"),
    preparing: orders.filter((o) => o.status === "preparing"),
    ready: orders.filter((o) => o.status === "ready"),
  };

  return (
    <div className={`omlu-light-shell flex flex-col flex-1 min-h-screen ${focusMode ? "p-3 md:p-4" : "p-6"}`}>
      {/* Top Header Banner displaying Staff name, role, restaurant and logout */}
      <header className={`flex items-center justify-between gap-4 border-b border-zinc-800 pb-4 ${focusMode ? "mb-4" : "mb-6 flex-col md:flex-row md:items-center"}`}>
        <div>
          <span className="text-xs font-normal text-zinc-500">Kitchen display</span>
          {!focusMode && <><h1 className="text-3xl font-black tracking-tight text-white mt-1">Active Orders</h1>
          <p className="text-zinc-500 text-xs mt-1.5 font-bold">
            Logged in as <span className="text-zinc-300 font-black">{staffInfo.name}</span> (Role: <span className="text-orange-500 font-black uppercase text-[10px] bg-orange-950/20 px-2 py-0.5 rounded border border-orange-900/30">{staffInfo.role}</span>)
          </p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-zinc-600">
            Real-time: {realtimeStatus}
            {lastUpdated ? ` • Updated ${lastUpdated.toLocaleTimeString()}` : ""}
          </p></>}
        </div>

        {/* Action / Sync controls */}
        <div className="flex flex-wrap items-center gap-3 self-stretch md:self-auto justify-between">
          {!focusMode && <Link
            href={dashboardHref}
            className="px-4 py-2.5 rounded-xl text-sm font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
          >
            Back to dashboard
          </Link>}
          <button onClick={() => setAvailabilityOpen(true)} className="px-3 py-2 text-sm font-normal text-zinc-400 hover:text-white">Manage availability</button>
          <button onClick={focusMode ? exitFocusMode : enterFocusMode} aria-label={focusMode ? "Exit kitchen full screen" : "Enlarge kitchen display"} className="px-3 py-2 text-sm font-normal text-zinc-400 hover:text-white">
            ⛶ {focusMode ? "Exit" : "Enlarge"}
          </button>
          {/* Sound Alert Toggle */}
          {!focusMode && <button
            onClick={handleToggleSound}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 cursor-pointer transition ${
              soundEnabled
                ? "bg-orange-600 hover:bg-orange-700 text-white shadow-md shadow-amber-900/30"
                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
            }`}
          >
            {soundEnabled ? "🔊 Sound Enabled" : "🔇 Sound Disabled"}
          </button>}

          {/* Manual Refresh */}
          {!focusMode && <button
            onClick={() => fetchOrders(true)}
            className="p-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl cursor-pointer text-sm font-bold text-zinc-300 transition"
            title="Refresh"
          >
            🔄
          </button>}

          {/* Logout Button */}
          {!focusMode && <button
            onClick={requestSignOut}
            disabled={signOutPending}
            className="px-4 py-2.5 bg-red-650/20 hover:bg-red-650/30 border border-red-900/40 text-red-400 text-sm font-bold rounded-xl cursor-pointer transition"
          >
            Sign Out
          </button>}
        </div>
      </header>

      {!focusMode && <AndroidDownloadCard variant="compact" dismissible className="mb-6" />}

      {/* API Connection Indicator */}
      {error && (
        <div className="bg-red-950/40 border border-red-900/50 text-red-400 px-4 py-3 rounded-2xl text-sm font-medium mb-6 flex justify-between items-center">
          <span>⚠️ {error}</span>
          <button
            onClick={() => fetchOrders(false)}
            className="underline hover:text-red-300 font-bold"
          >
            Retry Sync
          </button>
        </div>
      )}

      {/* Main Grid View */}
      {loading && orders.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
          <span className="text-zinc-500 text-sm font-bold mt-4">Loading active orders...</span>
        </div>
      ) : (
        <div className={`grid flex-1 items-start overflow-x-auto ${focusMode ? "grid-cols-4 gap-3 min-w-[1050px]" : "grid-cols-1 gap-6 md:grid-cols-4"}`}>
          {/* COLUMN 1: NEW */}
          <div className="bg-zinc-950/40 border border-zinc-800/40 rounded-3xl p-4 flex flex-col gap-4 min-h-[70vh]">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-1">
              <h2 className="text-sm font-black text-orange-500 uppercase tracking-wider">
                New ({cols.pending.length})
              </h2>
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse"></span>
            </div>
            <div className="flex flex-col gap-4 overflow-y-auto max-h-[70vh] no-scrollbar">
              {cols.pending.length === 0 ? (
                <p className="text-center text-zinc-600 text-xs py-8 font-semibold">No pending orders</p>
              ) : (
                cols.pending.map((order) => (
                  <OrderCard
                    key={order.public_token}
                    order={order}
                    elapsedTime={getElapsedTime(order.created_at)}
                    isUpdating={!!updatingTokens[order.public_token]}
                    onAccept={() => handleUpdateStatus(order.public_token, "accepted")}
                    onReject={() => triggerConfirm(order.public_token, "reject")}
                  />
                ))
              )}
            </div>
          </div>

          {/* COLUMN 2: ACCEPTED */}
          <div className="bg-zinc-950/40 border border-zinc-800/40 rounded-3xl p-4 flex flex-col gap-4 min-h-[70vh]">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-1">
              <h2 className="text-sm font-black text-cyan-500 uppercase tracking-wider">
                Accepted ({cols.accepted.length})
              </h2>
            </div>
            <div className="flex flex-col gap-4 overflow-y-auto max-h-[70vh] no-scrollbar">
              {cols.accepted.length === 0 ? (
                <p className="text-center text-zinc-600 text-xs py-8 font-semibold">No accepted orders</p>
              ) : (
                cols.accepted.map((order) => (
                  <OrderCard
                    key={order.public_token}
                    order={order}
                    elapsedTime={getElapsedTime(order.created_at)}
                    isUpdating={!!updatingTokens[order.public_token]}
                    onStartPrep={() => handleUpdateStatus(order.public_token, "preparing")}
                    onReject={() => triggerConfirm(order.public_token, "reject")}
                  />
                ))
              )}
            </div>
          </div>

          {/* COLUMN 3: PREPARING */}
          <div className="bg-zinc-950/40 border border-zinc-800/40 rounded-3xl p-4 flex flex-col gap-4 min-h-[70vh]">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-1">
              <h2 className="text-sm font-black text-purple-500 uppercase tracking-wider">
                Preparing ({cols.preparing.length})
              </h2>
            </div>
            <div className="flex flex-col gap-4 overflow-y-auto max-h-[70vh] no-scrollbar">
              {cols.preparing.length === 0 ? (
                <p className="text-center text-zinc-600 text-xs py-8 font-semibold">No preparing orders</p>
              ) : (
                cols.preparing.map((order) => (
                  <OrderCard
                    key={order.public_token}
                    order={order}
                    elapsedTime={getElapsedTime(order.created_at)}
                    isUpdating={!!updatingTokens[order.public_token]}
                    onMarkReady={() => handleUpdateStatus(order.public_token, "ready")}
                  />
                ))
              )}
            </div>
          </div>

          {/* COLUMN 4: READY */}
          <div className="bg-zinc-950/40 border border-zinc-800/40 rounded-3xl p-4 flex flex-col gap-4 min-h-[70vh]">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-1">
              <h2 className="text-sm font-black text-green-500 uppercase tracking-wider">
                Ready ({cols.ready.length})
              </h2>
            </div>
            <div className="flex flex-col gap-4 overflow-y-auto max-h-[70vh] no-scrollbar">
              {cols.ready.length === 0 ? (
                <p className="text-center text-zinc-600 text-xs py-8 font-semibold">No ready orders</p>
              ) : (
                cols.ready.map((order) => (
                  <OrderCard
                    key={order.public_token}
                    order={order}
                    elapsedTime={getElapsedTime(order.created_at)}
                    isUpdating={!!updatingTokens[order.public_token]}
                    onMarkServed={() => triggerConfirm(order.public_token, "served")}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <KitchenAvailabilityDialog open={availabilityOpen} onClose={() => setAvailabilityOpen(false)} />
    </div>
  );
}

// Internal Order Card component
interface OrderCardProps {
  order: KitchenOrderResponse;
  elapsedTime: string;
  isUpdating: boolean;
  onAccept?: () => void;
  onReject?: () => void;
  onStartPrep?: () => void;
  onMarkReady?: () => void;
  onMarkServed?: () => void;
}

function OrderCard({
  order,
  elapsedTime,
  isUpdating,
  onAccept,
  onReject,
  onStartPrep,
  onMarkReady,
  onMarkServed,
}: OrderCardProps) {
  const tableDisplay = order.table_number.trim();
  const sourceHeading = order.source === "takeaway" || tableDisplay.toLowerCase() === "takeaway"
    ? "TAKEAWAY"
    : tableDisplay.toLowerCase().startsWith("table ")
      ? tableDisplay.toLocaleUpperCase()
      : `TABLE ${tableDisplay}`;
  return (
    <article aria-label={`${sourceHeading}, order ${order.order_number}`} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4 shadow-sm hover:border-zinc-700 transition">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-3">
        <h3 className="min-w-0 break-words text-2xl font-black leading-tight tracking-wide text-white">{sourceHeading}</h3>
        <span className="shrink-0 whitespace-nowrap rounded-lg border border-orange-900/40 bg-orange-950/30 px-2.5 py-1 text-sm font-black uppercase text-orange-400">
          {elapsedTime}
        </span>
      </div>

      {/* Items list */}
      <div className="flex flex-col gap-4">
        {order.items.map((item, idx) => (
          <div key={idx} className="min-w-0">
            <p className="break-words text-lg font-extrabold leading-snug text-zinc-100">
              <span className="text-orange-400">{item.quantity} ×</span> {item.item_name}
            </p>
            {item.selected_options.map((option, optionIndex) => (
              <p key={`${option.option_name}-${optionIndex}`} className="mt-1 break-words pl-7 text-sm font-bold leading-snug text-cyan-300">
                {option.kitchen_display_name || option.option_name}
                {option.quantity > 1 ? ` × ${option.quantity}` : ""}
              </p>
            ))}
            {item.item_note && (
              <p className="mt-2 break-words rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-sm font-bold text-amber-300">
                Note: {item.item_note}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Customer order note */}
      {order.customer_note && (
        <div className="bg-zinc-950/50 p-2.5 rounded-xl border border-zinc-850">
          <span className="text-[9px] font-black text-zinc-500 uppercase tracking-wider block mb-0.5">
            Customer Note
          </span>
          <p className="break-words text-sm font-medium text-zinc-200">{order.customer_note}</p>
        </div>
      )}

      <p className="border-t border-zinc-800 pt-3 text-xs font-semibold text-zinc-500">Order {order.order_number}</p>

      {/* Actions */}
      <div className="flex gap-2 mt-2">
        {onReject && (
          <button
            disabled={isUpdating}
            onClick={onReject}
            aria-label={`Reject order ${order.order_number}`}
            className="min-h-12 px-4 bg-zinc-800 hover:bg-zinc-700 text-red-500 hover:text-red-400 font-bold rounded-xl text-sm transition cursor-pointer disabled:opacity-50"
          >
            ✕
          </button>
        )}
        {onAccept && (
          <button
            disabled={isUpdating}
            onClick={onAccept}
            className="min-h-12 flex-1 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl text-sm transition cursor-pointer disabled:opacity-50"
          >
            Accept
          </button>
        )}
        {onStartPrep && (
          <button
            disabled={isUpdating}
            onClick={onStartPrep}
            className="min-h-12 flex-1 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl text-sm transition cursor-pointer disabled:opacity-50"
          >
            Start Preparing
          </button>
        )}
        {onMarkReady && (
          <button
            disabled={isUpdating}
            onClick={onMarkReady}
            className="min-h-12 flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-sm transition cursor-pointer disabled:opacity-50"
          >
            Mark Ready
          </button>
        )}
        {onMarkServed && (
          <button
            disabled={isUpdating}
            onClick={onMarkServed}
            className="min-h-12 flex-1 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-sm transition cursor-pointer disabled:opacity-50"
          >
            Mark Served
          </button>
        )}
      </div>
    </article>
  );
}
