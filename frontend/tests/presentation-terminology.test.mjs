import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("presentation mappings use business language for internal values", () => {
  const source = read("lib/presentation.ts");
  assert.match(source, /payment_pending: "Payment Pending"/);
  assert.match(source, /counter_upi: "UPI"/);
  assert.match(source, /if \(value === "b2b"\) return "GST Invoice"/);
  assert.match(source, /if \(value === "b2c"\) return "Regular Sale"/);
});

test("history and GST screens do not render raw internal values", () => {
  const files = [
    "app/admin/orders/history/OrderHistoryClient.tsx",
    "app/admin/bills/history/BillHistoryClient.tsx",
    "app/admin/sessions/history/SessionHistoryClient.tsx",
    "app/admin/gst/GstClient.tsx",
  ];
  const source = files.map(read).join("\n");
  assert.doesNotMatch(source, />\{order\.status\}</);
  assert.doesNotMatch(source, />\{bill\.payment_status\}</);
  assert.doesNotMatch(source, />\{session\.payment_status\}</);
  assert.doesNotMatch(source, /String\(r\.customer_tax_type/);
});

test("staff proxy fallbacks do not expose backend implementation wording", () => {
  const files = [
    "app/api/staff/bills/[billNumber]/issue/route.ts",
    "app/api/staff/bills/[billNumber]/confirm-counter-payment/route.ts",
    "app/api/staff/bills/[billNumber]/payment-assistance/route.ts",
    "app/api/staff/bills/[billNumber]/reopen-ordering/route.ts",
    "app/api/staff/service-requests/[requestId]/resolve/route.ts",
    "app/api/staff/service-requests/route.ts",
    "app/api/staff/sessions/[sessionToken]/close-empty/route.ts",
    "app/api/staff/sessions/route.ts",
  ];
  assert.doesNotMatch(files.map(read).join("\n"), /Backend error/);
});
