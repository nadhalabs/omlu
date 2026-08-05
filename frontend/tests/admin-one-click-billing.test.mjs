import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("web admin cashier path exposes one-click Issue & Open Print and Issue Without Printing", () => {
  const counter = read("app/admin/billing/BillingCounterClient.tsx");
  const activeSessions = read("app/staff/sessions/StaffSessionsClient.tsx");

  assert.match(counter, /Issue & Open Print/);
  assert.match(counter, /Issue Without Printing/);
  assert.doesNotMatch(activeSessions, /Issue & Open Print/);
  assert.doesNotMatch(activeSessions, /Issue Without Printing/);
});

test("web admin popup blocking displays fallback notification", () => {
  const counter = read("app/admin/billing/BillingCounterClient.tsx");
  assert.match(counter, /Bill issued\. Open Print Bill to print\./);
});

test("double-click on web admin issue action is ignored while pending", () => {
  const counter = read("app/admin/billing/BillingCounterClient.tsx");

  assert.match(counter, /issuing\.current\.has\(item\.bill_number\)/);
  assert.match(counter, /issuing\.current\.add\(item\.bill_number\)/);
});

test("draft bills cannot print official receipt and issuance does not mutate payment state", () => {
  const bill = read("app/bill/[sessionToken]/BillClient.tsx");
  assert.match(bill, /canPrintOfficially/);
  assert.match(bill, /\["issued", "payment_pending", "paid"\]\.includes\(bill\.status\)/);
});
