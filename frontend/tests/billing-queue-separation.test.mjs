import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("customer bill requests use the canonical bill workflow, not Service Requests", () => {
  const session = read("app/session/[sessionToken]/SessionClient.tsx");
  assert.match(session, /requestPublicSessionBill/);
  assert.doesNotMatch(session, /request_type:\s*"bill"/);
});

test("Pending Payments exposes canonical bill stages and actions", () => {
  const pending = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  for (const label of ["All", "Bill requested", "Detached", "Ready", "Payment pending", "Issue bill", "Confirm payment"]) {
    assert.ok(pending.includes(label), label);
  }
});

test("Service Request types exclude billing", () => {
  const types = read("lib/types.ts");
  assert.match(types, /request_type:\s*"waiter"\s*\|\s*"water"/);
});
