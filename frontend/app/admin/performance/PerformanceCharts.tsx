import { useState, useRef } from "react";
import { formatCurrency } from "./performanceFormatters";

interface ChartPoint {
  label: string;
  value: number;
}

interface TrendChartProps {
  data: ChartPoint[];
  isCurrency?: boolean;
  title: string;
  explanation?: string;
  accessibleSummary: string;
}

export function TrendChart({
  data,
  isCurrency = false,
  title,
  explanation,
  accessibleSummary,
}: TrendChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (!data || data.length === 0) {
    return <ChartEmptyState message={`No ${title.toLowerCase()} data for this period.`} />;
  }

  const values = data.map((d) => d.value);
  const maxVal = Math.max(...values, 1);

  const width = 500;
  const height = 220;
  const paddingLeft = 55;
  const paddingRight = 15;
  const paddingTop = 20;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const getCoordinates = () => {
    if (data.length <= 1) {
      return [{ x: paddingLeft + chartWidth / 2, y: paddingTop + chartHeight / 2 }];
    }
    return data.map((d, i) => {
      const x = paddingLeft + (i / (data.length - 1)) * chartWidth;
      const y = paddingTop + chartHeight - (d.value / maxVal) * chartHeight;
      return { x, y };
    });
  };

  const points = getCoordinates();
  
  let linePath = "";
  let areaPath = "";
  if (points.length > 0) {
    linePath = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ");
    areaPath = `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`;
  }

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || data.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xClient = e.clientX - rect.left;
    const scaleX = width / rect.width;
    const xChart = xClient * scaleX;

    const pct = (xChart - paddingLeft) / chartWidth;
    const index = Math.min(data.length - 1, Math.max(0, Math.round(pct * (data.length - 1))));

    setActiveIndex(index);
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top - 70 });
  };

  const handlePointerLeave = () => {
    setActiveIndex(null);
    setTooltipPos(null);
  };

  const gridYValues = [0, 0.5, 1];
  const formatYValue = (val: number) => {
    if (isCurrency) {
      if (val >= 1000) return `₹${(val / 1000).toFixed(1)}k`;
      return `₹${val}`;
    }
    return Math.round(val).toString();
  };

  return (
    <div className="flex flex-col gap-2 rounded border border-zinc-850 bg-zinc-900/30 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-white">{title}</h3>
          {explanation && <p className="text-[10px] text-zinc-500 mt-0.5">{explanation}</p>}
        </div>
      </div>

      <div className="relative h-[220px] w-full" aria-label={accessibleSummary}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="h-full w-full select-none"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          <title>{title}</title>
          <desc>{accessibleSummary}</desc>

          {/* Grid lines */}
          {gridYValues.map((pct, idx) => {
            const y = paddingTop + chartHeight - pct * chartHeight;
            const val = pct * maxVal;
            return (
              <g key={idx} className="opacity-40">
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="var(--color-zinc-800)"
                  className="stroke-zinc-800"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-zinc-500 text-[10px] font-bold"
                >
                  {formatYValue(val)}
                </text>
              </g>
            );
          })}

          {/* Area under the line */}
          {areaPath && (
            <path
              d={areaPath}
              className="fill-orange-500/10"
            />
          )}

          {/* Trend line */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              className="stroke-orange-500"
              strokeWidth={2}
            />
          )}

          {/* Data points */}
          {points.map((p, idx) => (
            <circle
              key={idx}
              cx={p.x}
              cy={p.y}
              r={activeIndex === idx ? 4 : 2}
              className={`${
                activeIndex === idx
                  ? "fill-orange-500 stroke-zinc-950 stroke-2"
                  : "fill-orange-500 opacity-60"
              } transition-all duration-150`}
            />
          ))}
        </svg>

        {activeIndex !== null && tooltipPos && (
          <div
            className="pointer-events-none absolute z-20 rounded border border-zinc-800 bg-zinc-950 p-2 text-xs shadow-xl transition-all duration-75"
            style={{ left: `${tooltipPos.x}px`, top: `${tooltipPos.y}px`, transform: "translateX(-50%)" }}
          >
            <div className="font-bold text-zinc-400">{data[activeIndex].label}</div>
            <div className="mt-1 font-black text-white">
              {isCurrency ? formatCurrency(data[activeIndex].value) : `${data[activeIndex].value} orders`}
            </div>
          </div>
        )}
      </div>
      <div className="sr-only">{accessibleSummary}</div>
    </div>
  );
}

interface HourPoint {
  hour: number;
  orders: number;
}

interface HourBarChartProps {
  data: HourPoint[];
  title: string;
  accessibleSummary: string;
}

export function HourBarChart({ data, title, accessibleSummary }: HourBarChartProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (!data || data.length === 0) {
    return <ChartEmptyState message="No hourly orders recorded for this period." />;
  }

  const buckets = Array.from({ length: 24 }, (_, h) => {
    const found = data.find((d) => d.hour === h);
    return { hour: h, orders: found ? found.orders : 0 };
  });

  const values = buckets.map((b) => b.orders);
  const maxVal = Math.max(...values, 1);

  const width = 500;
  const height = 150;
  const paddingLeft = 35;
  const paddingRight = 10;
  const paddingTop = 15;
  const paddingBottom = 25;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const barWidth = chartWidth / 24;
  const gap = 1;

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xClient = e.clientX - rect.left;
    const scaleX = width / rect.width;
    const xChart = xClient * scaleX;

    const pct = (xChart - paddingLeft) / chartWidth;
    const index = Math.min(23, Math.max(0, Math.floor(pct * 24)));

    setActiveIndex(index);
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top - 60 });
  };

  const handlePointerLeave = () => {
    setActiveIndex(null);
    setTooltipPos(null);
  };

  return (
    <div className="flex flex-col gap-2 rounded border border-zinc-855 bg-zinc-900/30 p-4">
      <h3 className="text-sm font-black text-white">{title}</h3>

      <div className="relative h-[150px] w-full" aria-label={accessibleSummary}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="h-full w-full select-none"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          <title>{title}</title>
          <desc>{accessibleSummary}</desc>

          <line
            x1={paddingLeft}
            y1={paddingTop}
            x2={width - paddingRight}
            y2={paddingTop}
            className="stroke-zinc-800/40"
            strokeWidth={1}
            strokeDasharray="2 2"
          />
          <line
            x1={paddingLeft}
            y1={paddingTop + chartHeight}
            x2={width - paddingRight}
            y2={paddingTop + chartHeight}
            className="stroke-zinc-800"
            strokeWidth={1}
          />
          <text
            x={paddingLeft - 8}
            y={paddingTop + 4}
            className="fill-zinc-500 text-[10px] font-bold"
            textAnchor="end"
          >
            {maxVal}
          </text>
          <text
            x={paddingLeft - 8}
            y={paddingTop + chartHeight + 4}
            className="fill-zinc-500 text-[10px] font-bold"
            textAnchor="end"
          >
            0
          </text>

          {buckets.map((b, idx) => {
            const barHeight = (b.orders / maxVal) * chartHeight;
            const x = paddingLeft + idx * barWidth + gap;
            const y = paddingTop + chartHeight - barHeight;
            const isHovered = activeIndex === idx;

            return (
              <rect
                key={idx}
                x={x}
                y={y}
                width={Math.max(barWidth - gap * 2, 1)}
                height={Math.max(barHeight, 1)}
                className={`${isHovered ? "fill-orange-500" : "fill-orange-500/70"} transition-all duration-150`}
                rx={1}
              />
            );
          })}

          {Array.from({ length: 7 }).map((_, idx) => {
            const h = idx * 4;
            if (h > 23) return null;
            const x = paddingLeft + h * barWidth + barWidth / 2;
            return (
              <text
                key={idx}
                x={x}
                y={paddingTop + chartHeight + 15}
                textAnchor="middle"
                className="fill-zinc-500 text-[9px] font-bold"
              >
                {`${h.toString().padStart(2, "0")}:00`}
              </text>
            );
          })}
        </svg>

        {activeIndex !== null && tooltipPos && (
          <div
            className="pointer-events-none absolute z-20 rounded border border-zinc-800 bg-zinc-950 p-2 text-xs shadow-xl transition-all duration-75"
            style={{ left: `${tooltipPos.x}px`, top: `${tooltipPos.y}px`, transform: "translateX(-50%)" }}
          >
            <div className="font-bold text-zinc-400">{`${activeIndex.toString().padStart(2, "0")}:00 - ${(activeIndex + 1).toString().padStart(2, "0")}:00`}</div>
            <div className="mt-1 font-black text-white">{`${buckets[activeIndex].orders} orders`}</div>
          </div>
        )}
      </div>
      <div className="sr-only">{accessibleSummary}</div>
    </div>
  );
}

interface BarRow {
  label: string;
  value: number;
  revenue?: string | number;
}

interface HorizontalBarListProps {
  title: string;
  rows: BarRow[];
  suffix?: string;
  formatVal?: (val: number) => string;
}

export function HorizontalBarList({ title, rows, suffix = "", formatVal }: HorizontalBarListProps) {
  if (!rows || rows.length === 0) {
    return <ChartEmptyState message={`No ${title.toLowerCase()} metrics available.`} />;
  }

  const maxVal = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="flex flex-col gap-3 rounded border border-zinc-850 bg-zinc-900/30 p-4">
      <h3 className="text-sm font-black text-white">{title}</h3>
      <div className="grid gap-4 mt-2">
        {rows.map((row, idx) => {
          const pct = (row.value / maxVal) * 100;
          return (
            <div key={idx} className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-4 text-xs font-bold">
                <span className="truncate text-zinc-300" title={row.label}>
                  {idx + 1}. {row.label}
                </span>
                <span className="text-zinc-500 whitespace-nowrap">
                  {formatVal ? formatVal(row.value) : row.value}
                  {suffix}
                  {row.revenue !== undefined && ` · ${formatCurrency(row.revenue)}`}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-zinc-800/40 overflow-hidden">
                <div
                  className="h-full bg-orange-500 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[200px] flex-col items-center justify-center rounded border border-zinc-850 bg-zinc-900/10 p-8 text-center">
      <p className="text-xs font-bold text-zinc-500">{message}</p>
    </div>
  );
}

export function ChartSkeleton() {
  const barHeights = [36, 68, 44, 82, 56, 72, 48, 88, 62, 74, 52, 66];

  return (
    <div className="flex h-[220px] animate-pulse flex-col justify-between rounded border border-zinc-850 bg-zinc-900/20 p-4">
      <div className="h-4 w-32 rounded bg-zinc-800" />
      <div className="flex items-end gap-2 h-[130px]">
        {barHeights.map((height, i) => (
          <div
            key={i}
            className="flex-1 bg-zinc-800 rounded-t"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between">
        <div className="h-3 w-10 rounded bg-zinc-800" />
        <div className="h-3 w-10 rounded bg-zinc-800" />
      </div>
    </div>
  );
}
