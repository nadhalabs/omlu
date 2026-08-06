import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sidebar = read("app/admin/AdminOperationalSidebar.tsx");
const layout = read("app/admin/layout.tsx");
const countsRoute = read("app/api/admin/sidebar-operational-counts/route.ts");

test("operational badges hide at zero and cap visual counts at 99+", () => {
  assert.match(sidebar, /count > 0 &&/);
  assert.match(sidebar, /count > 99 \? "99\+" : String\(count\)/);
  assert.match(sidebar, /h-6 w-9 shrink-0/);
});

test("operational badges expose correct singular and plural queue wording", () => {
  for (const wording of [
    "pending payment",
    "pending payments",
    "active takeaway order",
    "active takeaway orders",
    "unresolved service request",
    "unresolved service requests",
  ]) assert.ok(sidebar.includes(wording), wording);
  assert.match(sidebar, /count === 1 \? details\.singular : details\.plural/);
  assert.match(sidebar, /aria-label=\{countLabel\(queue, count\)\}/);
});

test("each queue has distinct high-contrast semantic styling", () => {
  assert.match(sidebar, /pendingPayments:[\s\S]*bg-red-700[\s\S]*dark:bg-red-500/);
  assert.match(sidebar, /activeTakeaways:[\s\S]*bg-blue-700[\s\S]*dark:bg-blue-400/);
  assert.match(sidebar, /unresolvedRequests:[\s\S]*bg-orange-600[\s\S]*dark:bg-orange-400/);
  assert.match(sidebar, /items-center justify-between gap-3 whitespace-nowrap/);
  assert.match(sidebar, /font-black leading-none ring-1/);
});

test("only operational queues receive sidebar badges", () => {
  assert.match(layout, /AdminOperationalSidebarLink[^>]*Quick Sale[^>]*queue="activeTakeaways"/);
  assert.match(layout, /AdminOperationalSidebarLink[^>]*Billing Counter[^>]*queue="pendingPayments"/);
  assert.match(layout, /AdminOperationalSidebarLink[^>]*Service Requests[^>]*queue="unresolvedRequests"/);
  assert.doesNotMatch(layout, /AdminOperationalSidebarLink[^>]*(?:Kitchen Dashboard|Tables Map)/);
});

test("one shared owner refreshes all counts through one realtime subscription without polling", () => {
  assert.equal((sidebar.match(/useRealtime\(/g) || []).length, 1);
  assert.equal((sidebar.match(/\/api\/admin\/sidebar-operational-counts/g) || []).length, 1);
  assert.doesNotMatch(sidebar, /setInterval/);
  assert.match(sidebar, /debouncedRefresh/);
  assert.match(sidebar, /channel: "operations"/);
  assert.match(sidebar, /admin-operational-counts-changed/);
  assert.match(sidebar, /onReconnect: refresh/);
});

test("shared count endpoint preserves authenticated scope and excludes terminal records", () => {
  assert.match(countsRoute, /request\.cookies\.get\("staff_token"\)/);
  assert.match(countsRoute, /Promise\.all/);
  assert.match(countsRoute, /status_filter=pending/);
  assert.match(countsRoute, /\["pending", "accepted", "preparing", "ready", "served"\]/);
  assert.match(countsRoute, /serviceRequest\.status === "pending"/);
  assert.match(countsRoute, /Array\.isArray\(payments\.items\) \? payments\.items\.length/);
});

test("relevant admin actions request an immediate shared count refresh", () => {
  for (const path of [
    "app/admin/payments/pending/PendingPaymentsClient.tsx",
    "app/admin/quick-sale/QuickSaleClient.tsx",
    "app/admin/requests/AdminRequestsClient.tsx",
  ]) assert.match(read(path), /admin-operational-counts-changed/, path);
});
