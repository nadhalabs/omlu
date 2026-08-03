"use client";

import React from "react";

interface StackSegment {
  label: string;
  value: number;
  color: string;
}

interface StackedBarChartProps {
  title: string;
  segments: StackSegment[];
  valuePrefix?: string;
}

export const StackedBarChart: React.FC<StackedBarChartProps> = ({
  title,
  segments,
  valuePrefix = "",
}) => {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  if (total === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center text-slate-400">
        <h4 className="text-sm font-semibold text-slate-300 mb-2">{title}</h4>
        <p className="text-xs">No composition data available.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg space-y-3">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-semibold text-slate-200">{title}</h4>
        <span className="text-xs font-mono text-slate-400">
          Total: {valuePrefix}
          {total.toLocaleString()}
        </span>
      </div>

      {/* Stacked bar */}
      <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden flex">
        {segments.map((seg, idx) => {
          const widthPct = (seg.value / total) * 100;
          if (widthPct <= 0) return null;
          return (
            <div
              key={idx}
              className="h-full transition-all"
              style={{ width: `${widthPct}%`, backgroundColor: seg.color }}
              title={`${seg.label}: ${valuePrefix}${seg.value} (${widthPct.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 pt-1">
        {segments.map((seg, idx) => {
          const widthPct = total > 0 ? ((seg.value / total) * 100).toFixed(1) : "0";
          return (
            <div key={idx} className="flex items-center space-x-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: seg.color }}></span>
              <span className="text-slate-300 font-medium">{seg.label}:</span>
              <span className="text-slate-400 font-mono">
                {valuePrefix}
                {seg.value.toLocaleString()} ({widthPct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
