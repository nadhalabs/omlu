import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/admin/staff/StaffManagementClient.tsx", import.meta.url), "utf8");

test("Staff Management uses the requested card hierarchy and responsive account layouts", () => {
  for (const text of ["Manage staff access, roles, sessions, and restaurant availability.", "Restaurant Staff Access", "Add staff member", "Staff accounts"]) {
    assert.ok(source.includes(text), text);
  }
  assert.match(source, /hidden[^\n]*lg:block/);
  assert.match(source, /grid gap-4 lg:hidden/);
  assert.match(source, /No staff accounts yet/);
});

test("staff action menus expose accessible state, keyboard dismissal, and protected owner messaging", () => {
  assert.match(source, /aria-label=\{`More actions for \$\{member\.name\}`\}/);
  assert.match(source, /aria-haspopup="menu"/);
  assert.match(source, /aria-expanded=\{openMenu\}/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /The restaurant owner cannot be suspended or removed/);
  assert.match(source, /!owner && <MenuAction label="Remove staff member"/);
});

test("staff mutations use row-scoped progress without blocking unrelated accounts", () => {
  assert.match(source, /busyMemberId === member\.id/);
  for (const label of ["Updating role...", "Resuming...", "Suspending...", "Signing out...", "Removing...", "Locking...", "Unlocking..."]) {
    assert.ok(source.includes(label), label);
  }
});

test("create fields have labels and associated inline errors", () => {
  for (const label of ["Full name", "Username", "6-digit PIN", "Confirm PIN"]) assert.ok(source.includes(`label="${label}"`));
  assert.match(source, /aria-describedby=\{error \? errorId : hint \? hintId : undefined\}/);
  assert.match(source, /aria-invalid=\{Boolean\(error\)\}/);
});
