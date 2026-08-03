"use client";

import React from "react";

interface DataPoint {
  label: string;
  value: number;
}

interface LineChartProps {
  title: string;
  data: DataPoint[];
  color?: string;
  height?: number;
  valuePrefix?: string;
  valueSuffix?: string;
}

export const LineChart: React.FC<LineChartProps> = ({
  title,
  data,
  color = "#3b82f6",
  height = 220,
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
  const minValue = 0;
  const range = maxValue - minValue;

  const width = 500;
  const padding = 35;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const points = data.map((d, index) => {
    const x = padding + (index / (data.length - 1 || 1)) * innerWidth;
    const y = height - padding - ((d.value - minValue) / range) * innerHeight;
    return { x, y, ...d };
  });

  const pathD = points.reduce((acc, p, i) => `${acc} ${i === 0 ? "M" : "L"} ${p.x} ${p.y}`, "");

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-sm font-semibold text-slate-200">{title}</h4>
        <span className="text-xs text-slate-400">
          Latest: {valuePrefix}
          {data[data.length - 1].value.toLocaleString()}
          {valueSuffix}
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
        {/* Grid lines */}
        <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#334155" strokeDasharray="3 3" strokeWidth="0.5" />
        <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="#334155" strokeDasharray="3 3" strokeWidth="0.5" />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#334155" strokeWidth="1" />

        {/* Y Axis Labels */}
        <text x={padding - 8} y={padding + 4} fill="#94a3b8" fontSize="10" textAnchor="end">
          {valuePrefix}
          {Math.round(maxValue)}
        </text>
        <text x={padding - 8} y={height - padding + 4} fill="#94a3b8" fontSize="10" textAnchor="end">
          0
        </text>

        {/* Path Line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Data points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill={color} stroke="#0f172a" strokeWidth="2" />
            <text x={p.x} y={height - 10} fill="#94a3b8" fontSize="9" textAnchor="middle">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};
