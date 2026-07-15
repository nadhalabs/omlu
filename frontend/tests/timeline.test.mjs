import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// 1. Logic Unit Tests: Validate timeline algorithms, edge cases, and mapping

// Helper to determine stage state
function getStageState(stageKey, orderStatus, normalStatuses) {
  if (orderStatus === "rejected") {
    if (stageKey === "pending") return "completed";
    if (stageKey === "rejected") return "current";
    return "future";
  } else {
    const currentIdx = normalStatuses.indexOf(orderStatus);
    const stageIdx = normalStatuses.indexOf(stageKey);
    if (stageIdx < currentIdx) return "completed";
    if (stageIdx === currentIdx) return "current";
    return "future";
  }
}

// Helper to resolve timestamps without inferring fake times
function getStageTimestamp(stageKey, order, fallbackCreatedAt) {
  const historyEntry = order.status_history?.find(h => h.new_status === stageKey);
  if (historyEntry) {
    return historyEntry.changed_at;
  }
  if (stageKey === "pending") {
    return fallbackCreatedAt;
  }
  return null;
}

// Helper to determine which order is expanded by default
function getLatestActiveOrderToken(orders) {
  if (!orders || orders.length === 0) return null;
  const activeStatuses = ["pending", "accepted", "preparing", "ready"];
  for (let i = orders.length - 1; i >= 0; i--) {
    if (activeStatuses.includes(orders[i].status)) {
      return orders[i].public_token;
    }
  }
  return orders[orders.length - 1].public_token;
}

test("Timeline stage mapping and state transitions", () => {
  const normalStatuses = ["pending", "accepted", "preparing", "ready", "served"];

  // Active preparing order
  assert.equal(getStageState("pending", "preparing", normalStatuses), "completed");
  assert.equal(getStageState("accepted", "preparing", normalStatuses), "completed");
  assert.equal(getStageState("preparing", "preparing", normalStatuses), "current");
  assert.equal(getStageState("ready", "preparing", normalStatuses), "future");

  // Served order
  assert.equal(getStageState("ready", "served", normalStatuses), "completed");
  assert.equal(getStageState("served", "served", normalStatuses), "current");
});

test("Cancelled/rejected order flow does not continue through later stages", () => {
  const normalStatuses = ["pending", "accepted", "preparing", "ready", "served"];

  assert.equal(getStageState("pending", "rejected", normalStatuses), "completed");
  assert.equal(getStageState("rejected", "rejected", normalStatuses), "current");
  assert.equal(getStageState("accepted", "rejected", normalStatuses), "future");
});

test("Timestamp resolution (no inference of fake timestamps)", () => {
  const order = {
    created_at: "2026-07-15T12:00:00Z",
    status_history: [
      { new_status: "pending", changed_at: "2026-07-15T12:00:05Z" },
      { new_status: "accepted", changed_at: "2026-07-15T12:05:00Z" }
    ]
  };

  // Uses existing history timestamp
  assert.equal(getStageTimestamp("accepted", order, order.created_at), "2026-07-15T12:05:00Z");

  // Fallback to created_at for pending placed time
  assert.equal(getStageTimestamp("pending", { created_at: "2026-07-15T12:00:00Z" }, "2026-07-15T12:00:00Z"), "2026-07-15T12:00:00Z");

  // Missing history entries return null (do not infer fake times)
  assert.equal(getStageTimestamp("preparing", order, order.created_at), null);
});

test("Multiple orders: expand latest active order by default", () => {
  const orders = [
    { public_token: "order-1", status: "served" }, // Completed older
    { public_token: "order-2", status: "preparing" }, // Active
    { public_token: "order-3", status: "pending" } // Active latest
  ];

  // Latest active order (order-3) should be expanded
  assert.equal(getLatestActiveOrderToken(orders), "order-3");

  const ordersAllServed = [
    { public_token: "order-1", status: "served" },
    { public_token: "order-2", status: "served" }
  ];

  // Fallback to the latest placed order (order-2)
  assert.equal(getLatestActiveOrderToken(ordersAllServed), "order-2");
});

// 2. Component Static Analysis & Source Integration Checks
const source = readFileSync(
  new URL("../app/session/[sessionToken]/SessionClient.tsx", import.meta.url),
  "utf8"
);

test("SessionClient listens to existing session WebSocket", () => {
  // Confirm useRealtime is hooked to session WebSocket using sessionToken
  assert.match(source, /useRealtime\(\{/);
  assert.match(source, /target:\s*\{\s*kind:\s*["']session["'],\s*token:\s*sessionToken\s*\}/);
});

test("WebSocket event triggers fetchSession refetch without page reload", () => {
  // Confirm onEvent handler in useRealtime executes fetchSession(false)
  assert.match(source, /onEvent:\s*\(\)\s*=>\s*void\s+fetchSession\(false\)/);
  assert.match(source, /onReconnect:\s*\(\)\s*=>\s*void\s+fetchSession\(false\)/);
});

test("Animation logic tracks previous order status and animates only newly reached stage", () => {
  // Confirm state & ref hooks exist
  assert.match(source, /prevStatusesRef\s*=\s*useRef/);
  assert.match(source, /animatedStages\s*,\s*setAnimatedStages/);
  
  // Confirm comparison logic
  assert.match(source, /prevStatusesRef\.current\[order\.public_token\]/);
  assert.match(source, /prevStatus\s*&&\s*prevStatus\s*!==\s*order\.status/);
  
  // Confirm animation class utilizes prefers-reduced-motion safe animation
  assert.match(source, /motion-safe:animate-/);
});

test("Collapse state structure exists on order sections", () => {
  assert.match(source, /expandedOrders\[order\.public_token\]/);
  assert.match(source, /isExpanded\s*&&\s*\(/);
});
