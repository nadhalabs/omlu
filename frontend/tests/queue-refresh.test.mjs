import assert from "node:assert/strict";
import test from "node:test";
import { createRefreshCoordinator } from "../lib/queueRefresh.mjs";

test("queue refreshes share an in-flight request and queue one reconciliation", async () => {
  const releases = [];
  let calls = 0;
  const refresh = createRefreshCoordinator(async () => {
    calls += 1;
    await new Promise((resolve) => releases.push(resolve));
  });

  const first = refresh();
  assert.equal(refresh(), first);
  assert.equal(refresh(), first);
  await Promise.resolve();
  assert.equal(calls, 1);

  releases.shift()();
  await first;
  await Promise.resolve();
  assert.equal(calls, 2);

  releases.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 2);
});
