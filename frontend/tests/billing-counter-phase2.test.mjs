import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const layout = read("app/admin/layout.tsx");
const page = read("app/admin/billing/page.tsx");
const counter = read("app/admin/billing/BillingCounterClient.tsx");
const proxy = read("app/api/staff/bills/billing-counter/route.ts");
const reopenProxy = read("app/api/staff/bills/[billNumber]/reopen-ordering/route.ts");
const menuClient = read("app/menu/[restaurantSlug]/[tableCode]/MenuClient.tsx");
const sessionClient = read("app/session/[sessionToken]/SessionClient.tsx");
const staffDetail = read("app/staff/tables/[tableId]/StaffTableDetailClient.tsx");

test("owner/admin Billing Counter route is prominent and directly protected", () => {
  assert.match(layout, /href="\/admin\/billing" label="Billing Counter"/);
  assert.match(page, /requireStaffRole\(\["owner", "admin"\]\)/);
  assert.match(proxy, /staff_token/);
  assert.match(proxy, /\/staff\/bills\/billing-counter/);
});

test("Billing Counter exposes the required server-classified queues", () => {
  for (const label of ["Requested Bills", "Issued / Awaiting Payment", "Paid Recently"]) assert.ok(counter.includes(label), label);
  assert.match(counter, /queues\.requested/);
  assert.match(counter, /queues\.awaiting_payment/);
  assert.match(counter, /queues\.paid_recently/);
});

test("Billing Counter actions match bill status without draft payment", () => {
  assert.match(counter, /item\.status === "draft"/);
  assert.match(counter, /Reopen Ordering/);
  assert.match(counter, /reopenBillOrdering/);
  assert.match(counter, /Issue & Open Print/);
  assert.match(counter, /Issue Without Printing/);
  assert.match(counter, /item\.status === "issued" \|\| item\.status === "payment_pending"/);
  assert.match(counter, /Confirm Payment/);
  assert.match(counter, /item\.status === "paid"/);
  assert.match(counter, /Print \/ Reprint Receipt/);
});

test("reopen ordering API proxy route exists and proxies request", () => {
  assert.match(reopenProxy, /staff_token/);
  assert.match(reopenProxy, /\/staff\/bills\/.*\/reopen-ordering/);
});

test("same-phone QR restoration falls back to active dining session when participant token exists", () => {
  assert.match(menuClient, /getActivePublicDiningSession/);
  assert.match(menuClient, /readParticipantToken/);
  assert.match(menuClient, /savePublicSessionToken/);
});

test("SessionClient listens for session.ordering_reopened and displays reopen banner", () => {
  assert.match(sessionClient, /session\.ordering_reopened/);
  assert.match(sessionClient, /Ordering has been reopened\./);
  assert.match(sessionClient, /setReopenNotice/);
});

test("StaffTableDetailClient allows Add Item and Add Served Item during draft session and hides both after issue", () => {
  assert.match(staffDetail, /Add Item/);
  assert.match(staffDetail, /Add Served Item/);
  assert.match(staffDetail, /Sends a new order to the kitchen\./);
  assert.match(staffDetail, /Records an item already delivered\. The kitchen will not be notified\./);
  assert.match(staffDetail, /\(!bill \|\| bill\.status === "draft"\)/);
});
