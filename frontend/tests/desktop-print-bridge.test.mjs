import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const settings = read("app/admin/settings/AdminSettingsClient.tsx");
const billingCounter = read("app/admin/billing/BillingCounterClient.tsx");
const printBridge = read("lib/print_bridge.ts");

test("Desktop Print Bridge client connects to 127.0.0.1:24242/v1 and implements print jobs & setup", () => {
  assert.match(printBridge, /http:\/\/127\.0\.0\.1:24242\/v1/);
  assert.match(printBridge, /checkBridgeHealth/);
  assert.match(printBridge, /sendPrintJobToBridge/);
  assert.match(printBridge, /testBridgePrinter/);
  assert.match(printBridge, /saveBridgeSettings/);
});

test("Admin Settings renders Desktop Print Bridge section with dynamic status and developer package link", () => {
  assert.match(settings, /Windows Printer Bridge/);
  assert.match(settings, /checkBridgeHealth/);
  assert.match(settings, /127\.0\.0\.1:24242/);
  assert.match(settings, /Not running/);
  assert.match(settings, /Bridge detected/);
  assert.match(settings, /Paired/);
  assert.doesNotMatch(settings, /● Bridge Support Active/);
  assert.match(settings, /Download Windows Bridge \(Developer \/ Hardware Test Package\)/);
  assert.match(settings, /href="\/downloads\/omlu-print-bridge-developer-package\.zip"/);
});

test("Billing Counter implements print service integration with Print Bridge and hidden iframe fallback", () => {
  const printService = read("lib/print_service.ts");
  assert.match(printService, /checkBridgeHealth/);
  assert.match(printService, /getStaffBillReceiptPayload/);
  assert.match(printService, /requestPrintBridgeToken/);
  assert.match(printService, /sendPrintJobToBridge/);
  assert.match(printService, /iframe/);

  assert.match(billingCounter, /printIssuedBill/);
  assert.match(billingCounter, /Print complete/);
  assert.match(billingCounter, /Bill issued, but printing failed\./);
  assert.doesNotMatch(billingCounter, /window\.open/);
});
