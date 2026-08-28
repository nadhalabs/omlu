import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ui = readFileSync(new URL("../app/admin/printing/PrintingClient.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("../lib/print_bridge.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("../../desktop/omlu_print_bridge/src/server.ts", import.meta.url), "utf8");

test("owner discovery is automatic, explicit, and assigns either printer role", () => {
  assert.match(ui, /Finding printers…/);
  assert.match(ui, /Find printers/);
  assert.match(ui, /Use for Billing/);
  assert.match(ui, /Use for Kitchen/);
  assert.match(ui, /Can&apos;t find your printer\? Add manually/);
  assert.match(ui, /profiles\.length === 0 && !discoveryAttempted\.current/);
});

test("discovery and profile mutations require short-lived action tokens", () => {
  assert.match(ui, /requestPrintBridgeToken\(action, bridge\.installation_id\)/);
  assert.match(client, /discoverPrinters\(token: string/);
  assert.match(client, /Authorization: `Bearer \$\{token\}`/);
  assert.match(server, /authorizeLocalAction\(req, 'printer:configure'\)/);
  assert.match(server, /INSTALLATION_OR_TENANT_MISMATCH/);
});

test("ready requires a successful test and success copy does not claim physical printing", () => {
  assert.match(ui, /!profile\.lastSuccessfulTestAt/);
  assert.match(ui, /Test required/);
  assert.match(ui, /Test job sent/);
  assert.doesNotMatch(ui, /Test print successful/);
});

test("manual technical fields remain inside the fallback dialog", () => {
  assert.match(ui, /Manual setup is for printers that are not installed/);
  assert.match(ui, /Private local IP address/);
  assert.match(ui, /Installed printer name/);
  assert.match(server, /isSafePrivatePrinterHost/);
  assert.match(server, /INVALID_NETWORK_TARGET/);
});
