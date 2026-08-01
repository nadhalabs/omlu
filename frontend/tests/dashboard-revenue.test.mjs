import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { buildHourlyChart } from "../lib/dashboardHourly.js";

const dashboard = fs.readFileSync(
  new URL("../app/admin/dashboard/AdminDashboardClient.tsx", import.meta.url),
  "utf8",
);
const billsRoute = fs.readFileSync(
  new URL("../../backend/app/routes/bills.py", import.meta.url),
  "utf8",
);
const quickSalesRoute = fs.readFileSync(
  new URL("../../backend/app/routes/quick_sales.py", import.meta.url),
  "utf8",
);

test("dashboard describes revenue as collected payments", () => {
  assert.match(dashboard, /Collected from paid bills and quick sales/);
  assert.doesNotMatch(dashboard, /From served orders/);
});

test("admin dashboard warns when backend health or realtime is unavailable", () => {
  assert.match(dashboard, /backendHealthUnavailable/);
  assert.match(dashboard, /Some backend services are unavailable/);
  assert.match(dashboard, /Real-time updates are reconnecting/);
  assert.match(dashboard, /\/api\/health\/ready/);
});

test("dashboard refetches in realtime and payment events reach its admin channel", () => {
  assert.match(dashboard, /onEvent:\s*\(\)\s*=>\s*void fetchDashboard\(\)/);
  assert.match(billsRoute, /restaurant_channel\(current_user\.restaurant_id, "admin"\)/);
  assert.match(quickSalesRoute, /restaurant_channel\(current_user\.restaurant_id, "admin"\)/);
});

test("dashboard recent activity uses stable grouped entries and links to full history", () => {
  assert.match(dashboard, /key=\{item\.id\}/);
  assert.match(dashboard, /View all activity/);
  assert.match(dashboard, /\/admin\/history\?view=orders/);
  assert.doesNotMatch(dashboard, /key=\{`\$\{item\.timestamp\}-\$\{idx\}`\}/);
});

test("dashboard maps the 24-bucket hourly API contract to visible fixed-height bars", () => {
  const chart = buildHourlyChart([{ hour: 2, orders: 1 }]);
  assert.equal(chart.buckets.length, 24);
  assert.equal(chart.buckets[2].orders, 1);
  assert.equal(chart.total, 1);
  assert.equal(chart.max, 1);
  assert.match(dashboard, /buildHourlyChart\(data\.orders_by_hour\)/);
  assert.match(dashboard, /hourlyChart\.total === 0/);
  assert.match(dashboard, /grid-rows-\[1fr_14px\]/);
  assert.match(dashboard, /height: `\$\{Math\.max\(heightPct, count > 0 \? 8 : 0\)\}%`/);
  assert.match(dashboard, /No orders placed yet today/);
});
