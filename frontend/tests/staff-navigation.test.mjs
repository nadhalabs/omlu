import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const loginPage = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
const loginClient = readFileSync(new URL("../app/login/LoginClient.tsx", import.meta.url), "utf8");
const logoutButton = readFileSync(new URL("../app/admin/AdminLogoutButton.tsx", import.meta.url), "utf8");
const roleRoutes = readFileSync(new URL("../lib/roleRoutes.ts", import.meta.url), "utf8");
const staffOrderPage = readFileSync(new URL("../app/staff/orders/new/page.tsx", import.meta.url), "utf8");
const staffOrderClient = readFileSync(new URL("../app/staff/orders/new/NewStaffOrderClient.tsx", import.meta.url), "utf8");
const staffTablesClient = readFileSync(new URL("../app/staff/tables/StaffTablesClient.tsx", import.meta.url), "utf8");
const staffRequestsClient = readFileSync(new URL("../app/staff/requests/StaffRequestsClient.tsx", import.meta.url), "utf8");
const staffBottomNav = readFileSync(new URL("../components/staff/StaffBottomNav.tsx", import.meta.url), "utf8");

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

test("staff order UI allows first order to create the table state and blocks duplicate sends", () => {
  assert.match(staffOrderClient, /const canOrder = Boolean\(tableId && \(!detail\?\.session \|\| detail\.session\.status === "open"\)\)/);
  assert.match(staffOrderClient, /if \(!tableId \|\| cart\.length === 0 \|\| submitting \|\| !canOrder\) return/);
  assert.match(staffOrderClient, /disabled=\{!canOrder \|\| cart\.length === 0 \|\| submitting\}/);
  assert.doesNotMatch(staffOrderClient, /Start Session/);
});

test("staff tables use mobile pink card layout and simple statuses", () => {
  assert.match(staffTablesClient, /bg-\[#fff6f6\]/);
  assert.match(staffTablesClient, /type SimpleStatus = "Available" \| "Ordering" \| "Preparing" \| "Ready" \| "Needs Bill"/);
  assert.match(staffTablesClient, /grid grid-cols-2 gap-4/);
  assert.doesNotMatch(staffTablesClient, /Guest/);
  assert.doesNotMatch(staffTablesClient, /Start Session/);
});

test("staff requests use realtime active/completed flow with one resolve action", () => {
  assert.match(staffRequestsClient, /target:\s*\{\s*kind:\s*"staff",\s*channel:\s*"staff"\s*\}/);
  assert.match(staffRequestsClient, /Active/);
  assert.match(staffRequestsClient, /Completed/);
  assert.match(staffRequestsClient, /resolveStaffServiceRequest/);
  assert.doesNotMatch(staffRequestsClient, /confirmStaffCounterPayment/);
});

test("staff bottom navigation exposes only tables new order and requests with badge", () => {
  assert.match(staffBottomNav, /href="\/staff\/tables"/);
  assert.match(staffBottomNav, /aria-label="New order"/);
  assert.match(staffBottomNav, /href="\/staff\/requests"/);
  assert.match(staffBottomNav, /pendingRequests > 0/);
  assert.doesNotMatch(staffBottomNav, /performance|settings|history|staff management/i);
});
