"use client";

import React, { useEffect, useState } from "react";
import { PendingPaymentItem } from "@/lib/platformApi";

export default function PlatformPaymentsPage() {
  const [payments, setPayments] = useState<PendingPaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [bucket, setBucket] = useState<string>("");

  useEffect(() => {
    let isMounted = true;
    const loadPayments = async () => {
      try {
        const url = bucket ? `/api/platform/payments?duration_bucket=${bucket}` : "/api/platform/payments";
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok && isMounted) {
          const data = (await res.json()) as { payments?: PendingPaymentItem[] };
          setPayments(data.payments || []);
        }
      } catch {
        // Ignore
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadPayments();
    return () => {
      isMounted = false;
    };
  }, [bucket]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Pending Payments Queue</h1>
          <p className="text-xs text-slate-400">
            Dedicated platform payment monitor tracking issued bills awaiting staff/counter confirmation
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <select
            value={bucket}
            onChange={(e) => {
              setLoading(true);
              setBucket(e.target.value);
            }}
            className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-3 py-1.5 focus:outline-none"
          >
            <option value="">All Waiting Durations</option>
            <option value="under_5m">&lt; 5 minutes</option>
            <option value="5_15m">5 – 15 minutes</option>
            <option value="15_30m">15 – 30 minutes</option>
            <option value="30_60m">30 – 60 minutes</option>
            <option value="over_1h">&gt; 1 hour</option>
          </select>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading pending payment queue...</div>
        ) : payments.length === 0 ? (
          <div className="p-8 text-center text-xs text-emerald-400 font-medium">
            ✓ No pending payments matching current filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-semibold uppercase text-[10px]">
                <tr>
                  <th className="p-4">Restaurant</th>
                  <th className="p-4">Bill Number</th>
                  <th className="p-4">Amount</th>
                  <th className="p-4">Payment Code</th>
                  <th className="p-4">Waiting Duration</th>
                  <th className="p-4">Alert Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-medium">
                {payments.map((p) => (
                  <tr key={p.bill_id} className="hover:bg-slate-800/40">
                    <td className="p-4 font-bold text-slate-100">{p.restaurant_name}</td>
                    <td className="p-4 font-mono text-slate-300">#{p.bill_number}</td>
                    <td className="p-4 font-mono font-bold text-emerald-400">₹{p.total_amount.toLocaleString()}</td>
                    <td className="p-4 font-mono bg-slate-950 text-indigo-300 px-2 py-1 rounded w-fit">
                      {p.payment_code || "—"}
                    </td>
                    <td className="p-4 font-mono text-amber-400">{p.waiting_minutes} mins</td>
                    <td className="p-4">
                      <span
                        className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
                          p.alert_status === "Critical"
                            ? "bg-rose-950 text-rose-300 border border-rose-800"
                            : p.alert_status === "Warning"
                            ? "bg-amber-950 text-amber-300 border border-amber-800"
                            : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {p.alert_status}
                      </span>
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
