import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const loginPage = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
const loginClient = readFileSync(new URL("../app/login/LoginClient.tsx", import.meta.url), "utf8");
const logoutButton = readFileSync(new URL("../app/admin/AdminLogoutButton.tsx", import.meta.url), "utf8");
const roleRoutes = readFileSync(new URL("../lib/roleRoutes.ts", import.meta.url), "utf8");
const staffOrderPage = readFileSync(new URL("../app/staff/orders/new/page.tsx", import.meta.url), "utf8");
const staffOrderClient = readFileSync(new URL("../app/staff/orders/new/NewStaffOrderClient.tsx", import.meta.url), "utf8");

test("authenticated users are redirected away from /login before the client form renders", () => {
  assert.match(loginPage, /cookies\(\)/);
  assert.match(loginPage, /\/auth\/staff\/me/);
  assert.match(loginPage, /redirect\(destination\)/);
});

test("login and logout replace auth history entries", () => {
  assert.match(loginClient, /router\.replace\(destination\)/);
  assert.doesNotMatch(loginClient, /router\.push\(/);
  assert.match(logoutButton, /router\.replace\("\/login"\)/);
});

test("role home helper maps staff roles to stable workspace roots", () => {
  assert.match(roleRoutes, /role === "owner" \|\| staff\.role === "admin"/);
  assert.match(roleRoutes, /return "\/admin"/);
  assert.match(roleRoutes, /role === "staff"/);
  assert.match(roleRoutes, /return "\/staff"/);
  assert.match(roleRoutes, /role === "kitchen"/);
  assert.match(roleRoutes, /`\/kitchen\/\$\{staff\.restaurant_slug\}`/);
});

test("staff assisted ordering requires a selected table and replaces after success", () => {
  assert.match(staffOrderPage, /if \(!initialTableId\) redirect\("\/staff\/tables"\)/);
  assert.match(staffOrderClient, /router\.replace\(`\/staff\/tables\/\$\{tableId\}`\)/);
  assert.match(staffOrderClient, /window\.localStorage\.removeItem\(cartKey\(tableId\)\)/);
});
