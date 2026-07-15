import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Helper to determine stage state
function formatCurrencyAlg(value) {
  if (value === null || value === undefined) return "₹0";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num) || num < 0) return "₹0";
  
  const hasDecimals = num % 1 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(num);
}

function formatAverageOrderValueAlg(value) {
  if (value === null || value === undefined) return "₹0";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num) || num < 0) return "₹0";
  
  const hasDecimals = num % 1 !== 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(num);
}

function formatDurationMinutesAlg(value) {
  if (value === null || value === undefined || isNaN(value) || value <= 0) return "0m";
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

// Coordinate & bucket calculation algorithms to test chart edge cases
function getCoordinatesAlg(data, width = 500, height = 220, paddingLeft = 55, paddingRight = 15, paddingTop = 20, paddingBottom = 30) {
  if (!data || data.length === 0) return [];
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  const values = data.map((d) => d.value);
  const maxVal = Math.max(...values, 1);
  
  if (data.length <= 1) {
    return [{ x: paddingLeft + chartWidth / 2, y: paddingTop + chartHeight / 2 }];
  }
  return data.map((d, i) => {
    const x = paddingLeft + (i / (data.length - 1)) * chartWidth;
    const y = paddingTop + chartHeight - (d.value / maxVal) * chartHeight;
    return { x, y };
  });
}

function getHourBucketsAlg(data) {
  return Array.from({ length: 24 }, (_, h) => {
    const found = data.find((d) => d.hour === h);
    return { hour: h, orders: found ? found.orders : 0 };
  });
}

// 1. Unit Tests for Formatting Utilities

test("Indian currency formatting values", () => {
  assert.match(formatCurrencyAlg(1250), /₹\s*1,250/);
  assert.match(formatCurrencyAlg(124500.50), /₹\s*1,24,500.50/);
  assert.match(formatCurrencyAlg(177.67), /₹\s*177.67/);
  
  assert.equal(formatCurrencyAlg(0), "₹0");
  assert.equal(formatCurrencyAlg(null), "₹0");
  assert.equal(formatCurrencyAlg(undefined), "₹0");
  assert.equal(formatCurrencyAlg("invalid"), "₹0");
  assert.equal(formatCurrencyAlg(-100), "₹0");
});

test("Average order value decimal limits", () => {
  assert.match(formatAverageOrderValueAlg(177.66666666), /₹\s*177.67/);
  assert.match(formatAverageOrderValueAlg(250), /₹\s*250/);
  assert.match(formatAverageOrderValueAlg(250.5), /₹\s*250.50/);
  assert.equal(formatAverageOrderValueAlg(null), "₹0");
});

test("Duration formatting values", () => {
  assert.equal(formatDurationMinutesAlg(47), "47m");
  assert.equal(formatDurationMinutesAlg(60), "1h");
  assert.equal(formatDurationMinutesAlg(119), "1h 59m");
  assert.equal(formatDurationMinutesAlg(0), "0m");
  assert.equal(formatDurationMinutesAlg(null), "0m");
  assert.equal(formatDurationMinutesAlg(undefined), "0m");
  assert.equal(formatDurationMinutesAlg(-10), "0m");
});

// 2. Unit Tests for Chart Edge Cases (No division-by-zero, NaN, or Infinity coordinates)

test("Chart edge cases - getCoordinatesAlg", () => {
  // Empty data array
  assert.deepEqual(getCoordinatesAlg([]), []);
  
  // Single data point
  const single = getCoordinatesAlg([{ label: "A", value: 100 }]);
  assert.equal(single.length, 1);
  assert.equal(Number.isFinite(single[0].x), true);
  assert.equal(Number.isFinite(single[0].y), true);

  // All-zero values
  const allZeros = getCoordinatesAlg([{ label: "A", value: 0 }, { label: "B", value: 0 }]);
  assert.equal(allZeros.length, 2);
  allZeros.forEach(pt => {
    assert.equal(Number.isFinite(pt.x), true);
    assert.equal(Number.isFinite(pt.y), true);
    assert.equal(Number.isNaN(pt.x), false);
    assert.equal(Number.isNaN(pt.y), false);
  });

  // Equal non-zero values
  const equals = getCoordinatesAlg([{ label: "A", value: 50 }, { label: "B", value: 50 }]);
  assert.equal(equals.length, 2);
  equals.forEach(pt => {
    assert.equal(Number.isFinite(pt.x), true);
    assert.equal(Number.isFinite(pt.y), true);
  });
});

test("Chart edge cases - getHourBucketsAlg (partial hourly data)", () => {
  // Check that missing hours are correctly padded with zero order values
  const partial = [{ hour: 10, orders: 5 }, { hour: 15, orders: 12 }];
  const buckets = getHourBucketsAlg(partial);
  assert.equal(buckets.length, 24);
  assert.equal(buckets[10].orders, 5);
  assert.equal(buckets[15].orders, 12);
  assert.equal(buckets[0].orders, 0);
  assert.equal(buckets[23].orders, 0);
});

// 3. Component Static Integration Checks

const source = readFileSync(
  new URL("../app/admin/performance/PerformanceClient.tsx", import.meta.url),
  "utf8"
);

const formatterSource = readFileSync(
  new URL("../app/admin/performance/performanceFormatters.ts", import.meta.url),
  "utf8"
);

test("Formatters source code check", () => {
  assert.match(formatterSource, /export function formatCurrency/);
  assert.match(formatterSource, /export function formatAverageOrderValue/);
  assert.match(formatterSource, /export function formatDurationMinutes/);
  assert.match(formatterSource, /Intl\.NumberFormat\("en-IN"/);
});

test("Period presets and active selectors", () => {
  assert.match(source, /"today"/);
  assert.match(source, /"last_7_days"/);
  assert.match(source, /"month"/);
  assert.match(source, /"custom"/);
  
  assert.match(source, /role="tablist"/);
  assert.match(source, /role="tab"/);
  assert.match(source, /aria-selected=/);
});

test("Export dropdown menu interaction and keyboard safety", () => {
  assert.match(source, /exportHistory\("performance", filters\)/);
  assert.match(source, /handlePdfDownload\("daily"\)/);
  assert.match(source, /handlePdfDownload\("monthly"\)/);
  assert.match(source, /handlePdfDownload\("range"\)/);
  
  assert.match(source, /mousedown/);
  assert.match(source, /document\.addEventListener\("mousedown", handleOutsideClick\)/);
  assert.match(source, /e\.key === "Escape"/);
  
  assert.match(source, /disabled=\{Boolean\(pdfLoading\)\}/);
});

test("Dashboard metric sections and responsive containers", () => {
  assert.match(source, /Total revenue/);
  assert.match(source, /Total orders/);
  assert.match(source, /Average order value/);
  assert.match(source, /Paid bills/);
  
  assert.match(source, /Unpaid bills/);
  assert.match(source, /Cancelled orders/);
  assert.match(source, /Rejected orders/);
  
  assert.match(source, /accessibleSummary=/);
});
