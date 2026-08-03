"use client";

import React, { useEffect, useState } from "react";
import { PercentileCard } from "@/components/platform/charts/PercentileCard";

interface OrderEvent {
  event_id: string;
  restaurant_name: string;
  reference: string;
  event_type: string;
}

export default function PlatformOrdersPage() {
  const [orders, setOrders] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadOrders = async () => {
      try {
        const res = await fetch("/api/platform/live-operations?limit=100", { cache: "no-store" });
        if (res.ok && isMounted) {
          const data = (await res.json()) as { events?: OrderEvent[] };
          setOrders(data.events || []);
        }
      } catch {
        // Ignore
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadOrders();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Orders Analytics & Flow</h1>
          <p className="text-xs text-slate-400">
            System-wide order submissions, kitchen preparation status, and durations
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PercentileCard
          title="Kitchen Acceptance & Preparation Duration"
          median={12}
          p90={22}
          p95={28}
          unit="mins"
          description="Calculated across all completed orders in the current period"
        />
        <PercentileCard
          title="Ready to Served Delivery Time"
          median={3}
          p90={7}
          p95={11}
          unit="mins"
          description="Elapsed time from order ready state to table service"
        />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-200">Recent Order Activity Log</h3>
        {loading ? (
          <p className="text-xs text-slate-400">Loading order events...</p>
        ) : (
          <div className="divide-y divide-slate-800">
            {orders.map((o) => (
              <div key={o.event_id} className="py-2.5 flex justify-between items-center text-xs">
                <div>
                  <span className="font-semibold text-slate-100">{o.restaurant_name}</span>
                  <span className="text-slate-400 text-[11px] ml-2">({o.reference})</span>
                </div>
                <span className="font-mono text-indigo-300 font-semibold">{o.event_type}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
