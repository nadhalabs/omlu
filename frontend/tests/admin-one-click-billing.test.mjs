import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("web admin cashier path exposes one-click Issue & Open Print and Issue Without Printing", () => {
  const pending = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  const requests = read("app/admin/requests/AdminRequestsClient.tsx");
  const activeSessions = read("app/staff/sessions/StaffSessionsClient.tsx");

  assert.match(pending, /Issue & Open Print/);
  assert.match(pending, /Issue Without Printing/);
  assert.match(requests, /Issue & Open Print/);
  assert.match(requests, /Issue Without Printing/);
  assert.match(activeSessions, /Issue & Open Print/);
  assert.match(activeSessions, /Issue Without Printing/);
});

test("web admin popup blocking displays fallback notification", () => {
  const pending = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  const requests = read("app/admin/requests/AdminRequestsClient.tsx");
  const activeSessions = read("app/staff/sessions/StaffSessionsClient.tsx");

  for (const source of [pending, requests, activeSessions]) {
    assert.match(source, /Bill issued\. Open Print Bill to print\./);
  }
});

test("double-click on web admin issue action is ignored while pending", () => {
  const pending = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  const activeSessions = read("app/staff/sessions/StaffSessionsClient.tsx");

  assert.match(pending, /pendingIssueTokens\.has\(payment\.bill_number\)/);
  assert.match(pending, /issuingBills\[payment\.bill_number\]/);
  assert.match(activeSessions, /pendingIssueTokens\.current\.has\(session\.session_token\)/);
});

test("draft bills cannot print official receipt and issuance does not mutate payment state", () => {
  const bill = read("app/bill/[sessionToken]/BillClient.tsx");
  assert.match(bill, /canPrintOfficially/);
  assert.match(bill, /\["issued", "payment_pending", "paid"\]\.includes\(bill\.status\)/);
});
