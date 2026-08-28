import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/admin/printing/PrintingClient.tsx", import.meta.url), "utf8");

test("Printing uses owner-facing OMLU Print states and one setup action", () => {
  assert.match(source, /OMLU Print/);
  assert.match(source, /Not set up/);
  assert.match(source, /Connection interrupted/);
  assert.match(source, /Needs attention/);
  assert.match(source, /"Set up printing"/);
  assert.doesNotMatch(source, /Printer Bridge Not Detected/);
  assert.doesNotMatch(source, /Download for Windows/);
  assert.doesNotMatch(source, /Download for macOS/);
});

test("connection state uses authoritative installation heartbeat and bounded setup polling", () => {
  assert.match(source, /listBridgeInstallations/);
  assert.match(source, /last_seen_at/);
  assert.match(source, /Date\.now\(\) - lastSeenMs < 90000/);
  assert.match(source, /setTimeout\(\(\) => setSetupStartedAt\(null\), 120000\)/);
  assert.match(source, /Last connected:/);
});

test("pairing is automatic and retains the existing two-challenge security handshake", () => {
  assert.match(source, /createLocalPairingCode/);
  assert.match(source, /createPairingChallenge/);
  assert.match(source, /confirmBridgePairing/);
  assert.match(source, /exchangeBridgeCredential/);
  assert.match(source, /completeLocalPairing/);
  assert.doesNotMatch(source, /Enter this 6-digit code/);
});

test("technical details remain secondary", () => {
  assert.match(source, /Advanced diagnostics/);
  assert.doesNotMatch(source, /Installation ID:/);
  assert.doesNotMatch(source, /profile\.host.*profile\.port/);
});
