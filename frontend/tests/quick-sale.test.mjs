import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Quick Sale appears in the required admin navigation and dashboard actions", () => {
  const layout = read("app/admin/layout.tsx");
  const dashboard = read("app/admin/dashboard/AdminDashboardClient.tsx");
  assert.match(layout, /PendingPaymentsSidebarLink[\s\S]*\/admin\/quick-sale[\s\S]*Kitchen Dashboard/);
  assert.match(dashboard, /🧾 Quick Sale["'], ["']\/admin\/quick-sale/);
});

test("Quick Sale page exposes both workflows and operational lists", () => {
  const client = read("app/admin/quick-sale/QuickSaleClient.tsx");
  for (const copy of ["Takeaway Order", "Late Entry", "Active Takeaway Orders", "Completed Quick Sales Today", "Send to Kitchen", "Record Completed Sale"]) assert.ok(client.includes(copy));
  assert.match(client, /disabled=\{saving \|\| !Object\.keys\(cart\)\.length\}/);
  assert.match(client, /Could not load Quick Sale|Quick Sale request failed/);
});

test("Kitchen renders a dedicated Takeaway label", () => {
  const kitchen = read("app/kitchen/[restaurantSlug]/KitchenDashboardClient.tsx");
  assert.match(kitchen, /order\.table_number === "Takeaway"/);
});
