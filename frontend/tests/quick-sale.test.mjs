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
  for (const copy of ["Takeaway", "Late Entry", "Active Takeaway Orders", "Completed Quick Sales Today", "Send to Kitchen", "Record Completed Sale"]) assert.ok(client.includes(copy));
  assert.match(client, /disabled=\{saving \|\| previewLoading \|\| !preview \|\| !cart\.length\}/);
  assert.match(client, /Could not load Quick Sale|Quick Sale request failed/);
});

test("Quick Sale opens specifications and preserves configuration-aware lines", () => {
  const client = read("app/admin/quick-sale/QuickSaleClient.tsx");
  assert.match(client, /has_options/);
  assert.match(client, /Select options/);
  assert.match(client, /selected_options/);
  assert.match(client, /Edit options/);
  assert.match(client, /optionSignature/);
  assert.match(client, /idempotencyKey\.current/);
  assert.doesNotMatch(client, /Use assisted ordering to choose specifications/);
});

test("Quick Sale presents a responsive POS picker and sticky operational summary", () => {
  const client = read("app/admin/quick-sale/QuickSaleClient.tsx");
  for (const copy of ["Sale type", "Choose type", "Add items", "Review", "Confirm", "No items added yet", "Add items from the menu to start this sale."]) assert.ok(client.includes(copy));
  assert.match(client, /aria-label="Sale type"/);
  assert.match(client, /aria-pressed=\{active\}/);
  assert.match(client, /active \? "border-orange-500 bg-orange-50/);
  assert.match(client, /Food still needs preparation/);
  assert.match(client, /Food was already served or handed over/);
  assert.match(client, /setSaleType\(mode\.value\)/);
  assert.match(client, /lg:grid-cols-\[minmax\(0,1\.35fr\)_minmax\(320px,0\.65fr\)\]/);
  assert.match(client, /lg:sticky lg:top-6/);
  assert.match(client, /Search menu items/);
  assert.match(client, /aria-label="Search menu items"/);
  assert.match(client, /pointer-events-none absolute left-4 top-1\/2/);
  assert.match(client, /h-12 w-full rounded-xl border border-zinc-300/);
  assert.match(client, /pl-11/);
  assert.doesNotMatch(client, /focus-within:border-orange-500/);
  assert.match(client, /bg-white/);
});

test("Quick Sale specification dialog exposes required radio choices and an explained action", () => {
  const client = read("app/admin/quick-sale/QuickSaleClient.tsx");
  assert.match(client, /Select the required options/);
  assert.match(client, /role=\{multi \? "group" : "radiogroup"\}/);
  assert.match(client, /role=\{multi \? undefined : "radio"\}/);
  assert.match(client, /aria-checked=\{multi \? undefined : checked\}/);
  assert.match(client, /checked \? "border-orange-500 bg-orange-50 text-zinc-950"/);
  assert.match(client, /Select all required options to continue\./);
  assert.match(client, /disabled=\{!requiredSelectionsComplete\(customisingItem, selectedOptionsFromDraft\(\)\)\}/);
  assert.match(client, /Add to order["'] : ["']Update order/);
  assert.match(client, /optionPrice\(customisingItem, selectedOptionsFromDraft\(\)\) \* draftQuantity/);
  assert.match(client, /aria-label="Decrease quantity"/);
  assert.match(client, /aria-label="Increase quantity"/);
  assert.match(client, /event\.key !== "Tab"/);
  assert.match(client, /max-h-\[calc\(100dvh-1\.5rem\)\]/);
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
  assert.match(quickSale, /\/api\/admin\/quick-sales\/preview/);
  assert.match(quickSale, /new AbortController\(\)/);
  assert.match(quickSale, /requestId === previewRequest\.current/);
  assert.match(quickSale, /CGST \{preview\.cgst_rate\}%/);
  assert.match(quickSale, /SGST \{preview\.sgst_rate\}%/);
  assert.match(quickSale, /IGST \{preview\.igst_rate\}%/);
  assert.match(quickSale, /Grand total/);
  const previewProxy = read("app/api/admin/quick-sales/preview/route.ts");
  assert.match(previewProxy, /proxyAdminRequest\(request, "\/quick-sales\/preview"\)/);
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
