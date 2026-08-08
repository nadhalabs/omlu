import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const settings = read("app/admin/settings/AdminSettingsClient.tsx");
const billingCounter = read("app/admin/billing/BillingCounterClient.tsx");

test("Settings contains Printing section with stable id='printing'", () => {
  assert.match(settings, /<SettingsSection id="printing" title="Printing"/);
});

test("Settings explains browser printing vs Android direct thermal printing", () => {
  assert.ok(settings.includes("Print bills and receipts using your system print dialog."));
  assert.ok(settings.includes("Use the Android Operations app for direct LAN thermal printing."));
  assert.ok(settings.includes("Thermal printers and the Android device must be connected to the same local network."));
  assert.ok(settings.includes("Direct ESC/POS printing (IP address, port, paper width, and copies) is configured directly inside the Android app settings."));
  assert.ok(settings.includes("Web admin does not store raw TCP printer IP addresses, ports, paper widths, or copy preferences."));
});

test("Settings APK download link points to /downloads/omlu.apk", () => {
  assert.match(settings, /href="\/downloads\/omlu\.apk"/);
  assert.match(settings, /download/);
  assert.match(settings, /Download Operations App/);
});

test("Billing Counter Printer Setup action links to /admin/settings#printing", () => {
  assert.match(billingCounter, /href="\/admin\/settings#printing"/);
  assert.match(billingCounter, /Printer Setup/);
});

test("Billing Counter APK download action points to /downloads/omlu.apk", () => {
  assert.match(billingCounter, /href="\/downloads\/omlu\.apk"/);
  assert.match(billingCounter, /Download App/);
});

test("Printer Setup is rendered as guidance section and not treated as a bill queue", () => {
  // Tabs contain only 3 queue tabs
  assert.match(billingCounter, /type Tab = "requested" \| "awaiting_payment" \| "paid_recently";/);
  // Does not include printer_setup in queue items array
  assert.doesNotMatch(billingCounter, /tab === "printer_setup"/);
  // Printer setup is a separate guidance section card
  assert.match(billingCounter, /Configure direct LAN thermal printing in the OMLU Operations Android app\./);
});

test("Settings no longer contains outdated 'Billing uses Pending Payments' text", () => {
  assert.doesNotMatch(settings, /Billing uses Pending Payments/);
  assert.ok(settings.includes("Allow customers to request a waiter, water, or assistance from their table."));
});

test("Direct TCP printer fields (IP, port, paper width, copies) are absent from web settings", () => {
  assert.doesNotMatch(settings, /tcpIpAddress|tcpPort|paperWidth|tcp_port/i);
  assert.doesNotMatch(settings, /192\.168\./);
  assert.doesNotMatch(settings, /9100/);
});
