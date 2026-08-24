import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const counter = readFileSync(new URL("../app/admin/billing/BillingCounterClient.tsx", import.meta.url), "utf8");
const backendRoute = readFileSync(new URL("../../backend/app/routes/bills.py", import.meta.url), "utf8");

test("both admin issue buttons share the canonical mutation and refetch before optional printing", () => {
  const issue = counter.slice(counter.indexOf("async function issue"), counter.indexOf("async function handleReprint"));
  assert.match(issue, /issueStaffBill\(item\.bill_number\)/);
  assert.match(issue, /await refresh\(\)/);
  assert.match(issue, /if \(openPrint && issued\.receipt_token\)/);
  assert.ok(issue.indexOf("await refresh()") < issue.indexOf("printIssuedBill"));
  assert.match(counter, /issue\(item, true\)/);
  assert.match(counter, /issue\(item, false\)/);
  assert.doesNotMatch(issue, /status: "issued"/);

  const collect = counter.slice(counter.indexOf("async function collect"), counter.indexOf("async function saveCustomerGst"));
  assert.match(collect, /await confirmPendingPayment/);
  assert.match(collect, /await refresh\(\)/);

  const print = counter.slice(counter.indexOf("async function handleReprint"), counter.indexOf("async function reopen"));
  assert.doesNotMatch(print, /confirmPendingPayment|issueAndReleaseBill/);
});

test("issuance and payment publish canonical table refresh events", () => {
  const issue = backendRoute.slice(backendRoute.indexOf('"/staff/bills/{bill_number}/issue"'), backendRoute.indexOf('"/staff/bills/{bill_number}/confirm-counter-payment"'));
  assert.match(issue, /detach_issued_bill_and_release_table/);
  assert.match(issue, /allocate_payment_code=False/);
  assert.match(issue, /EVENT_BILL_DETACHED_FOR_PAYMENT/);
  assert.match(issue, /EVENT_TABLE_STATUS_CHANGED/);

  const payment = backendRoute.slice(backendRoute.indexOf('"/staff/bills/{bill_number}/confirm-counter-payment"'));
  assert.match(payment, /EVENT_SESSION_CLOSED/);
  assert.match(payment, /EVENT_TABLE_STATUS_CHANGED/);
  assert.match(payment, /find_current_open_session_for_table/);
});
