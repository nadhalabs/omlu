import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const bill = read("app/bill/[sessionToken]/BillClient.tsx");
const session = read("app/session/[sessionToken]/SessionClient.tsx");
const menu = read("app/menu/[restaurantSlug]/[tableCode]/MenuClient.tsx");
const completion = read("app/complete/[sessionToken]/CompletionClient.tsx");
const marker = read("lib/customerCompletion.ts");
const participantService = read("../backend/app/services/table_participants.py");

test("paid completion clears customer credentials and table/session cart state", () => {
  for (const contract of ["clearPublicSessionToken", "clearParticipantToken", "clearSessionParticipantToken", "clearCustomerCartState"]) assert.ok(bill.includes(contract), contract);
  assert.match(marker, /omlu:order-draft:/);
  assert.match(marker, /omlu:session-cart:/);
});

test("payment and session completion replace history with the terminal route", () => {
  assert.match(bill, /router\.replace\(completionPath\(sessionToken\)\)/);
  assert.match(session, /router\.replace\(completionPath\(sessionToken\)\)/);
  assert.doesNotMatch(bill, /router\.push\(completionPath/);
});

test("back, repeated back, forward, focus, and bfcache restoration enforce completion", () => {
  for (const source of [menu, session, bill]) {
    assert.match(source, /addEventListener\("pageshow"/);
    assert.match(source, /addEventListener\("popstate"/);
    assert.match(source, /addEventListener\("focus"/);
    assert.match(source, /router\.replace\(completionPath/);
  }
  assert.match(menu, /readCompletedTable\(restaurantSlug, tableCode\)/);
  assert.match(session, /readCompletedSession\(sessionToken\)/);
});

test("completion marker is session and browser-tab scoped without blocking fresh QR browsers", () => {
  assert.match(marker, /window\.sessionStorage/);
  assert.match(marker, /sessionKey\(marker\.sessionToken\)/);
  assert.match(marker, /tableKey\(marker\.restaurantSlug, marker\.tableCode\)/);
  assert.doesNotMatch(marker, /window\.localStorage\.setItem\([^)]*completed/);
  assert.match(menu, /readCompletedTable\(restaurantSlug, tableCode\)/);
});

test("terminal screen preserves receipt access and exposes only completion actions", () => {
  assert.match(completion, /Payment successful/);
  assert.match(completion, /Your dining session has ended\. Thank you for visiting/);
  assert.match(completion, /View receipt/);
  assert.match(completion, />Close</);
  assert.doesNotMatch(completion, /Table not available|Retry|Start ordering|Join code/);
});

test("backend continues rejecting revoked or completed participant authority", () => {
  assert.match(participantService, /if not participant or participant\.revoked_at/);
  assert.match(participantService, /session\.status not in ACTIVE_DINING_SESSION_STATUSES/);
});
