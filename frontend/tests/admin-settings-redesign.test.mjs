import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const settings = fs.readFileSync(new URL("../app/admin/settings/AdminSettingsClient.tsx", import.meta.url), "utf8");

test("Admin Settings uses the owner-focused section order", () => {
  const headings = ["General", "Billing &amp; GST", "Google Reviews", "Operations", "Printing", "Appearance", "Legal &amp; Policies"];
  let previous = -1;
  for (const heading of headings) {
    const position = settings.indexOf(`title="${heading}"`);
    assert.ok(position > previous, `${heading} should appear in the required order`);
    previous = position;
  }
});

test("restaurant settings preserve loading, discard, save, and backend payload contracts", () => {
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

test("Operations exposes restaurant-facing kitchen workflow choices", () => {
  assert.match(settings, /kitchen_mode: kitchenMode/);
  assert.match(settings, /Kitchen System/);
  assert.match(settings, /Kitchen Display/);
  assert.match(settings, /Direct Kitchen Print/);
  assert.doesNotMatch(settings, />direct_print</);
});

test("persisted kitchen mode is reconciled into an obvious selected card", () => {
  assert.match(settings, /setKitchenMode\(data\.kitchen_mode\)/);
  assert.match(settings, /selected=\{kitchenMode === "kds"\}/);
  assert.match(settings, /selected=\{kitchenMode === "direct_print"\}/);
  assert.match(settings, /role="radiogroup" aria-label="Kitchen System"/);
  assert.match(settings, /role="radio" aria-checked=\{selected\}/);
  assert.match(settings, /data-selected=\{selected\}/);
  assert.match(settings, /border-orange-600 bg-orange-500\/10 ring-1 ring-orange-500\/30/);
  assert.match(settings, /selected \? "border-orange-600 bg-orange-600 text-white"/);
});

test("fresh loads and saves initialize both editable controls from persisted server state", () => {
  assert.match(settings, /useState<"kds" \| "direct_print" \| null>\(null\)/);
  assert.match(settings, /useState<boolean \| null>\(null\)/);
  const applySettings = settings.match(/const applySettings = useCallback\(\(data:[\s\S]*?\n  }, \[\]\);/)?.[0] || "";
  assert.match(applySettings, /setSettings\(data\)/);
  assert.match(applySettings, /setKitchenMode\(data\.kitchen_mode\)/);
  assert.match(applySettings, /setServiceRequestsEnabled\(data\.service_requests_enabled\)/);
  assert.match(settings, /applySettings\(await getRestaurantSettings\(\)\)/);
  assert.match(settings, /applySettings\(updated\)/);
  assert.match(settings, /applySettings\(settings\)/);
  assert.equal((settings.match(/applySettings\(/g) || []).length, 3, "draft reconciliation should only happen on load, save, and discard");
});

test("service request control is a compact accessible persisted switch and participates in dirty state", () => {
  assert.match(settings, /checked=\{serviceRequestsEnabled === true\} onChange=\{setServiceRequestsEnabled\}/);
  assert.match(settings, /role="switch" aria-checked=\{checked\}/);
  assert.match(settings, /h-6 w-11/);
  assert.match(settings, /focus-visible:ring-2/);
  assert.match(settings, /serviceRequestsEnabled !== settings\.service_requests_enabled/);
  assert.match(settings, /service_requests_enabled: serviceRequestsEnabled \?\? settings\?\.service_requests_enabled/);
});

test("server-backed edits use a sticky persisted-state save bar", () => {
  assert.match(settings, /const hasUnsavedChanges = settings !== null/);
  assert.match(settings, /kitchenMode !== settings\.kitchen_mode/);
  assert.match(settings, /\{hasUnsavedChanges && \(/);
  assert.match(settings, /aria-label="Unsaved settings"/);
  assert.match(settings, /fixed inset-x-4 bottom-4/);
  assert.match(settings, /hasUnsavedChanges \? "pb-28 sm:pb-24"/);
  assert.match(settings, />Unsaved changes</);
  assert.match(settings, />Discard</);
  assert.match(settings, /Save changes/);
  assert.doesNotMatch(settings, />Reset<\/button>/);
  assert.doesNotMatch(settings, />Save Settings<\/button>/);
});

test("save and discard reconcile against the last persisted response", () => {
  assert.match(settings, /const updated = await updateRestaurantSettings\(updateData\)/);
  assert.match(settings, /applySettings\(updated\)/);
  assert.match(settings, /const discardChanges = \(\) =>/);
  assert.match(settings, /applySettings\(settings\)/);
  assert.match(settings, /catch \(err\)[\s\S]*setError\(/);
  assert.doesNotMatch(settings.match(/catch \(err\)[\s\S]*?finally/)?.[0] || "", /applySettings/);
});

test("Appearance remains outside server dirty-state tracking", () => {
  const dirtyState = settings.match(/const hasUnsavedChanges[\s\S]*?\n  \);/)?.[0] || "";
  assert.ok(dirtyState);
  assert.doesNotMatch(dirtyState, /theme|appearance/i);
  assert.match(settings, /Appearance is saved on this device immediately and is separate from restaurant settings/);
});

test("Print Bridge exposes unreachable, detected, and paired UX states", () => {
  assert.match(settings, /Printer Bridge is not running on this device\./);
  assert.match(settings, /Pair this device to your restaurant before configuring printers\./);
  assert.match(settings, /label="Bridge"/);
  assert.match(settings, /label="Authorization"/);
  assert.match(settings, /label="Pairing"/);
  assert.match(settings, /"Pair Bridge"/);
  assert.match(settings, /"Pair Again"/);
});

test("pairing uses existing challenge, exchange, public-key, and local confirmation contracts", () => {
  for (const call of ["createLocalPairingCode", "createPairingChallenge", "confirmBridgePairing", "exchangeBridgeCredential", "getPrintBridgePublicKey", "completeLocalPairing"]) {
    assert.match(settings, new RegExp(`${call}\\(`));
  }
  assert.doesNotMatch(settings, /console\.(?:log|error).*exchange|console\.(?:log|error).*credential/i);
  assert.match(settings, /INVALID_PAIRING|WRONG_PAIRING|expired|pairing code/i);
  assert.match(settings, /Printer Bridge is not paired yet\./);
});

test("unpaired bridge locks kitchen configuration and paired bridge unlocks it", () => {
  assert.match(settings, /Pair the Desktop Printer Bridge before configuring a kitchen printer\./);
  assert.match(settings, /disabled=\{!printerActionsAvailable\}/);
  assert.match(settings, /disabled=\{kitchenPrinterBusy \|\| !printerActionsAvailable/);
});
