"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RealtimeStatus = "connecting" | "live" | "reconnecting" | "offline";

export type RealtimeEvent = {
  id?: string;
  type: string;
  resource_id?: string;
  timestamp?: string;
  state?: Record<string, unknown>;
  restaurant_id?: number;
};

type PublicTarget =
  | { kind: "session"; token: string }
  | { kind: "order"; token: string }
  | { kind: "menu"; restaurantSlug: string; tableCode: string };

type StaffTarget = {
  kind: "staff";
  channel: "operations" | "kitchen" | "staff" | "admin" | "availability";
};

type UseRealtimeOptions = {
  enabled?: boolean;
  target: PublicTarget | StaffTarget;
  onEvent: (event: RealtimeEvent) => void;
  onReconnect?: () => void;
};

function apiBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "http://localhost:8000"
  ).replace(/\/+$/, "");
}

function websocketBaseUrl() {
  return apiBaseUrl().replace(/^http/i, "ws").replace(/\/$/, "");
}

async function getStaffWsToken() {
  const res = await fetch("/api/auth/ws-token", { cache: "no-store" });
  if (!res.ok) throw new Error("Real-time authentication failed.");
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("Real-time authentication failed.");
  return data.token;
}

async function buildRealtimeUrl(target: PublicTarget | StaffTarget) {
  const base = websocketBaseUrl();
  if (target.kind === "session") {
    return `${base}/ws/public/sessions/${encodeURIComponent(target.token)}`;
  }
  if (target.kind === "order") {
    return `${base}/ws/public/orders/${encodeURIComponent(target.token)}`;
  }
  if (target.kind === "menu") {
    return `${base}/ws/public/restaurants/${encodeURIComponent(target.restaurantSlug)}/tables/${encodeURIComponent(target.tableCode)}/menu`;
  }

  const token = await getStaffWsToken();
  const params = new URLSearchParams({ channel: target.channel, token });
  return `${base}/ws/staff?${params.toString()}`;
}

export function useRealtime({
  enabled = true,
  target,
  onEvent,
  onReconnect,
}: UseRealtimeOptions) {
  const [status, setStatus] = useState<RealtimeStatus>("offline");
  const targetKey = JSON.stringify(target);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const retryRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const targetRef = useRef(target);
  const onEventRef = useRef(onEvent);
  const onReconnectRef = useRef(onReconnect);

  useEffect(() => {
    targetRef.current = target;
    onEventRef.current = onEvent;
    onReconnectRef.current = onReconnect;
  }, [onEvent, onReconnect, target]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let active = true;

    const connect = async () => {
      clearReconnectTimer();
      setStatus(retryRef.current > 0 ? "reconnecting" : "connecting");

      try {
        const url = await buildRealtimeUrl(targetRef.current);
        if (!active) return;

        const socket = new WebSocket(url);
        socketRef.current = socket;

        socket.onopen = () => {
          retryRef.current = 0;
          setStatus("live");
          onReconnectRef.current?.();
        };

        socket.onmessage = (message) => {
          try {
            const event = JSON.parse(message.data) as RealtimeEvent;
            if (event.type === "heartbeat" || event.type === "connection.ready") return;
            if (event.id) {
              if (seenIdsRef.current.has(event.id)) return;
              seenIdsRef.current.add(event.id);
              if (seenIdsRef.current.size > 250) {
                const [oldest] = seenIdsRef.current;
                if (oldest) seenIdsRef.current.delete(oldest);
              }
            }
            onEventRef.current(event);
          } catch {
            // Ignore malformed frames and wait for the next heartbeat or event.
          }
        };

        socket.onclose = () => {
          if (!active) return;
          setStatus("reconnecting");
          retryRef.current += 1;
          const delay = Math.min(30_000, 1_000 * 2 ** Math.min(retryRef.current, 5));
          reconnectTimerRef.current = window.setTimeout(connect, delay);
        };

        socket.onerror = () => {
          socket.close();
        };
      } catch {
        if (!active) return;
        setStatus("reconnecting");
        retryRef.current += 1;
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(retryRef.current, 5));
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      }
    };

    void connect();

    return () => {
      active = false;
      clearReconnectTimer();
      socketRef.current?.close();
      socketRef.current = null;
      setStatus("offline");
    };
  }, [clearReconnectTimer, enabled, targetKey]);

  return status;
}
