import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const bill = read("app/bill/[sessionToken]/BillClient.tsx");

test("payment-requested session without an issued bill retains a recovery-only waiting state", () => {
  assert.match(bill, /getPublicDiningSession\(sessionToken, authority\)/);
  assert.match(bill, /session\.status === "payment_requested"/);
  assert.match(bill, /!session\.bill \|\| session\.bill\.status === "draft"/);
  assert.match(bill, /Bill requested/);
  assert.match(bill, /The restaurant is preparing your bill/);
});

test("normal customer transition routes directly to the bill-ready receipt", () => {
  const session = read("app/session/[sessionToken]/SessionClient.tsx");
  assert.match(session, /requestPublicSessionBill/);
  assert.match(session, /router\.replace\(detachedBillPath/);
  assert.match(bill, /billReadyTitle: "Bill ready"/);
  assert.match(bill, /billReadyMessage: "Your ordering session has ended\."/);
  assert.match(bill, /showCodeAtCounter: "Show this payment code at the counter:"/);
  assert.match(bill, /paymentStatus: "Payment status"/);
});

test("draft requested bills render the provisional bill rather than the recovery-only waiting screen", () => {
  assert.match(bill, /bill\?\.session_status === "payment_requested" && bill\.status === "draft"/);
  assert.match(bill, /waitingSession && !bill && !error/);
  assert.match(bill, /Bill requested · Staff reviewing/);
  assert.match(bill, /Final amount may change until the bill is issued\./);
  assert.doesNotMatch(bill, /Bill not found|return to the table session to prepare/);
});

test("waiting state shows safe session context and no ordering or menu action", () => {
  assert.match(bill, /waitingSession\?\.table_number/);
  assert.match(bill, /waitingSession\?\.combined_subtotal/);
  assert.match(bill, /waitingSession\?\.payment_requested_at/);
  const waitingBlock = bill.slice(bill.indexOf("if (waitingSession && !bill"), bill.indexOf("if (error && !bill)"));
  assert.doesNotMatch(waitingBlock, /\/menu\/|Start ordering|addOrderToDiningSession/);
});

test("issued bill automatically replaces waiting data", () => {
  assert.match(bill, /setWaitingSession\(null\)/);
  assert.match(bill, /setInterval\(\(\) => fetchBill\(false, "poll"\), 6_000\)/);
  assert.match(bill, /onEvent: \(\) => void fetchBill\(false, "event"\)/);
});

test("detached and paid transitions retain their terminal flows", () => {
  assert.match(bill, /data\.session_status === "detached_awaiting_payment"/);
  assert.match(bill, /markDetachedSession/);
  assert.match(bill, /router\.replace\(completionPath\(sessionToken\)\)/);
});

test("focus, refresh, pageshow and bfcache restoration revalidate waiting state", () => {
  assert.match(bill, /window\.addEventListener\("focus", handlePageRestore\)/);
  assert.match(bill, /window\.addEventListener\("pageshow", handlePageRestore\)/);
  assert.match(read("lib/api.ts"), /cache: "no-store"/);
});

test("invalid or inaccessible sessions show only the friendly unavailable state", () => {
  assert.match(bill, /Bill unavailable/);
  assert.match(bill, /We could not open this bill\. Please ask the restaurant staff for help\./);
  assert.doesNotMatch(bill, />\s*\{t\.retry\}\s*</);
});
