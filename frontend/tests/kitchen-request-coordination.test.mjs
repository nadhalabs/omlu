import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KitchenBoardRefreshCoordinator } from "../lib/kitchenBoardRefresh.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(
  path.join(root, "app/kitchen/[restaurantSlug]/KitchenDashboardClient.tsx"),
  "utf8",
);

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

test("KDS reuses one active board request and queues at most one newer reconciliation", async () => {
  const coordinator = new KitchenBoardRefreshCoordinator();
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const run = () => {
    calls += 1;
    return calls === 1 ? first.promise : second.promise;
  };

  const active = coordinator.refresh(run);
  assert.equal(coordinator.refresh(run), active);
  coordinator.refresh(run, { queueIfActive: true });
  coordinator.refresh(run, { queueIfActive: true });
  assert.equal(calls, 0, "request begins in one shared microtask");
  await Promise.resolve();
  assert.equal(calls, 1);

  first.resolve();
  await active;
  await Promise.resolve();
  assert.equal(calls, 2, "all newer invalidations become one follow-up");
  second.resolve();
  await Promise.resolve();
  coordinator.dispose();
});

test("KDS batches a burst of events into one board reconciliation", async () => {
  const coordinator = new KitchenBoardRefreshCoordinator();
  let calls = 0;
  const run = async () => { calls += 1; };
  coordinator.schedule(run, 0);
  coordinator.schedule(run, 0);
  coordinator.schedule(run, 0);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(calls, 1);
  coordinator.dispose();
});

test("KDS uses slow healthy reconciliation and a faster degraded fallback", () => {
  assert.match(source, /HEALTHY_RECONCILIATION_MS = 90_000/);
  assert.match(source, /DEGRADED_RECONCILIATION_MS = 15_000/);
  assert.doesNotMatch(source, /}, 5000\)/);
  assert.match(source, /realtimeStatus === "live"[\s\S]{0,120}HEALTHY_RECONCILIATION_MS/);
});

test("KDS reconnect and visibility recovery use the shared queued coordinator", () => {
  assert.match(source, /onReconnect:[\s\S]{0,220}fetchOrders\(false, true\)/);
  assert.match(source, /visibilityState === "visible"\) void fetchOrders\(false, true\)/);
  assert.match(source, /scheduleEventReconciliation\(\)/);
});

test("equivalent self-mutation events are suppressed without hiding newer statuses", () => {
  assert.match(source, /pending\?\.status === status/);
  assert.match(source, /pending\.expiresAt >= Date\.now\(\)/);
  assert.match(source, /o\.public_token === publicToken && o\.status === nextStatus \? updated : o/);
});
