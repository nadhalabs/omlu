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
  assert.match(client, /disabled=\{saving \|\| !cart\.length\}/);
  assert.match(client, /Could not load Quick Sale|Quick Sale request failed/);
});

test("Quick Sale opens specifications and preserves configuration-aware lines", () => {
  const client = read("app/admin/quick-sale/QuickSaleClient.tsx");
  assert.match(client, /has_options/);
  assert.match(client, /Choose options/);
  assert.match(client, /selected_options/);
  assert.match(client, /Edit specifications/);
  assert.match(client, /optionSignature/);
  assert.match(client, /idempotencyKey\.current/);
  assert.doesNotMatch(client, /Use assisted ordering to choose specifications/);
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

test("Quick Sale displays backend-authoritative GST snapshots and totals", () => {
  const quickSale = read("app/admin/quick-sale/QuickSaleClient.tsx");
  assert.match(quickSale, /gst_enabled/);
  assert.match(quickSale, /tax_amount/);
  assert.match(quickSale, /grand_total/);
  assert.match(quickSale, /Includes GST/);
  assert.match(quickSale, /authoritative GST total/);
  assert.doesNotMatch(quickSale, /subtotal\s*\*\s*.*gst|gst.*\/\s*100/i);
});

test("Only served Takeaways expose Cash and UPI payment actions", () => {
  const client = read("app/admin/quick-sale/QuickSaleClient.tsx");
  assert.match(client, /sale\.status === "served"/);
  assert.doesNotMatch(client, /sale\.status === "ready" \|\| sale\.status === "served"/);
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
