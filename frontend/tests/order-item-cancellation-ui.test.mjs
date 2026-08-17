import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const customer = read("app/session/[sessionToken]/SessionClient.tsx");
const staff = read("app/staff/tables/[tableId]/StaffTableDetailClient.tsx");
const kitchen = read("app/kitchen/[restaurantSlug]/KitchenOrderCard.tsx");
const kitchenDashboard = read("app/kitchen/[restaurantSlug]/KitchenDashboardClient.tsx");
const kitchenLane = read("app/kitchen/[restaurantSlug]/KitchenLane.tsx");
const api = read("lib/api.ts");
const staffApi = read("lib/staffTables.ts");

test("customer cancellation eligibility is active-only pending or accepted", () => {
  assert.match(customer, /item\.cancellation_status === "cancelled"/);
  assert.match(customer, /order\.status === "pending" \|\| order\.status === "accepted"/);
  assert.match(customer, /session\.status === "open"/);
  assert.doesNotMatch(customer, /order\.status === "preparing"[^\n]+canCancel/);
  assert.doesNotMatch(customer, /order\.status === "ready"[^\n]+canCancel/);
  assert.doesNotMatch(customer, /order\.status === "served"[^\n]+canCancel/);
});

test("customer keeps cancelled lines visible with restrained styling", () => {
  assert.match(customer, /order\.items\.map/);
  assert.match(customer, /line-through/);
  assert.match(customer, />Cancelled</);
  assert.match(customer, /cancelled \? "bg-\[var\(--omlu-muted-surface\)\] opacity-70"/);
});

test("customer confirms before calling the Phase 1 endpoint and blocks duplicate clicks", () => {
  assert.ok(customer.indexOf("await confirmDialog") < customer.indexOf("cancelPublicOrderItem(sessionToken"));
  assert.match(customer, /title: `Cancel \$\{item\.item_name\}\?`/);
  assert.match(customer, /cancelLabel: "Keep item"/);
  assert.match(customer, /confirmLabel: "Cancel item"/);
  assert.match(customer, /cancellingItemId !== null/);
  assert.match(api, /\/public\/sessions\/\$\{encodeURIComponent\(sessionToken\)\}\/orders\/\$\{encodeURIComponent\(orderPublicToken\)\}\/items\/\$\{orderItemId\}\/cancel/);
  assert.match(api, /"X-Participant-Token": participantToken/);
});

test("preparation race refreshes authoritative state and gives staff-assistance guidance", () => {
  assert.match(customer, /await fetchSession\(false\)/);
  assert.match(customer, /reason instanceof ApiError && reason\.status === 409/);
  assert.match(customer, /Preparation has already started\. Please ask a staff member for help\./);
  assert.doesNotMatch(customer, /setSession\([^\n]+cancelled/);
});

test("staff cancellation is compact, eligible-only, reasoned, and uses the staff endpoint", () => {
  assert.match(staff, /order\.status === "pending" \|\| order\.status === "accepted"/);
  assert.match(staff, />\{busy === `cancel-item-\$\{item\.id\}` \? "Cancelling…" : "Cancel item"\}<\/button>/);
  assert.match(staff, /inputDialog\(/);
  assert.match(staff, /Customer changed mind · Ordered by mistake · Duplicate item · Item unavailable · Other/);
  assert.match(staff, /required: true/);
  assert.match(staffApi, /\/api\/staff\/tables\/\$\{tableId\}\/orders\/\$\{encodeURIComponent\(orderPublicToken\)\}\/items\/\$\{orderItemId\}\/cancel/);
  assert.match(staffApi, /JSON\.stringify\(\{ reason \}\)/);
});

test("customer cancellation notification is informational and has no workflow actions", () => {
  const realtimeBlock = staff.match(/if \(event\.type === "order\.item_cancelled"[\s\S]+?void load\(\);/)?.[0] || "";
  assert.match(realtimeBlock, /cancellation_actor_type === "customer"/);
  assert.match(realtimeBlock, /Item cancelled by customer/);
  assert.match(realtimeBlock, /No action required/);
  assert.match(realtimeBlock, /toast\(/);
  assert.doesNotMatch(realtimeBlock, /approve|reject cancellation|resolveStaffServiceRequest|createPublicServiceRequest/i);
});

test("kitchen retains and marks cancelled lines and refetches on realtime events", () => {
  assert.match(kitchen, /order\.items\.map/);
  assert.match(kitchen, /item\.cancellation_status === "cancelled"/);
  assert.match(kitchen, /line-through/);
  assert.match(kitchen, />Cancelled</);
  assert.match(kitchenDashboard, /target: \{ kind: "staff", channel: "kitchen" \}/);
  assert.match(kitchenDashboard, /scheduleEventReconciliation\(\)/);
});

test("kitchen preserves separate chronological ticket identity and rejected terminal behavior", () => {
  assert.match(kitchenLane, /orders\.map\(\(order\) =>/);
  assert.match(kitchenLane, /key=\{order\.public_token\}/);
  assert.doesNotMatch(kitchenDashboard, /merge.*order|replace.*public_token/i);
  assert.match(kitchenDashboard, /nextStatus === "served" \|\| nextStatus === "rejected"/);
  assert.match(kitchenDashboard, /current\.filter\(\(order\) => order\.public_token !== publicToken\)/);
});

test("existing kitchen transition API and billing views remain separate", () => {
  assert.match(kitchenDashboard, /updateKitchenOrderStatus\(/);
  assert.match(kitchenDashboard, /handleUpdateStatus/);
  assert.doesNotMatch(kitchen, /total_price.*filter|subtotal.*=/);
  assert.doesNotMatch(customer, /window\.confirm|window\.alert|window\.prompt/);
  assert.doesNotMatch(staff, /window\.confirm|window\.alert|window\.prompt/);
});
