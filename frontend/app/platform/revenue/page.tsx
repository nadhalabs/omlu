"use client";

import React, { useEffect, useState } from "react";
import { StackedBarChart } from "@/components/platform/charts/StackedBarChart";

interface RevenueData {
  collected_dining_revenue: number;
  completed_quick_sale_revenue: number;
  pending_collection: number;
  payment_methods: {
    cash: number;
    upi: number;
  };
  tax_breakdown: {
    cgst: number;
    sgst: number;
    total_gst: number;
  };
}

export default function PlatformRevenuePage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadRevenue = async () => {
      try {
        const res = await fetch("/api/platform/revenue?days=30", { cache: "no-store" });
        if (res.ok && isMounted) {
          const json = (await res.json()) as RevenueData;
          setData(json);
        }
      } catch {
        // Ignore
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadRevenue();
    return () => {
      isMounted = false;
    };
  }, []);

  if (loading || !data) {
    return <div className="p-8 text-center text-xs text-slate-400">Loading financial telemetry...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Revenue & Financial Reconciliation</h1>
          <p className="text-xs text-slate-400">
            Authoritative platform financial tracking, GST breakdown, and settlement reconciliation
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
          <span className="text-[10px] font-semibold text-slate-400 uppercase">Collected Dining Revenue</span>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            ₹{data.collected_dining_revenue.toLocaleString()}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
          <span className="text-[10px] font-semibold text-slate-400 uppercase">Completed Quick Sale Revenue</span>
          <div className="text-2xl font-bold font-mono text-indigo-400">
            ₹{data.completed_quick_sale_revenue.toLocaleString()}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-1">
          <span className="text-[10px] font-semibold text-slate-400 uppercase">Pending Collection</span>
          <div className="text-2xl font-bold font-mono text-amber-400">
            ₹{data.pending_collection.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <StackedBarChart
          title="Payment Method Breakdown"
          valuePrefix="₹"
          segments={[
            { label: "Cash", value: data.payment_methods.cash, color: "#10b981" },
            { label: "UPI", value: data.payment_methods.upi, color: "#6366f1" },
          ]}
        />

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <h4 className="text-sm font-semibold text-slate-200">GST Snapshot Summary</h4>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between p-2.5 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-slate-400">CGST Collected:</span>
              <span className="font-mono font-bold text-slate-200">₹{data.tax_breakdown.cgst.toLocaleString()}</span>
            </div>
            <div className="flex justify-between p-2.5 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-slate-400">SGST Collected:</span>
              <span className="font-mono font-bold text-slate-200">₹{data.tax_breakdown.sgst.toLocaleString()}</span>
            </div>
            <div className="flex justify-between p-2.5 bg-slate-950 rounded-lg border border-slate-800">
              <span className="text-slate-400 font-semibold">Total GST:</span>
              <span className="font-mono font-bold text-emerald-400">₹{data.tax_breakdown.total_gst.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
