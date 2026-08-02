"use client";

import { useMemo, useState } from "react";
import { formatCurrency } from "./performanceFormatters";

export type ChartPoint = { label: string; value: number };
export type RankedRow = { label: string; quantity: number; revenue: number };

const card =
  "rounded-2xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] p-5 shadow-[0_1px_2px_rgba(24,24,27,0.04),0_10px_28px_rgba(24,24,27,0.035)]";

function formatAxis(value: number, currency: boolean) {
  if (!currency) return Math.round(value).toLocaleString("en-IN");
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}k`;
  return `₹${Math.round(value)}`;
}

export function TrendChart({
  data,
  isCurrency = false,
  title,
  explanation,
  accessibleSummary,
}: {
  data: ChartPoint[];
  isCurrency?: boolean;
  title: string;
  explanation?: string;
  accessibleSummary: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  if (!data.length) return <ChartEmptyState message={`No ${title.toLowerCase()} data for this period.`} />;

  const width = 640;
  const height = 260;
  const left = 58;
  const right = 18;
  const top = 20;
  const bottom = 42;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const max = Math.max(...data.map((point) => point.value), 1);
  const points = data.map((point, index) => ({
    x: data.length === 1 ? left + chartWidth / 2 : left + (index / (data.length - 1)) * chartWidth,
    y: top + chartHeight - (point.value / max) * chartHeight,
  }));
  const line = points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const area = `${line} L ${points.at(-1)?.x} ${top + chartHeight} L ${points[0].x} ${top + chartHeight} Z`;
  const labelIndexes = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);

  return (
    <article className={card}>
      <div className="mb-4">
        <h3 className="text-base font-extrabold text-[var(--omlu-text-primary)]">{title}</h3>
        {explanation && <p className="mt-1 text-xs text-[var(--omlu-text-secondary)]">{explanation}</p>}
      </div>
      <div className="relative h-[260px]" aria-label={accessibleSummary}>
        <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full overflow-visible" role="img">
          <title>{title}</title>
          <desc>{accessibleSummary}</desc>
          {[0, 0.5, 1].map((fraction) => {
            const y = top + chartHeight - fraction * chartHeight;
            return (
              <g key={fraction}>
                <line x1={left} x2={width - right} y1={y} y2={y} stroke="#e4e4e7" strokeWidth="1" />
                <text x={left - 10} y={y + 4} textAnchor="end" className="fill-zinc-400 text-[10px]">
                  {formatAxis(max * fraction, isCurrency)}
                </text>
              </g>
            );
          })}
          <path d={area} fill="rgba(249,115,22,.08)" />
          <path d={line} fill="none" stroke="#f97316" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((point, index) => (
            <g key={`${data[index].label}-${index}`}>
              <circle
                cx={point.x}
                cy={point.y}
                r={active === index ? 6 : 10}
                fill={active === index ? "#f97316" : "transparent"}
                stroke={active === index ? "#fff" : "transparent"}
                strokeWidth="3"
                tabIndex={0}
                aria-label={`${data[index].label}: ${isCurrency ? formatCurrency(data[index].value) : `${data[index].value} orders`}`}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                onPointerEnter={() => setActive(index)}
              />
              {labelIndexes.has(index) && (
                <text x={point.x} y={height - 12} textAnchor="middle" className="fill-zinc-500 text-[10px] font-semibold">
                  {data[index].label}
                </text>
              )}
            </g>
          ))}
        </svg>
        {active !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-xl border border-[var(--omlu-border-strong)] bg-[var(--omlu-primary-surface)] px-3 py-2 text-xs text-[var(--omlu-text-primary)] shadow-xl"
            style={{ left: `${Math.min(82, Math.max(18, (points[active].x / width) * 100))}%`, transform: "translateX(-50%)" }}
          >
            <div className="font-semibold text-[var(--omlu-text-secondary)]">{data[active].label}</div>
            <div className="mt-0.5 font-black">{isCurrency ? formatCurrency(data[active].value) : `${data[active].value} orders`}</div>
          </div>
        )}
      </div>
      <div className="sr-only">{accessibleSummary}</div>
    </article>
  );
}

function hourLabel(hour: number) {
  const start = new Date(2020, 0, 1, hour).toLocaleTimeString("en-IN", { hour: "numeric" });
  const end = new Date(2020, 0, 1, (hour + 1) % 24).toLocaleTimeString("en-IN", { hour: "numeric" });
  return `${start}–${end}`;
}

export function HourBarChart({
  data,
  title,
  accessibleSummary,
  multiDay = false,
}: {
  data: { hour: number; orders: number }[];
  title: string;
  accessibleSummary: string;
  multiDay?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const buckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orders: data.find((row) => row.hour === hour)?.orders ?? 0,
  }));
  const peak = buckets.reduce((best, row) => (row.orders > best.orders ? row : best), buckets[0]);
  const max = Math.max(...buckets.map((row) => row.orders), 1);

  if (!data.length) return <ChartEmptyState message="No hourly orders recorded for this period." />;

  return (
    <article className={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-extrabold text-[var(--omlu-text-primary)]">{title}</h3>
          <p className="mt-1 text-xs text-[var(--omlu-text-secondary)]">
            {multiDay ? "Total orders grouped by restaurant-local hour." : "Orders grouped by restaurant-local hour."}
          </p>
        </div>
        <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">
          Peak: {hourLabel(peak.hour)}
        </span>
      </div>
      <div className="mt-6 flex h-48 items-end gap-1.5" role="img" aria-label={accessibleSummary}>
        {buckets.map((row) => (
          <div key={row.hour} className="group relative flex h-full flex-1 items-end">
            <button
              type="button"
              aria-label={`${hourLabel(row.hour)}: ${row.orders} orders`}
              onFocus={() => setActive(row.hour)}
              onBlur={() => setActive(null)}
              onPointerEnter={() => setActive(row.hour)}
              onPointerLeave={() => setActive(null)}
              className={`min-h-0 w-full rounded-t-md focus-visible:z-10 ${row.hour === peak.hour ? "bg-orange-600" : "bg-orange-200 hover:bg-orange-400"} motion-safe:transition-[height,background-color]`}
              style={{ height: `${Math.max(3, (row.orders / max) * 100)}%`, minHeight: "3px" }}
            />
            {active === row.hour && (
              <div className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[var(--omlu-primary-surface)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--omlu-text-primary)] shadow-lg">
                {hourLabel(row.hour)} · {row.orders}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] font-semibold text-[var(--omlu-text-secondary)]">
        <span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>11 PM</span>
      </div>
      <div className="sr-only">{accessibleSummary}</div>
    </article>
  );
}

export function RankedList({
  title,
  rows,
  lowPerformance = false,
}: {
  title: string;
  rows: RankedRow[];
  lowPerformance?: boolean;
}) {
  const [sort, setSort] = useState<"revenue" | "quantity">("revenue");
  const sorted = useMemo(
    () => [...rows].sort((a, b) => lowPerformance ? a[sort] - b[sort] : b[sort] - a[sort]),
    [lowPerformance, rows, sort],
  );
  const max = Math.max(...sorted.map((row) => row[sort]), 1);
  const totalRevenue = rows.reduce((sum, row) => sum + row.revenue, 0);

  if (!rows.length) return <ChartEmptyState message={`No ${title.toLowerCase()} metrics available.`} />;

  return (
    <article className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-extrabold text-[var(--omlu-text-primary)]">{title}</h3>
        <div className="flex rounded-lg bg-[var(--omlu-muted-surface)] p-1" role="group" aria-label={`Sort ${title}`}>
          {(["revenue", "quantity"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSort(value)}
              aria-pressed={sort === value}
              className={`min-h-8 rounded-md px-2.5 text-[11px] font-bold capitalize ${sort === value ? "bg-[var(--omlu-primary-surface)] text-[var(--omlu-text-primary)] shadow-sm" : "text-[var(--omlu-text-secondary)]"}`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 space-y-4">
        {sorted.slice(0, 10).map((row, index) => (
          <div key={`${row.label}-${index}`}>
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--omlu-muted-surface)] text-xs font-black text-[var(--omlu-text-secondary)]">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="truncate font-bold text-[var(--omlu-text-primary)]" title={row.label}>{row.label}</span>
                  <span className="shrink-0 font-black text-[var(--omlu-text-primary)]">{formatCurrency(row.revenue)}</span>
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-[var(--omlu-text-secondary)]">
                  <span>{row.quantity} sold</span>
                  {totalRevenue > 0 && <span>{((row.revenue / totalRevenue) * 100).toFixed(1)}% of listed revenue</span>}
                </div>
              </div>
            </div>
            <div className="ml-10 mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--omlu-muted-surface)]">
              <div className="h-full rounded-full bg-orange-500 motion-safe:transition-[width]" style={{ width: `${Math.max(2, (row[sort] / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export function HorizontalBarList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number; revenue?: string | number }[];
  suffix?: string;
  formatVal?: (value: number) => string;
}) {
  return (
    <RankedList
      title={title}
      rows={rows.map((row) => ({ label: row.label, quantity: row.value, revenue: Number(row.revenue ?? 0) }))}
    />
  );
}

export function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className={`${card} flex min-h-52 flex-col items-center justify-center text-center`}>
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--omlu-muted-surface)] text-lg" aria-hidden>⌁</span>
      <p className="max-w-sm text-sm font-semibold text-[var(--omlu-text-secondary)]">{message}</p>
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className={`${card} h-[330px]`}>
      <div className="omlu-skeleton h-5 w-36 rounded" />
      <div className="mt-8 flex h-52 items-end gap-2">
        {[35, 58, 44, 75, 62, 88, 70, 92, 67, 82].map((height, index) => (
          <div key={index} className="omlu-skeleton flex-1 rounded-t" style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  );
}
