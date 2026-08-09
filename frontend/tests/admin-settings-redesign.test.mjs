import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const settings = fs.readFileSync(new URL("../app/admin/settings/AdminSettingsClient.tsx", import.meta.url), "utf8");

test("Admin Settings uses the owner-focused section order", () => {
  const headings = ["General", "Billing &amp; GST", "Operations", "Printing", "Appearance", "Legal &amp; Policies"];
  let previous = -1;
  for (const heading of headings) {
    const position = settings.indexOf(`title="${heading}"`);
    assert.ok(position > previous, `${heading} should appear in the required order`);
    previous = position;
  }
});

test("restaurant settings preserve loading, reset, save, and backend payload contracts", () => {
  assert.match(settings, /getRestaurantSettings\(\)/);
  assert.match(settings, /updateRestaurantSettings\(updateData\)/);
  for (const field of [
    "timezone", "order_prefix", "service_requests_enabled", "gst_enabled", "gstin",
    "legal_business_name", "registered_billing_address", "gst_state_name",
    "gst_state_code", "default_gst_rate", "tax_mode", "invoice_prefix",
  ]) assert.match(settings, new RegExp(`${field}:`), `missing payload field ${field}`);
  assert.match(settings, /disabled=\{saving\}/);
  assert.match(settings, /applySettings\(settings\)/);
  assert.match(settings, /Settings saved successfully\./);
});

test("Settings uses responsive controls without exposing diagnostics by default", () => {
  assert.match(settings, /md:grid-cols-2/);
  assert.match(settings, /lg:grid-cols-3/);
  assert.match(settings, /min-w-0/);
  assert.match(settings, /<details/);
  assert.match(settings, /Advanced \/ Troubleshooting/);
  assert.match(settings, /role="switch"/);
  assert.match(settings, /type="radio"/);
  assert.match(settings, /id="currency" disabled/);
});

test("Appearance stays device-local and outside restaurant save semantics", () => {
  assert.match(settings, /<ThemeToggle/);
  assert.match(settings, /Appearance is saved on this device immediately/);
  const payload = settings.match(/const updateData:[\s\S]*?\n      };/)?.[0] || "";
  assert.doesNotMatch(payload, /theme/i);
});

test("Billing and GST defaults to a summary with an explicit edit workflow", () => {
  assert.match(settings, /useState\(false\).*gstEditing|gstEditing.*useState\(false\)/s);
  for (const label of [
    "GST status", "GSTIN", "Legal business name", "State + state code",
    "Default GST rate", "Tax mode", "Invoice prefix", "Registered billing address",
  ]) assert.ok(settings.includes(label), `missing summary field ${label}`);
  assert.match(settings, /Edit GST settings/);
  assert.match(settings, />Cancel<\/button>/);
  assert.match(settings, /Save GST settings/);
  assert.match(settings, /data-save-scope="gst"/);
  assert.match(settings, /setGstEditing\(false\)/);
});

test("owner-facing GST copy avoids backend implementation language", () => {
  const billingSection = settings.match(/<SettingsSection title="Billing &amp; GST"[\s\S]*?<SettingsSection title="Operations"/)?.[0] || "";
  assert.doesNotMatch(billingSection, /backend/i);
  assert.match(billingSection, /used on customer bills and tax invoices/);
});
