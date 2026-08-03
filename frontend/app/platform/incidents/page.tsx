"use client";

import React, { useEffect, useState } from "react";
import { OperationalAlert } from "@/lib/platformApi";

export default function PlatformIncidentsPage() {
  const [incidents, setIncidents] = useState<OperationalAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadIncidents = async () => {
      try {
        const res = await fetch("/api/platform/incidents", { cache: "no-store" });
        if (res.ok && isMounted) {
          const data = (await res.json()) as { incidents?: OperationalAlert[] };
          setIncidents(data.incidents || []);
        }
      } catch {
        // Ignore
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadIncidents();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Incident Centre & Alerts</h1>
          <p className="text-xs text-slate-400">
            Deduplicated operational alert engine tracking system anomalies & critical events
          </p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-200">Active Operational Incidents ({incidents.length})</h3>

        {loading ? (
          <p className="text-xs text-slate-400">Scanning incident telemetry...</p>
        ) : incidents.length === 0 ? (
          <div className="p-6 bg-slate-950/60 border border-slate-800 rounded-xl text-center text-xs text-emerald-400 font-medium">
            ✓ No active incidents or alerts detected.
          </div>
        ) : (
          <div className="space-y-3">
            {incidents.map((inc) => (
              <div
                key={inc.id}
                className={`p-4 rounded-xl border text-xs space-y-1.5 ${
                  inc.severity === "Critical"
                    ? "bg-rose-950/40 border-rose-800 text-rose-200"
                    : "bg-amber-950/40 border-amber-800 text-amber-200"
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-100">{inc.title}</span>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-900">
                    {inc.severity}
                  </span>
                </div>
                <p className="text-slate-300">{inc.message}</p>
                <div className="text-[11px] text-slate-400 pt-1">
                  Restaurant: {inc.restaurant_name} • Entity: {inc.entity_type} #{inc.entity_id}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
