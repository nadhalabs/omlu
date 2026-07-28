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

test("Quick Sale visibly blocks configurable items instead of using base price", () => {
  const client = read("app/admin/quick-sale/QuickSaleClient.tsx");
  assert.match(client, /has_options/);
  assert.match(client, /Use assisted ordering to choose specifications/);
  assert.match(client, /disabled=\{item\.has_options\}/);
});

test("Late Entry and Takeaway payments invoke the shared OMLU confirmation modal", () => {
  const client = read("app/admin/quick-sale/QuickSaleClient.tsx");
  assert.match(client, /useOmluUi\(\)/);
  assert.match(client, /confirmDialog\(\{ title: isLate/);
  for (const copy of ["Record late entry", "Confirm UPI payment", "Payment received", "Complete takeaway order", "Complete order"]) {
    assert.ok(client.includes(copy), copy);
  }
  assert.doesNotMatch(client, /(?:window|globalThis|self)\.(?:confirm|alert|prompt)/);
});

test("Ready and served Takeaways expose Cash and UPI payment actions", () => {
  const client = read("app/admin/quick-sale/QuickSaleClient.tsx");
  assert.match(client, /sale\.status === "ready" \|\| sale\.status === "served"/);
  assert.ok(client.includes("Confirm Cash Payment"));
  assert.ok(client.includes("Confirm UPI Payment"));
  assert.match(client, /\/api\/admin\/quick-sales\/\$\{encodeURIComponent\(sale\.public_token\)\}\/payment/);
});

test("Kitchen renders a dedicated Takeaway label", () => {
  const kitchen = read("app/kitchen/[restaurantSlug]/KitchenDashboardClient.tsx");
  assert.match(kitchen, /sourceHeading/);
  assert.match(kitchen, /TAKEAWAY/);
});

test("Kitchen cards prioritize source and item snapshots over internal metadata", () => {
  const kitchen = read("app/kitchen/[restaurantSlug]/KitchenDashboardClient.tsx");
  assert.match(kitchen, /text-2xl font-black/);
  assert.match(kitchen, /item\.quantity\} ×/);
  assert.match(kitchen, /option\.kitchen_display_name \|\| option\.option_name/);
  assert.match(kitchen, /Order \{order\.order_number\}/);
  assert.doesNotMatch(kitchen, /<span>Subtotal<\/span>/);
});
