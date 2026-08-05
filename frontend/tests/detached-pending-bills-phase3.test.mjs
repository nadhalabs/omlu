import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("active tables routes owner/admin billing work to the Billing Counter", () => {
  const source = read("app/staff/sessions/StaffSessionsClient.tsx");
  assert.match(source, /canCloseSession && s\.bill_number/);
  assert.match(source, /href="\/admin\/billing"/);
  assert.match(source, /Open Billing Counter/);
  assert.match(read("lib/api.ts"), /confirm_table_is_free/);
});

test("release action prevents duplicate clicks and reuses its idempotency key", () => {
  const api = read("lib/api.ts");
  assert.match(api, /issueAndReleaseBill/);
  assert.match(api, /Idempotency-Key/);
  assert.match(api, /confirm_table_is_free/);
});

test("customer bill screen shows detached bill essentials without exposing code in URLs", () => {
  const bill = read("app/bill/[sessionToken]/BillClient.tsx");
  const marker = read("lib/customerDetachment.ts");
  assert.match(bill, /Bill ready/);
  assert.match(bill, /payment_code/);
  assert.match(bill, /View receipt/);
  assert.match(marker, /receipt=/);
  assert.doesNotMatch(marker, /payment_code=/);
});

test("detachment clears ordering authority and cart state", () => {
  const bill = read("app/bill/[sessionToken]/BillClient.tsx");
  assert.match(bill, /clearPublicSessionToken/);
  assert.match(bill, /clearSessionParticipantToken/);
  assert.match(bill, /clearCustomerCartState/);
  assert.match(bill, /markDetachedSession/);
});

test("detachment event and restore guards route old navigation to the terminal bill", () => {
  const session = read("app/session/[sessionToken]/SessionClient.tsx");
  const menu = read("app/menu/[restaurantSlug]/[tableCode]/MenuClient.tsx");
  assert.match(session, /bill\.detached_for_payment/);
  for (const event of ["pageshow", "popstate", "focus"]) {
    assert.ok(session.includes(event), `session ${event}`);
    assert.ok(menu.includes(event), `menu ${event}`);
  }
  assert.match(menu, /new URLSearchParams\(window\.location\.search\)\.get\("session"\)/);
});

test("fresh QR menu remains public because terminal guard is session-scoped", () => {
  const menu = read("app/menu/[restaurantSlug]/[tableCode]/MenuClient.tsx");
  const marker = read("lib/customerDetachment.ts");
  assert.match(menu, /if \(!detached\) return/);
  assert.match(marker, /omlu:detached-session/);
  assert.match(marker, /const key = \(sessionToken: string\) => `\$\{PREFIX\}:\$\{sessionToken\}`/);
});

test("paid bills leave the detached state for the existing completion flow", () => {
  const bill = read("app/bill/[sessionToken]/BillClient.tsx");
  assert.match(bill, /clearDetachedSession\(sessionToken\)/);
  assert.match(bill, /router\.replace\(completionPath/);
});

test("pending payments highlights detached bills and supports normalized code lookup", () => {
  const pending = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  const api = read("lib/api.ts");
  assert.match(pending, /detached_awaiting_payment/);
  assert.match(pending, /Payment code lookup/);
  assert.match(api, /replace\(\/\\s\+\/g, ""\)\.toUpperCase\(\)/);
  assert.match(api, /Retry-After/);
});

test("ordinary staff can look up but cannot confirm detached payments", () => {
  const page = read("app/staff/payments/pending/page.tsx");
  const pending = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  assert.match(page, /\["owner", "admin", "staff"\]/);
  assert.match(page, /showQueue=\{staff\.role === "owner" \|\| staff\.role === "admin"\}/);
  assert.match(pending, /const canConfirm = actorRole === "owner" \|\| actorRole === "admin"/);
  assert.match(pending, /Ask an owner or admin to confirm payment/);
});

test("payment collection requires method selection and explicit confirmation", () => {
  const pending = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  assert.match(pending, /counter_cash/);
  assert.match(pending, /counter_upi/);
  assert.match(pending, /Confirm (cash|UPI) payment/);
  assert.match(pending, /confirmPendingPayment/);
});

test("frontend proxy never puts a payment code in a path or query string", () => {
  const proxy = read("app/api/staff/bills/payment-code/lookup/route.ts");
  assert.match(proxy, /method: "POST"/);
  assert.match(proxy, /body/);
  assert.doesNotMatch(proxy, /searchParams|\?payment/);
});
