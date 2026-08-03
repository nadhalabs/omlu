"use client";

import React, { useEffect, useState } from "react";

interface LiveEvent {
  event_id: string;
  restaurant_name: string;
  event_type: string;
  reference: string;
  timestamp: string;
}

interface RealtimeStatus {
  broker_healthy: boolean;
  mode: string;
}

export default function LiveOperationsPage() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadLiveEvents = async () => {
      try {
        const res = await fetch("/api/platform/live-operations", { cache: "no-store" });
        if (res.ok && isMounted) {
          const data = (await res.json()) as { events?: LiveEvent[]; realtime_status?: RealtimeStatus };
          setEvents(data.events || []);
          setRealtimeStatus(data.realtime_status || null);
        }
      } catch {
        // Ignore
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadLiveEvents();
    const interval = setInterval(() => {
      void loadLiveEvents();
    }, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Live Operations Stream</h1>
          <p className="text-xs text-slate-400">
            Near-realtime service event telemetry across all restaurant locations
          </p>
        </div>

        {realtimeStatus && (
          <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                realtimeStatus.broker_healthy ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
            ></span>
            <span className="text-slate-300 font-medium">
              Broker: {realtimeStatus.mode === "live_websocket" ? "Live WS" : "Polling Fallback"}
            </span>
          </div>
        )}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Streaming live events...</div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No recent operational events recorded.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {events.map((evt) => (
              <div key={evt.event_id} className="p-4 hover:bg-slate-800/40 transition-colors flex items-center justify-between text-xs">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-slate-100">{evt.restaurant_name}</span>
                    <span className="bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded text-[10px] font-mono">
                      {evt.event_type}
                    </span>
                  </div>
                  <p className="text-slate-300 font-mono text-[11px]">{evt.reference}</p>
                </div>

                <div className="text-right text-slate-400 text-[11px] font-mono">
                  {new Date(evt.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
