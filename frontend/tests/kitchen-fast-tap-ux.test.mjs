import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const client = read("app/kitchen/[restaurantSlug]/KitchenDashboardClient.tsx");
const board = read("app/kitchen/[restaurantSlug]/KitchenBoard.tsx");
const card = read("app/kitchen/[restaurantSlug]/KitchenOrderCard.tsx");
const ui = read("components/OmluUiProvider.tsx");

test("initial KDS loading is allowed only when no usable board data exists", () => {
  assert.match(board, /if \(loading && totalOrders === 0\)/);
  assert.match(board, /Loading active orders/);
});

test("background reconciliation keeps the current board visible", () => {
  assert.match(client, /performFetchOrders\(false\)/);
  assert.match(client, /if \(showLoading\) setLoading\(true\)/);
  assert.doesNotMatch(board, /fixed inset-0|backdrop|blur/);
});

test("normal Served transition bypasses the global backdrop dialog", () => {
  assert.match(ui, /fixed inset-0[\s\S]{0,160}bg-\[var\(--omlu-backdrop\)\]/);
  assert.match(client, /onMarkServed=\{\(tok\) => void handleUpdateStatus\(tok, "served"\)\}/);
  assert.doesNotMatch(client, /triggerConfirm\(tok, "served"\)|confirmReject\(tok, "served"\)/);
});

test("pending feedback and duplicate prevention are scoped to one ticket", () => {
  assert.match(client, /pendingMutationsRef\.current\.has\(publicToken\)/);
  assert.match(client, /\[publicToken\]: true/);
  assert.match(card, /disabled=\{isUpdating\}/);
  assert.match(card, /isUpdating \? "Updating…"/);
});

test("an older board response cannot undo a pending optimistic ticket", () => {
  assert.match(client, /const pendingStatus = pendingMutationsRef\.current\.get\(serverOrder\.public_token\)/);
  assert.match(client, /const requestVersion = \+\+operationVersionRef\.current/);
  assert.match(client, /confirmedMutationRef\.current\.set\(publicToken, \+\+operationVersionRef\.current\)/);
  assert.match(client, /return optimisticOrder \? \[optimisticOrder\] : \[\]/);
});

test("a failed mutation restores only its affected ticket and reconciles", () => {
  assert.match(client, /current\.filter\(\(order\) => order\.public_token !== publicToken\)/);
  assert.match(client, /previousOrder/);
  assert.match(client, /void fetchOrders\(false, true\)/);
});

test("destructive Reject retains confirmation without affecting normal status progression", () => {
  assert.match(client, /const confirmReject = async/);
  assert.match(client, /tone: "destructive"/);
  assert.match(client, /onReject=\{\(tok\) => void confirmReject\(tok\)\}/);
});
