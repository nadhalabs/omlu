import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Staff and Kitchen creation hides email and uses role-aware PIN validation", () => {
  const form = read("app/admin/staff/StaffManagementClient.tsx");
  const validation = read("lib/formValidation.ts");
  assert.match(form, /form\.role === "admin" && <FieldInput name="email"/);
  assert.match(form, /placeholder="6-digit PIN"/);
  assert.match(form, /placeholder="Confirm PIN"/);
  assert.match(form, /name="pin"/);
  assert.match(form, /name="confirm_pin"/);
  assert.match(form, /changeCreateRole/);
  const branchStart = form.indexOf('{form.role === "staff" || form.role === "kitchen" ? <>');
  const operationalBranch = form.slice(branchStart, form.indexOf('</> : <>', branchStart));
  assert.ok(branchStart >= 0);
  assert.doesNotMatch(operationalBranch, /PasswordInput|showChecklist|name="email"|temporary_password/);
  assert.match(validation, /form\.role === "admin" && \(email\.length/);
  assert.match(validation, /form\.role === "staff" \|\| form\.role === "kitchen"/);
  assert.match(validation, /email: undefined/);
  assert.match(validation, /temporary_password: undefined/);
  assert.match(validation, /errors\.pin = "PIN must be exactly 6 digits\."/);
});

test("Flutter operational login asks for Personal username rather than email", () => {
  const login = read("../mobile-app/omlu_operations/lib/features/login/login_screen.dart");
  assert.ok(login.includes("label: 'Personal username'"));
  assert.ok(login.includes('Use the username and 6-digit PIN given by your restaurant manager.'));
  assert.ok(!login.includes("label: 'Personal username or email'"));
});
