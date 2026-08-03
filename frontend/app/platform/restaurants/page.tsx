"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { fetchFleetRestaurants, FleetRestaurant } from "@/lib/platformApi";

export default function FleetPage() {
  const [restaurants, setRestaurants] = useState<FleetRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    let isMounted = true;
    const loadFleet = async () => {
      try {
        const res = await fetchFleetRestaurants(search, statusFilter);
        if (isMounted) setRestaurants(res.restaurants);
      } catch {
        // Ignore err
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadFleet();
    return () => {
      isMounted = false;
    };
  }, [search, statusFilter]);

  const getHealthBadge = (health: string) => {
    switch (health) {
      case "Healthy":
        return "bg-emerald-950/60 text-emerald-300 border-emerald-800";
      case "Attention":
        return "bg-amber-950/60 text-amber-300 border-amber-800";
      case "Degraded":
        return "bg-rose-950/60 text-rose-300 border-rose-800";
      case "Offline":
        return "bg-slate-800 text-slate-400 border-slate-700";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

  return (
    <div className="space-y-6">
      {/* Control header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Restaurant Fleet Command</h1>
          <p className="text-xs text-slate-400">
            Monitoring all onboarded OMLU restaurant deployments ({restaurants.length})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search restaurant, city, slug..."
            value={search}
            onChange={(e) => {
              setLoading(true);
              setSearch(e.target.value);
            }}
            className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none w-52"
          />

          <select
            value={statusFilter}
            onChange={(e) => {
              setLoading(true);
              setStatusFilter(e.target.value);
            }}
            className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none"
          >
            <option value="">All Health States</option>
            <option value="Healthy">Healthy</option>
            <option value="Attention">Attention</option>
            <option value="Degraded">Degraded</option>
            <option value="Offline">Offline</option>
            <option value="Suspended">Suspended</option>
          </select>
        </div>
      </div>

      {/* Fleet table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading restaurant fleet...</div>
        ) : restaurants.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No restaurants match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="p-4">Restaurant</th>
                  <th className="p-4">Health Status</th>
                  <th className="p-4">Orders (24h)</th>
                  <th className="p-4">Revenue (24h)</th>
                  <th className="p-4">Open Tables</th>
                  <th className="p-4">Pending Payments</th>
                  <th className="p-4">Staff</th>
                  <th className="p-4 text-right">Command Centre</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200 font-medium">
                {restaurants.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-4">
                      <div>
                        <span className="font-bold text-slate-100 block text-sm">{r.name}</span>
                        <span className="text-[11px] font-mono text-slate-400">
                          {r.slug} • {r.city}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${getHealthBadge(r.health_status)}`}>
                        {r.health_status}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-slate-100">{r.orders_today}</td>
                    <td className="p-4 font-mono text-emerald-400 font-bold">
                      ₹{r.collected_revenue_today.toLocaleString()}
                    </td>
                    <td className="p-4 font-mono">{r.open_tables}</td>
                    <td className="p-4 font-mono text-amber-400">{r.pending_payments}</td>
                    <td className="p-4 text-slate-400">{r.active_staff_count} active</td>
                    <td className="p-4 text-right">
                      <Link
                        href={`/platform/restaurants/${r.id}`}
                        className="inline-flex items-center space-x-1 text-xs font-semibold bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <span>Command Centre</span>
                        <span>→</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
