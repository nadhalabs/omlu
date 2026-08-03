"use client";

import React from "react";

interface BarItem {
  label: string;
  value: number;
  subText?: string;
}

interface HorizontalBarChartProps {
  title: string;
  data: BarItem[];
  color?: string;
  valuePrefix?: string;
  valueSuffix?: string;
}

export const HorizontalBarChart: React.FC<HorizontalBarChartProps> = ({
  title,
  data,
  color = "#6366f1",
  valuePrefix = "",
  valueSuffix = "",
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-center text-slate-400">
        <h4 className="text-sm font-semibold text-slate-300 mb-2">{title}</h4>
        <p className="text-xs">Not enough data available.</p>
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
      <h4 className="text-sm font-semibold text-slate-200 mb-4">{title}</h4>
      <div className="space-y-3">
        {data.map((item, idx) => {
          const widthPct = Math.min(100, Math.max(2, (item.value / maxValue) * 100));
          return (
            <div key={idx} className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-slate-300 truncate max-w-[200px]" title={item.label}>
                  {item.label}
                </span>
                <span className="text-slate-400 font-mono">
                  {valuePrefix}
                  {item.value.toLocaleString()}
                  {valueSuffix}
                  {item.subText && <span className="ml-1 text-[10px] text-slate-500">({item.subText})</span>}
                </span>
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${widthPct}%`, backgroundColor: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
