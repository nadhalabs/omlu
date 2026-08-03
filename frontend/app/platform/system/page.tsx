"use client";

import React, { useEffect, useState } from "react";
import { fetchSystemHealth, SystemHealthData } from "@/lib/platformApi";

export default function SystemHealthPage() {
  const [data, setData] = useState<SystemHealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadHealth = async () => {
      try {
        const res = await fetchSystemHealth();
        if (isMounted) setData(res);
      } catch {
        // Ignore
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadHealth();
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading || !data) {
    return <div className="p-8 text-center text-xs text-slate-400">Loading system telemetry...</div>;
  }

  const { components, version } = data;

  const getStatusBadge = (st: string) => {
    if (st === "healthy") return "bg-emerald-950 text-emerald-300 border-emerald-800";
    if (st === "degraded") return "bg-amber-950 text-amber-300 border-amber-800";
    return "bg-slate-800 text-slate-400 border-slate-700";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div>
          <h1 className="text-lg font-bold text-slate-100">System Telemetry & Health</h1>
          <p className="text-xs text-slate-400">
            Realtime monitoring of backend API, PostgreSQL, Redis, broker, and deployments
          </p>
        </div>

        <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-bold text-emerald-400 font-mono">System Overall: {data.status}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(components).map(([comp, st]) => (
          <div key={comp} className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex justify-between items-center text-xs">
            <span className="font-medium text-slate-300 uppercase tracking-wider">{comp.replace("_", " ")}</span>
            <span className={`px-2.5 py-1 rounded-full border font-semibold ${getStatusBadge(st)}`}>
              {st}
            </span>
          </div>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-200">Deployment & Version Telemetry</h3>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex justify-between">
            <span className="text-slate-400">Application Version:</span>
            <span className="font-mono font-bold text-slate-100">{version.app_version}</span>
          </div>
          <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex justify-between">
            <span className="text-slate-400">Migration Head:</span>
            <span className="font-mono font-bold text-indigo-400">{version.migration_revision}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
