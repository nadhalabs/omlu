import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const staff = readFileSync(new URL("../app/admin/staff/StaffManagementClient.tsx", import.meta.url), "utf8");
const api = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../lib/authRuntime.mjs", import.meta.url), "utf8");

test("self session revocation uses the target owner id then canonical auth teardown", () => {
  assert.match(staff, /const updated = await revokeStaffSessions\(member\.id\)/);
  assert.match(staff, /getActiveWebTenantScope\(\)\?\.actor_id === member\.id/);
  assert.match(staff, /if \(isCurrentAccount\)[\s\S]*await staffLogout\(\)/);
  assert.match(api, /export async function staffLogout[\s\S]*terminateWebAuthentication/);
  assert.match(runtime, /Promise\.allSettled\(callbacks/);
  assert.match(runtime, /purgeStorage\(runtime\.localStorage\(\)\)/);
  assert.match(runtime, /activeScope = null/);
  assert.match(runtime, /redirectTo = "\/login"/);
});

test("other-account revocation updates only that member and does not invoke teardown", () => {
  assert.match(staff, /if \(isCurrentAccount\)[\s\S]*return;[\s\S]*replaceStaff\(updated\)/);
  assert.doesNotMatch(staff, /replaceStaff\(updated\)[\s\S]*staffLogout/);
});

test("failed revocation preserves authentication and reports the existing error state", () => {
  assert.match(staff, /const updated = await revokeStaffSessions[\s\S]*catch \(err\)/);
  assert.match(staff, /setError\(message\)/);
  assert.match(staff, /uiToast\(message, "error"\)/);
  assert.match(staff, /staffLogout\(\)[\s\S]*return;[\s\S]*replaceStaff\(updated\)[\s\S]*catch/);
});

test("duplicate revocation submissions for the same member are ignored while pending", () => {
  assert.match(staff, /pendingSessionRevocationsRef\.current\.has\(member\.id\)\) return/);
  assert.match(staff, /pendingSessionRevocationsRef\.current\.add\(member\.id\)/);
  assert.match(staff, /pendingSessionRevocationsRef\.current\.delete\(member\.id\)/);
});

test("successful self-revocation immediately hides protected staff UI", () => {
  assert.match(staff, /setSelfSessionRevoked\(true\)/);
  assert.match(staff, /if \(selfSessionRevoked\)[\s\S]*Signing out securely/);
});
