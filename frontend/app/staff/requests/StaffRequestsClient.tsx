"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StaffBottomNav } from "@/components/staff/StaffBottomNav";
import { ApiError, getStaffServiceRequests, resolveStaffServiceRequest } from "@/lib/api";
import { useRealtime } from "@/lib/realtime";
import { StaffServiceRequestResponse } from "@/lib/types";

const requestLabels: Record<string, string> = {
  waiter: "Waiter",
  water: "Water",
  bill: "Bill",
};

function timeAgo(dateStr: string): string {
  const diff = Math.max(Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000), 0);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function StaffRequestsClient() {
  const [requests, setRequests] = useState<StaffServiceRequestResponse[]>([]);
  const [section, setSection] = useState<"active" | "completed">("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const alertedIdsRef = useRef<Set<number>>(new Set());

  const fetchRequests = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const data = await getStaffServiceRequests("all");
      setRequests(data);
      setError(null);
      setLastUpdated(new Date());

      const pendingIds = data.filter((request) => request.status === "pending").map((request) => request.id);
      const newIds = pendingIds.filter((id) => !alertedIdsRef.current.has(id));
      if (newIds.length > 0 && audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
      pendingIds.forEach((id) => alertedIdsRef.current.add(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load requests.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void fetchRequests(true), 0);
    const interval = window.setInterval(() => void fetchRequests(false), 15_000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [fetchRequests]);

  useRealtime({
    target: { kind: "staff", channel: "staff" },
    onEvent: () => void fetchRequests(false),
    onReconnect: () => void fetchRequests(false),
  });

  const activeRequests = useMemo(() => requests.filter((request) => request.status === "pending"), [requests]);
  const completedRequests = useMemo(() => requests.filter((request) => request.status !== "pending"), [requests]);
  const visibleRequests = section === "active" ? activeRequests : completedRequests;

  const handleResolve = async (requestId: number) => {
    if (resolvingId) return;
    setResolvingId(requestId);
    setError(null);
    try {
      const updated = await resolveStaffServiceRequest(requestId);
      setRequests((prev) => prev.map((request) => request.id === updated.id ? { ...request, ...updated } : request));
      void fetchRequests(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not resolve request.");
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--omlu-background)] px-4 pb-28 pt-5 text-zinc-950">
      <audio ref={audioRef} src="/notification.mp3" preload="auto" aria-hidden="true" />
      <div className="mx-auto flex max-w-md flex-col gap-5 sm:max-w-xl">
        <header className="flex items-center justify-between">
          <button type="button" onClick={() => void fetchRequests(false)} className="flex h-12 w-12 items-center justify-center rounded-full text-2xl text-zinc-950" aria-label="Refresh requests">
            ≡
          </button>
          <div className="text-center">
            <p className="text-xs font-bold text-zinc-400">{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "OMLU"}</p>
            <h1 className="text-2xl font-black text-orange-600">Requests</h1>
          </div>
          <div className="flex h-12 min-w-12 items-center justify-center rounded-full bg-orange-600 px-3 text-sm font-black text-white">
            {activeRequests.length}
          </div>
        </header>

        <div className="grid grid-cols-2 gap-2 rounded-3xl bg-white p-2 shadow-sm shadow-orange-100/60">
          <button type="button" onClick={() => setSection("active")} className={`h-12 rounded-2xl text-sm font-black ${section === "active" ? "bg-orange-600 text-white" : "text-zinc-500"}`}>
            Active
          </button>
          <button type="button" onClick={() => setSection("completed")} className={`h-12 rounded-2xl text-sm font-black ${section === "completed" ? "bg-orange-600 text-white" : "text-zinc-500"}`}>
            Completed
          </button>
        </div>

        {error && (
          <div className="rounded-3xl border border-red-200 bg-white p-5 text-sm font-bold text-red-700">
            <p>{error}</p>
            <button type="button" onClick={() => void fetchRequests(true)} className="mt-4 h-12 rounded-full bg-orange-600 px-6 font-black text-white">
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid gap-3">
            {[1, 2, 3].map((item) => <div key={item} className="h-36 animate-pulse rounded-3xl bg-white" />)}
          </div>
        ) : visibleRequests.length === 0 ? (
          <div className="rounded-3xl bg-white p-8 text-center text-sm font-semibold text-zinc-500">
            {section === "active" ? "No active requests." : "No completed requests."}
          </div>
        ) : (
          <div className="grid gap-3">
            {visibleRequests.map((request) => {
              const isActive = request.status === "pending";
              return (
                <article key={request.id} className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm shadow-orange-100/60">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-zinc-500">Table {request.table_number || "unknown"}</p>
                      <h2 className="mt-1 text-2xl font-black text-zinc-950">{requestLabels[request.request_type] || request.request_type}</h2>
                      <p className="mt-2 text-sm font-semibold text-zinc-500">{timeAgo(request.created_at)}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${isActive ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700"}`}>
                      {isActive ? "Active" : "Done"}
                    </span>
                  </div>
                  {isActive ? (
                    <button type="button" disabled={resolvingId === request.id} onClick={() => handleResolve(request.id)} className="mt-5 h-14 w-full rounded-2xl bg-orange-600 text-base font-black text-white disabled:bg-zinc-300">
                      {resolvingId === request.id ? "Resolving..." : "Resolve"}
                    </button>
                  ) : (
                    <p className="mt-5 rounded-2xl bg-green-50 p-4 text-sm font-bold text-green-700">
                      Resolved {request.resolved_at ? timeAgo(request.resolved_at) : ""}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
      <StaffBottomNav active="requests" requestCount={activeRequests.length} />
    </div>
  );
}
