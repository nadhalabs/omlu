import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../app/order/[publicToken]/OrderTrackingClient.tsx", import.meta.url),
  "utf8"
);

test("healthy realtime uses slow periodic safety reconciliation", () => {
  assert.match(source, /realtimeStatus === "live" \? 75_000 : 7_500/);
  assert.doesNotMatch(source, /}, 5000\)/);
  assert.match(source, /window\.setInterval\([\s\S]*?fetchOrder\(false\)[\s\S]*?intervalMs/);
});

test("degraded realtime retains fast fallback polling", () => {
  assert.match(source, /const intervalMs = realtimeStatus === "live" \? 75_000 : 7_500/);
  assert.match(source, /\[fetchOrder, orderData, realtimeStatus\]/);
});

test("hidden tabs skip periodic reconciliation", () => {
  assert.match(source, /document\.visibilityState !== "visible"\) return;/);
});

test("reconnect, visibility restoration, and online restoration reconcile immediately", () => {
  assert.match(source, /onReconnect:\s*\(\) => void fetchOrder\(false\)/);
  assert.match(source, /document\.visibilityState === "visible"[\s\S]*?fetchOrder\(false\)/);
  assert.match(source, /window\.addEventListener\("online", handleOnline\)/);
  assert.match(source, /const handleOnline = \(\) => fetchOrder\(false\)/);
});

test("simultaneous reconciliation triggers are coalesced", () => {
  assert.match(source, /fetchInFlightRef = useRef\(false\)/);
  assert.match(source, /if \(fetchInFlightRef\.current\)[\s\S]*?pendingFetchRef\.current = true;[\s\S]*?return;/);
  assert.match(source, /do \{[\s\S]*?\} while \(pendingFetchRef\.current\)/);
});

test("realtime events still reconcile authoritative order state", () => {
  assert.match(source, /onEvent:\s*\(\) => void fetchOrder\(false\)/);
  assert.match(source, /const data = await getPublicOrder/);
  assert.match(source, /setOrderData\(data\)/);
});
