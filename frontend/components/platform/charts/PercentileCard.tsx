"use client";

import React from "react";

interface PercentileCardProps {
  title: string;
  median: number;
  p90: number;
  p95: number;
  unit?: string;
  description?: string;
}

export const PercentileCard: React.FC<PercentileCardProps> = ({
  title,
  median,
  p90,
  p95,
  unit = "mins",
  description,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-3">
      <h4 className="text-sm font-semibold text-slate-200">{title}</h4>
      {description && <p className="text-xs text-slate-400">{description}</p>}

      <div className="grid grid-cols-3 gap-2 pt-1 text-center">
        <div className="bg-slate-800/60 border border-slate-700/50 p-2.5 rounded-lg">
          <span className="block text-[10px] text-slate-400 font-medium">MEDIAN (P50)</span>
          <span className="text-base font-bold text-slate-100 font-mono">
            {median} <span className="text-xs font-normal text-slate-400">{unit}</span>
          </span>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 p-2.5 rounded-lg">
          <span className="block text-[10px] text-slate-400 font-medium">P90</span>
          <span className="text-base font-bold text-amber-400 font-mono">
            {p90} <span className="text-xs font-normal text-slate-400">{unit}</span>
          </span>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 p-2.5 rounded-lg">
          <span className="block text-[10px] text-slate-400 font-medium">P95</span>
          <span className="text-base font-bold text-rose-400 font-mono">
            {p95} <span className="text-xs font-normal text-slate-400">{unit}</span>
          </span>
        </div>
      </div>
    </div>
  );
};
