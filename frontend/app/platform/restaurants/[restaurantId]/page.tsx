"use client";

import React, { useEffect, useState, use } from "react";
import { InsightSummaryCard } from "@/components/platform/charts/InsightSummaryCard";
import { PlainLanguageInsight } from "@/lib/platformApi";

interface DetailData {
  header: {
    id: number;
    name: string;
    slug: string;
    timezone: string;
    city: string;
    is_active: boolean;
    plan: string;
    health_status: string;
    health_reasons: string[];
    contact_email?: string;
    phone_number?: string;
  };
  summary: {
    orders_today: number;
    collected_revenue_today: number;
    pending_collection_today: number;
    open_sessions: number;
    pending_payments: number;
    active_staff: number;
  };
  insights: PlainLanguageInsight[];
}

interface TableDetail {
  table_id: number;
  table_number: string;
  table_code: string;
  is_occupied: boolean;
  session_age_minutes: number;
  order_count: number;
  bill_state: string;
  payment_state: string;
  anomaly_flags: string[];
}

interface OrderDetail {
  id: number;
  order_number: string;
  table_number: string;
  status: string;
  total_amount: number;
  order_source: string;
  created_at: string;
}

interface ConfigReadiness {
  tables_count: number;
  active_menu_items: number;
  active_staff_count: number;
  gst_enabled: boolean;
}

export default function RestaurantDetailPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = use(params);
  const [data, setData] = useState<DetailData | null>(null);
  const [tables, setTables] = useState<TableDetail[]>([]);
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [config, setConfig] = useState<ConfigReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"summary" | "tables" | "orders" | "bills" | "config">("summary");

  useEffect(() => {
    let isMounted = true;
    const loadDetail = async () => {
      try {
        const res = await fetch(`/api/platform/restaurants/${restaurantId}`, { cache: "no-store" });
        if (res.ok && isMounted) setData((await res.json()) as DetailData);

        const tRes = await fetch(`/api/platform/restaurants/${restaurantId}/tables`, { cache: "no-store" });
        if (tRes.ok && isMounted) setTables(((await tRes.json()) as { tables?: TableDetail[] }).tables || []);

        const oRes = await fetch(`/api/platform/restaurants/${restaurantId}/orders`, { cache: "no-store" });
        if (oRes.ok && isMounted) setOrders(((await oRes.json()) as { orders?: OrderDetail[] }).orders || []);

        const cRes = await fetch(`/api/platform/restaurants/${restaurantId}/config-readiness`, { cache: "no-store" });
        if (cRes.ok && isMounted) setConfig((await cRes.json()) as ConfigReadiness);
      } catch {
        // Ignore
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadDetail();
    return () => {
      isMounted = false;
    };
  }, [restaurantId]);

  if (loading || !data) {
    return <div className="p-8 text-center text-xs text-slate-400">Loading command centre...</div>;
  }

  const { header, summary, insights } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-xl font-bold text-slate-100">{header.name}</h1>
              <span className="bg-slate-800 text-slate-300 text-xs px-2.5 py-0.5 rounded-full font-mono border border-slate-700">
                {header.slug}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Timezone: {header.timezone} • City: {header.city || "Unspecified"} • Plan: {header.plan}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-800 text-emerald-300">
              Health: {header.health_status}
            </span>
          </div>
        </div>

        {header.contact_email && (
          <div className="pt-2 border-t border-slate-800 text-xs text-slate-400 space-x-4">
            <span>Owner Contact: {header.contact_email}</span>
            {header.phone_number && <span>Phone: {header.phone_number}</span>}
          </div>
        )}
      </div>

      {/* Navigation tabs */}
      <div className="flex space-x-2 border-b border-slate-800 text-xs font-medium">
        {(["summary", "tables", "orders", "config"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 rounded-t-lg transition-colors border-b-2 uppercase tracking-wider text-[11px] ${
              activeTab === tab
                ? "bg-slate-900 border-indigo-500 text-indigo-400 font-bold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      {activeTab === "summary" && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Orders Today</span>
              <div className="text-xl font-bold font-mono text-slate-100 mt-1">{summary.orders_today}</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Collected Revenue</span>
              <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
                ₹{summary.collected_revenue_today.toLocaleString()}
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Open Sessions</span>
              <div className="text-xl font-bold font-mono text-indigo-400 mt-1">{summary.open_sessions}</div>
            </div>
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Pending Payments</span>
              <div className="text-xl font-bold font-mono text-amber-400 mt-1">{summary.pending_payments}</div>
            </div>
          </div>

          <InsightSummaryCard insights={insights} />
        </div>
      )}

      {activeTab === "tables" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 text-xs font-semibold text-slate-200">
            Live Tables & Sessions Monitor ({tables.length})
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase">
              <tr>
                <th className="p-3">Table Code</th>
                <th className="p-3">Occupancy</th>
                <th className="p-3">Age (mins)</th>
                <th className="p-3">Orders</th>
                <th className="p-3">Bill State</th>
                <th className="p-3">Payment State</th>
                <th className="p-3">Anomalies</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {tables.map((t) => (
                <tr key={t.table_id} className="hover:bg-slate-800/40">
                  <td className="p-3 font-bold text-slate-100">{t.table_number} ({t.table_code})</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${t.is_occupied ? "bg-indigo-950 text-indigo-300" : "bg-slate-800 text-slate-400"}`}>
                      {t.is_occupied ? "Occupied" : "Vacant"}
                    </span>
                  </td>
                  <td className="p-3 font-mono">{t.session_age_minutes}m</td>
                  <td className="p-3 font-mono">{t.order_count}</td>
                  <td className="p-3">{t.bill_state}</td>
                  <td className="p-3">{t.payment_state}</td>
                  <td className="p-3 text-rose-400 font-semibold">{t.anomaly_flags.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "orders" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 text-xs font-semibold text-slate-200">
            Recent Orders ({orders.length})
          </div>
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase">
              <tr>
                <th className="p-3">Order #</th>
                <th className="p-3">Table</th>
                <th className="p-3">Status</th>
                <th className="p-3">Total</th>
                <th className="p-3">Source</th>
                <th className="p-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-slate-800/40">
                  <td className="p-3 font-bold font-mono text-slate-100">#{o.order_number}</td>
                  <td className="p-3">{o.table_number}</td>
                  <td className="p-3 font-semibold text-indigo-300">{o.status}</td>
                  <td className="p-3 font-mono text-emerald-400">₹{o.total_amount}</td>
                  <td className="p-3 text-slate-400">{o.order_source}</td>
                  <td className="p-3 text-slate-400">{new Date(o.created_at).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "config" && config && (
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">Configuration Readiness Checklist</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex justify-between">
              <span>Tables Configured:</span>
              <span className="font-bold text-slate-200">{config.tables_count} tables</span>
            </div>
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex justify-between">
              <span>Menu Items Active:</span>
              <span className="font-bold text-slate-200">{config.active_menu_items} items</span>
            </div>
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex justify-between">
              <span>Active Staff Accounts:</span>
              <span className="font-bold text-slate-200">{config.active_staff_count} staff</span>
            </div>
            <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 flex justify-between">
              <span>GST Configuration:</span>
              <span className="font-bold text-slate-200">{config.gst_enabled ? "Enabled" : "Disabled"}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
