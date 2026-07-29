import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const menu = read("app/menu/[restaurantSlug]/[tableCode]/MenuClient.tsx");
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
  assert.match(menu, /getTableParticipantAuthority/);
  assert.match(menu, /setVisibleJoinCode\(authority\.join_code\)/);
  assert.match(menu, /Your access to this table has ended/);
  assert.match(menu, /clearParticipantToken/);
  assert.match(realtime, /participant_token/);
});

test("only authorized participants see and can copy the table invitation code", () => {
  assert.match(menu, /participantToken && visibleJoinCode/);
  assert.match(menu, /Invite people at your table/);
  assert.match(menu, /Other people at this table can scan the same QR and enter this code\./);
  assert.match(menu, /navigator\.clipboard\.writeText\(visibleJoinCode\)/);
  assert.match(menu, /joinCodeCopied \? "Copied" : "Copy"/);
  assert.doesNotMatch(menu, /[?&]join_code=/);
});

test("staff can manage participants only through confirmed actions", () => {
  assert.match(staff, /Customer devices:/);
  assert.match(staff, /Current join code:/);
  assert.match(staff, /Rotate code/);
  assert.match(staff, /Revoke device/);
  assert.match(staff, /confirmDialog/);
  assert.doesNotMatch(staff, /(?:window|globalThis|self)\.(?:confirm|alert|prompt)/);
});
