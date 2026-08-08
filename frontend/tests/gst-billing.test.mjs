import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const settings = fs.readFileSync(new URL("../app/admin/settings/AdminSettingsClient.tsx", import.meta.url), "utf8");
const bill = fs.readFileSync(new URL("../app/bill/[sessionToken]/BillClient.tsx", import.meta.url), "utf8");

test("Admin Settings exposes restaurant-scoped Billing and GST configuration", () => {
  for (const label of [
    "Billing &amp; GST", "Enable GST", "GSTIN", "Legal business name",
    "Registered billing address", "State", "State code",
    "Default GST rate", "Tax mode", "Invoice prefix",
  ]) assert.ok(settings.includes(label), `missing ${label}`);
  assert.match(settings, /value="exclusive"/);
  assert.match(settings, /value="inclusive"/);
});

test("customer printable bill displays backend-provided GST snapshots", () => {
  for (const field of [
    "bill.taxable_amount", "bill.cgst_amount", "bill.sgst_amount",
    "bill.igst_amount", "bill.gstin", "bill.invoice_number", "bill.invoice_date",
  ]) assert.ok(bill.includes(field), `missing ${field}`);
  assert.doesNotMatch(bill, /subtotal\s*\*\s*.*gst|gst.*\/\s*100/i);
});
