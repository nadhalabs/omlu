import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const menu = read("app/menu/[restaurantSlug]/[tableCode]/MenuClient.tsx");
const session = read("app/session/[sessionToken]/SessionClient.tsx");
const storage = read("lib/publicSessionStorage.ts");
const realtime = read("lib/realtime.ts");
const staff = read("app/staff/tables/[tableId]/StaffTableDetailClient.tsx");

test("occupied QR visitors remain menu-only until the four-digit code succeeds", () => {
  assert.match(menu, /Table already active/);
  assert.match(menu, /pattern="\[0-9\]\{4\}"/);
  assert.match(menu, /Join table/);
  assert.match(menu, /tableOccupied && !participantToken/);
  assert.match(menu, /orderingDisabled/);
});

test("joined authority is table and session scoped and unlocks ordering", () => {
  assert.match(menu, /startSecureTableSession/);
  assert.match(menu, /joinSecureTableSession/);
  assert.match(menu, /saveParticipantToken/);
  assert.match(menu, /saveSessionParticipantToken/);
  assert.match(storage, /saveParticipantToken\(restaurantSlug: string, tableCode: string/);
  assert.match(storage, /saveSessionParticipantToken\(sessionToken: string/);
});

test("authorized participants receive code updates and revoked access is cleared", () => {
  assert.match(session, /getTableParticipantAuthority/);
  assert.match(session, /setVisibleJoinCode\(participantAuthority\.join_code\)/);
  assert.match(session, /Your access to this table has ended/);
  assert.match(session, /setParticipantToken\(null\)/);
  assert.match(session, /setVisibleJoinCode\(null\)/);
  assert.match(realtime, /participant_token/);
});

test("active customer session renders a compact authorized join-code row", () => {
  assert.match(session, /participantToken && visibleJoinCode/);
  assert.match(session, /\["open", "payment_requested", "payment_pending"\]\.includes\(session\.status\)/);
  assert.match(session, /Invite someone to this table/);
  assert.match(session, /Join code:/);
  assert.match(session, /navigator\.clipboard\.writeText\(visibleJoinCode\)/);
  assert.match(session, /joinCodeCopied \? "Copied" : "Copy code"/);
  assert.ok(session.indexOf("Invite someone to this table") < session.indexOf("{t.billState}"));
  assert.doesNotMatch(menu, /Invite someone to this table/);
  assert.doesNotMatch(session, /[?&]join_code=/);
});

test("staff can manage participants only through confirmed actions", () => {
  assert.match(staff, /Customer devices:/);
  assert.match(staff, /Current join code:/);
  assert.match(staff, /Rotate code/);
  assert.match(staff, /Revoke device/);
  assert.match(staff, /confirmDialog/);
  assert.doesNotMatch(staff, /(?:window|globalThis|self)\.(?:confirm|alert|prompt)/);
});
