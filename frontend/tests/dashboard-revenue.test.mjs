import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

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

test("dashboard refetches in realtime and payment events reach its admin channel", () => {
  assert.match(dashboard, /onEvent:\s*\(\)\s*=>\s*void fetchDashboard\(\)/);
  assert.match(billsRoute, /restaurant_channel\(current_user\.restaurant_id, "admin"\)/);
  assert.match(quickSalesRoute, /restaurant_channel\(current_user\.restaurant_id, "admin"\)/);
});
