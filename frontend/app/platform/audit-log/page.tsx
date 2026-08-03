"use client";

import React, { useEffect, useState } from "react";

interface AuditLogEntry {
  id: number;
  actor_name: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string;
  ip_address: string;
  timestamp: string;
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadAuditLog = async () => {
      try {
        const res = await fetch("/api/platform/audit-log?limit=100", { cache: "no-store" });
        if (res.ok && isMounted) {
          const data = (await res.json()) as { audit_logs?: AuditLogEntry[] };
          setLogs(data.audit_logs || []);
        }
      } catch {
        // Ignore
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadAuditLog();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Platform Audit Log</h1>
          <p className="text-xs text-slate-400">
            Append-only audit trail recording every platform operator action
          </p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading audit records...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">No audit log records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase text-[10px]">
                <tr>
                  <th className="p-3.5">Actor</th>
                  <th className="p-3.5">Role</th>
                  <th className="p-3.5">Action</th>
                  <th className="p-3.5">Target</th>
                  <th className="p-3.5">IP Address</th>
                  <th className="p-3.5">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-800/40 font-medium">
                    <td className="p-3.5 font-bold text-slate-100">{l.actor_name}</td>
                    <td className="p-3.5 text-indigo-300 font-mono text-[11px]">{l.actor_role}</td>
                    <td className="p-3.5 font-mono text-emerald-400">{l.action}</td>
                    <td className="p-3.5 font-mono text-slate-400">
                      {l.target_type} #{l.target_id || "N/A"}
                    </td>
                    <td className="p-3.5 font-mono text-slate-400">{l.ip_address || "127.0.0.1"}</td>
                    <td className="p-3.5 text-slate-400 font-mono">
                      {new Date(l.timestamp).toLocaleString()}
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
