import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const settings = read("app/admin/settings/AdminSettingsClient.tsx");
const printBridge = read("lib/print_bridge.ts");
const printService = read("lib/print_service.ts");
const billingCounter = read("app/admin/billing/BillingCounterClient.tsx");
const api = read("lib/api.ts");

test("Kitchen and Billing printer configurations are independent", () => {
  // Admin settings contains separate cards & state for kitchen vs billing printer
  assert.match(settings, /id="kitchen-printer"/);
  assert.match(settings, /id="billing-printer"/);
  assert.match(settings, /kitchenPrinterHost/);
  assert.match(settings, /billingPrinterHost/);
  assert.match(settings, /saveKitchenPrinter/);
  assert.match(settings, /saveBillingPrinter/);
  assert.match(settings, /runKitchenPrinterTest/);
  assert.match(settings, /runBillingPrinterTest/);

  // Both forms accept port inputs defaulting to 9100
  assert.match(settings, /setKitchenPrinterPort/);
  assert.match(settings, /setBillingPrinterPort/);

  // Bridge client helper functions are separate
  assert.match(printBridge, /configureKitchenPrinter/);
  assert.match(printBridge, /configureBillingPrinter/);
  assert.match(printBridge, /testKitchenPrinter/);
  assert.match(printBridge, /testBillingPrinter/);
  assert.match(printBridge, /\/kitchen-printer\/setup/);
  assert.match(printBridge, /\/billing-printer\/setup/);
  assert.match(printBridge, /\/kitchen-printer\/test/);
  assert.match(printBridge, /\/billing-printer\/test/);
});

test("Pair Again UI flow handles INSTALLATION_UNAUTHORIZED cleanly", () => {
  // Admin settings checks backend authorization separately using listBridgeInstallations
  assert.match(settings, /listBridgeInstallations/);
  assert.match(api, /export async function listBridgeInstallations/);
  assert.match(settings, /checkBackendAuth/);
  assert.match(settings, /setBackendAuthorized/);
  assert.match(settings, /INSTALLATION_UNAUTHORIZED/);
  assert.match(settings, /Printer Bridge authorization expired or was revoked/);

  // Pair Again button appears when unauthorized
  assert.match(settings, /showPairAgain/);
  assert.match(settings, /Pair Again/);

  // Printer inputs and test buttons are locked when backend authorization is invalid
  assert.match(settings, /printerActionsAvailable = Boolean\(bridgeHealth\?\.paired && backendAuthorized\)/);
  assert.match(settings, /disabled=\{!printerActionsAvailable\}/);
});

test("Issue & Print routes to Billing Printer and falls back to iframe without double invoicing", () => {
  // printService checks billing_printer_configured & billing_printer_host
  assert.match(printService, /bridge\.billing_printer_configured && bridge\.billing_printer_host/);

  // Billing counter calls issueStaffBill first, then printIssuedBill
  const issueIdx = billingCounter.indexOf("issueStaffBill");
  const printIdx = billingCounter.indexOf("printIssuedBill");
  assert.ok(issueIdx > -1 && printIdx > -1 && issueIdx < printIdx, "issueStaffBill must be called before printIssuedBill");

  // Reprint does not re-issue bill
  assert.match(billingCounter, /handleReprint/);
  const reprintCode = billingCounter.slice(billingCounter.indexOf("async function handleReprint"));
  assert.doesNotMatch(reprintCode, /issueStaffBill/);
  assert.match(reprintCode, /printIssuedBill/);
});

test("Bridge health normalization includes billing printer properties", () => {
  assert.match(printBridge, /billing_printer_configured/);
  assert.match(printBridge, /billing_printer_name/);
  assert.match(printBridge, /billing_printer_host/);
  assert.match(printBridge, /billing_printer_port/);
  assert.match(printBridge, /billing_printer_configured: false/);
});
