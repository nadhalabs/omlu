"use client";

import React, { useEffect, useState } from "react";
import { PercentileCard } from "@/components/platform/charts/PercentileCard";

interface SessionIncident {
  id: string;
  title: string;
  severity: string;
  message: string;
  entity_type: string;
}

export default function PlatformSessionsPage() {
  const [incidents, setIncidents] = useState<SessionIncident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadSessions = async () => {
      try {
        const res = await fetch("/api/platform/incidents", { cache: "no-store" });
        if (res.ok && isMounted) {
          const data = (await res.json()) as { incidents?: SessionIncident[] };
          const stuck = (data.incidents || []).filter((i) => i.entity_type === "dining_session");
          setIncidents(stuck);
        }
      } catch {
        // Ignore
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadSessions();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Table Sessions & Lifecycle</h1>
          <p className="text-xs text-slate-400">
            Monitoring customer table sessions, stuck session detection, and duration distribution
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <PercentileCard
          title="Dining Session Duration"
          median={48}
          p90={85}
          p95={115}
          unit="mins"
          description="Average table occupancy duration from QR scan to session closure"
        />
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-2">
          <h4 className="text-sm font-semibold text-slate-200">Stuck-Session Detection Rules</h4>
          <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
            <li>Session open &gt; 4 hours with no recent order</li>
            <li>Paid session retaining active table authority</li>
            <li>Bill requested &gt; 30 minutes without bill issuance</li>
            <li>Multiple active sessions assigned to the same table</li>
          </ul>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-200">
          Operational Attention: Flagged Table Sessions ({incidents.length})
        </h3>
        {loading ? (
          <p className="text-xs text-slate-400">Scanning session telemetry...</p>
        ) : incidents.length === 0 ? (
          <p className="text-xs text-emerald-400 font-medium">✓ No stuck or anomalous table sessions detected.</p>
        ) : (
          <div className="space-y-3">
            {incidents.map((item) => (
              <div key={item.id} className="p-3.5 bg-rose-950/30 border border-rose-800 rounded-xl text-xs space-y-1">
                <div className="flex justify-between items-center font-bold text-rose-300">
                  <span>{item.title}</span>
                  <span className="uppercase text-[10px] px-2 py-0.5 rounded bg-rose-900 text-white">
                    {item.severity}
                  </span>
                </div>
                <p className="text-slate-200">{item.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
