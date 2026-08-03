"use client";

import React, { useEffect, useState } from "react";
import {
  fetchPlatformOverview,
  PlatformOverviewData,
  staleSessionClose,
  finalizePaidSession,
} from "@/lib/platformApi";

export default function PlatformOverviewPage() {
  const [data, setData] = useState<PlatformOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(1);
  const [actionSessionId, setActionSessionId] = useState<number | null>(null);
  const [actionType, setActionType] = useState<"close_stale" | "finalize_paid" | null>(null);
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const loadOverview = async () => {
    setError(null);
    try {
      const res = await fetchPlatformOverview(days);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load platform overview");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const execute = async () => {
      setError(null);
      try {
        const res = await fetchPlatformOverview(days);
        if (isMounted) setData(res);
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err.message : "Failed to load platform overview");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void execute();
    return () => {
      isMounted = false;
    };
  }, [days]);

  const handleExecuteRecovery = async () => {
    if (!actionSessionId || !actionType || reason.length < 10) return;
    setSubmitting(true);
    setActionMessage(null);
    try {
      if (actionType === "close_stale") {
        const res = await staleSessionClose(actionSessionId, reason);
        setActionMessage(`Session cancelled successfully. Table available: ${res.table_available}`);
      } else {
        const res = await finalizePaidSession(actionSessionId, reason);
        setActionMessage(`Paid session finalized successfully. Table available: ${res.table_available}`);
      }
      setActionSessionId(null);
      setActionType(null);
      setReason("");
      await loadOverview();
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Action failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="p-8 text-center text-slate-400 space-y-3 font-mono">
        <div className="inline-block w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs">Loading OMLU platform telemetry...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-rose-950/40 border border-rose-800 text-rose-300 rounded-xl text-xs space-y-3">
        <p className="font-semibold">Error Loading Observability Telemetry</p>
        <p>{error || "Data unavailable"}</p>
        <button
          onClick={() => {
            setLoading(true);
            setError(null);
            void loadOverview();
          }}
          className="bg-rose-900 hover:bg-rose-800 text-white px-3 py-1.5 rounded-lg font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  const {
    kpis,
    current_realtime_snapshot,
    duplicate_active_sessions_panel,
    visualizations,
    monitoring_coverage,
    metadata,
    platform_status,
  } = data;

  return (
    <div className="space-y-6">
      {/* Top Header & Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-lg font-bold text-slate-100">OMLU Observability</h1>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase font-mono ${
                platform_status === "Healthy"
                  ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
                  : "bg-amber-950/60 border-amber-800 text-amber-300"
              }`}
            >
              {platform_status}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Live platform health, restaurant connectivity, workflow reliability and incident response.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <label className="text-xs text-slate-400 font-mono">Scope Window:</label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none font-mono"
          >
            <option value={1}>Last 24 Hours</option>
            <option value={7}>Last 7 Days</option>
            <option value={30}>Last 30 Days</option>
          </select>
          <button
            onClick={() => {
              setLoading(true);
              void loadOverview();
            }}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 bg-indigo-950/60 border border-indigo-800 text-indigo-200 rounded-xl text-xs flex justify-between items-center">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Operational KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider">
            Fleet Health Status
          </span>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-slate-100 font-mono">{kpis.total_restaurants_monitored}</span>
            <span className="text-xs text-emerald-400 font-medium">({kpis.restaurants_healthy} Healthy)</span>
          </div>
          <p className="text-[11px] text-slate-400 pt-1">
            {kpis.restaurants_requiring_attention} Require Attention
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider">
            Stuck & Inconsistent Sessions
          </span>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-amber-400 font-mono">{kpis.stuck_sessions_count}</span>
            <span className="text-xs text-slate-400 font-mono">({kpis.duplicate_active_sessions_count} Duplicates)</span>
          </div>
          <p className="text-[11px] text-slate-400 pt-1">Require Operator Action</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider">
            Billing Reliability Rates
          </span>
          <div className="flex items-baseline space-x-2">
            <span className="text-xl font-bold text-indigo-400 font-mono">
              {kpis.billing_completion_rate_pct !== null ? `${kpis.billing_completion_rate_pct}%` : "N/A"}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Completion</span>
          </div>
          <p className="text-[11px] text-slate-400 pt-1 font-mono">
            Initiation: {kpis.billing_initiation_rate_pct !== null ? `${kpis.billing_initiation_rate_pct}%` : "N/A"}
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
          <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider">
            Current Realtime Snapshot
          </span>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl font-bold text-emerald-400 font-mono">
              {current_realtime_snapshot.active_websocket_connections}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Sockets</span>
          </div>
          <p className="text-[11px] text-slate-400 pt-1 font-mono">
            Broker: {current_realtime_snapshot.redis_available ? "Redis Active" : "Memory Fallback"}
          </p>
        </div>
      </div>

      {/* Duplicate Session Violations Panel (Diagnostic-Only) */}
      {duplicate_active_sessions_panel.length > 0 && (
        <div className="bg-rose-950/30 border border-rose-800/80 rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
              <h3 className="text-xs font-mono font-bold text-rose-200 uppercase tracking-wider">
                Diagnostics: Duplicate Active Table Sessions
              </h3>
            </div>
            <span className="text-[10px] font-mono text-rose-300 bg-rose-900/60 px-2 py-0.5 rounded">
              {duplicate_active_sessions_panel.length} Tables Affected (Read-Only Diagnostic)
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {duplicate_active_sessions_panel.map((v) => (
              <div key={v.table_id} className="p-3 bg-slate-950 border border-rose-900/60 rounded-lg text-xs space-y-1">
                <div className="flex justify-between font-semibold text-slate-200">
                  <span>{v.restaurant_name} — Table {v.table_number}</span>
                  <span className="text-rose-400 font-mono">{v.active_sessions_count} Active Sessions</span>
                </div>
                <p className="text-[11px] text-slate-400">{v.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6 Visualisations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Session Lifecycle Funnel */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider">
              1. Session Lifecycle Funnel (Backend Record)
            </h3>
            <p className="text-[11px] text-slate-400 pt-0.5">
              Transition progression from open to closed with raw denominators
            </p>
          </div>

          <div className="space-y-2.5 pt-1">
            {visualizations.session_lifecycle_funnel.map((item) => (
              <div key={item.stage} className="space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-slate-300">{item.stage}</span>
                  <span className="text-slate-400">
                    {item.count} sessions ({item.conversion_pct}%)
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, item.conversion_pct)}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Workflow Issues by Category */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider border-b border-slate-800 pb-3">
            2. Workflow Issues by Category
          </h3>
          {visualizations.workflow_issues_by_category.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-500 font-mono">No category issues detected in current range.</div>
          ) : (
            <div className="space-y-2">
              {visualizations.workflow_issues_by_category.map((item) => (
                <div key={item.category} className="flex justify-between items-center p-2.5 bg-slate-950 rounded-lg text-xs font-mono border border-slate-800/80">
                  <span className="text-slate-300">{item.category}</span>
                  <span className="text-amber-400 font-bold px-2 py-0.5 bg-slate-900 rounded">{item.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. Session Age Distribution */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider border-b border-slate-800 pb-3">
            3. Active Session Age Distribution
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {visualizations.session_age_distribution.map((item) => (
              <div key={item.bucket} className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-center space-y-1">
                <span className="text-[10px] font-mono text-slate-400 uppercase">{item.bucket.replace("_", "-")}</span>
                <p className="text-lg font-bold font-mono text-slate-100">{item.count}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 4. Pending Workflow Ageing */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider border-b border-slate-800 pb-3">
            4. Pending Workflow Ageing Distribution
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {visualizations.pending_workflow_ageing.map((item) => (
              <div key={item.bucket} className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-center space-y-1">
                <span className="text-[10px] font-mono text-slate-400 uppercase">{item.bucket.replace("_", "-")}</span>
                <p className="text-lg font-bold font-mono text-amber-400">{item.count}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 5. Billing Reliability Time Series */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider border-b border-slate-800 pb-3">
            5. Billing Reliability Time Series
          </h3>
          <div className="space-y-2">
            {visualizations.billing_reliability_time_series.map((item) => (
              <div key={item.date} className="flex justify-between items-center p-2.5 bg-slate-950 rounded-lg text-xs font-mono border border-slate-800">
                <span className="text-slate-300">{item.date}</span>
                <div className="flex space-x-3 text-[11px]">
                  <span className="text-indigo-400">Comp: {item.completion_rate_pct !== null ? `${item.completion_rate_pct}%` : "N/A"}</span>
                  <span className="text-slate-500">({item.reliability_status})</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 6. Restaurant Operational-Attention Matrix */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider border-b border-slate-800 pb-3">
            6. Restaurant Operational-Attention Matrix
          </h3>
          {visualizations.restaurant_operational_attention_matrix.length === 0 ? (
            <div className="p-4 text-center text-xs text-emerald-400 font-medium font-mono">✓ Zero restaurants in attention matrix.</div>
          ) : (
            <div className="space-y-2">
              {visualizations.restaurant_operational_attention_matrix.map((item) => (
                <div key={item.restaurant_id} className="p-2.5 bg-slate-950 rounded-lg text-xs border border-amber-900/60 space-y-1">
                  <div className="flex justify-between font-bold text-slate-200">
                    <span>{item.restaurant_name}</span>
                    <span className="text-amber-400 font-mono">{item.health_status}</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                    <span>Stuck Sessions: {item.stuck_sessions_count}</span>
                    <span>Pending Bills: {item.pending_payments_count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Monitoring Coverage Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <h3 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-wider border-b border-slate-800 pb-3">
          Monitoring Coverage Status
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-2 p-3 bg-slate-950 rounded-xl border border-emerald-900/40">
            <span className="font-mono font-semibold text-emerald-400">Available Telemetry</span>
            <ul className="space-y-1 text-slate-300">
              {monitoring_coverage.available_now.map((item) => (
                <li key={item} className="flex items-center space-x-2">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2 p-3 bg-slate-950 rounded-xl border border-slate-800">
            <span className="font-mono font-semibold text-slate-400">Un-instrumented Telemetry</span>
            <ul className="space-y-1 text-slate-500">
              {monitoring_coverage.not_instrumented.map((item) => (
                <li key={item} className="flex items-center space-x-2">
                  <span className="text-slate-600 font-bold">—</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Recovery Modal */}
      {actionSessionId && actionType && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 space-y-4 text-xs">
            <h3 className="text-sm font-bold text-slate-100 font-mono">
              Confirm Recovery Action ({actionType === "close_stale" ? "Cancel Stale Session" : "Finalize Paid Session"})
            </h3>
            <p className="text-slate-400">
              This action will update the session status, revoke participant tokens, and log an append-only audit entry.
            </p>
            <div className="space-y-1">
              <label className="text-slate-300 font-mono">Operator Reason (min 10 characters):</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="State the technical reason for this recovery action..."
                className="w-full h-24 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none font-sans"
              />
            </div>
            <div className="flex justify-end space-x-3 pt-2">
              <button
                onClick={() => {
                  setActionSessionId(null);
                  setActionType(null);
                  setReason("");
                }}
                className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteRecovery}
                disabled={submitting || reason.length < 10}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-semibold"
              >
                {submitting ? "Executing..." : "Confirm & Execute"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="text-right text-[11px] text-slate-500 font-mono pt-2">
        Data freshness: {new Date(metadata.refreshed_at).toLocaleTimeString()} ({metadata.timezone_normalized})
      </div>
    </div>
  );
}
