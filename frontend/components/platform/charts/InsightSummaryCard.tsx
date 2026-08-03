"use client";

import React from "react";
import Link from "next/link";
import { PlainLanguageInsight } from "@/lib/platformApi";

interface InsightSummaryCardProps {
  insights: PlainLanguageInsight[];
}

export const InsightSummaryCard: React.FC<InsightSummaryCardProps> = ({ insights }) => {
  if (!insights || insights.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center text-slate-400">
        <h3 className="text-sm font-semibold text-slate-300 mb-2">Plain-Language Analytical Insights</h3>
        <p className="text-xs">Not enough data to calculate analytical insights for this period.</p>
      </div>
    );
  }

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case "Alert":
        return "bg-rose-950/40 border-rose-800 text-rose-300";
      case "Warning":
        return "bg-amber-950/40 border-amber-800 text-amber-300";
      case "Info":
        return "bg-sky-950/40 border-sky-800 text-sky-300";
      default:
        return "bg-slate-800/40 border-slate-700 text-slate-300";
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-3">
      <div className="flex justify-between items-center mb-1">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <h3 className="text-sm font-semibold text-slate-200">Plain-Language Insights Engine</h3>
        </div>
        <span className="text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
          Deterministic Metrics
        </span>
      </div>

      <div className="space-y-2.5">
        {insights.map((item, idx) => (
          <div
            key={idx}
            className={`p-3.5 rounded-lg border text-xs flex flex-col justify-between space-y-2 ${getSeverityStyle(
              item.severity
            )}`}
          >
            <div className="flex justify-between items-start">
              <span className="font-semibold uppercase text-[10px] tracking-wider opacity-80">
                {item.category} • {item.comparison_period}
              </span>
              <span className="font-mono text-[11px] font-bold">{item.metric_value}</span>
            </div>
            <p className="text-slate-200 text-xs leading-relaxed">{item.text}</p>
            {item.drilldown_path && (
              <div className="pt-1 flex justify-end">
                <Link
                  href={item.drilldown_path}
                  className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors flex items-center space-x-1"
                >
                  <span>Drill down to records</span>
                  <span>→</span>
                </Link>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
