import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const menu = read("app/menu/[restaurantSlug]/[tableCode]/MenuClient.tsx");
const session = read("app/session/[sessionToken]/SessionClient.tsx");

test("menu provides compact discovery, header table context, and sticky cart action", () => {
  assert.match(menu, /id="menu-search"/);
  assert.match(menu, /type="search"/);
  assert.match(menu, /htmlFor="menu-search"/);
  assert.match(menu, /clearSearch/);
  assert.match(menu, /overflow-x-auto no-scrollbar/);
  assert.match(menu, /min-h-\[104px\]/);
  assert.match(menu, /env\(safe-area-inset-bottom\)/);
  assert.match(menu, /totalQty > 0/);
  assert.equal((menu.match(/id="menu-search"/g) || []).length, 1);
  assert.match(menu, /aria-label=\{`\$\{t\.cart\}: \$\{totalQty\}/);
  assert.match(menu, /\{t\.dineIn\}/);
});

test("fresh QR load and refresh only load status and validate saved access", () => {
  const beforeCheckout = menu.slice(0, menu.indexOf("const handlePlaceOrder"));
  assert.match(beforeCheckout, /fetchMenu\(true\)/);
  assert.match(beforeCheckout, /getTableSessionStatus\(restaurantSlug, tableCode\)/);
  assert.match(beforeCheckout, /validateSavedSession\(\)/);
  assert.match(menu, /pageshow/);
  assert.match(menu, /validateSavedSession\(\{ clearCachedStateFirst: true \}\)/);
});

test("browsing and cart changes remain local until first order placement", () => {
  const beforeCheckout = menu.slice(0, menu.indexOf("const handlePlaceOrder"));
  assert.doesNotMatch(beforeCheckout, /startSecureTableSession/);
  assert.doesNotMatch(beforeCheckout, /createFirstTableOrder\(/);
  assert.match(menu, /const addToCart = \(item: MenuItem\)/);
  assert.match(menu, /handleStartOrdering=\{\(\) => setIsCartOpen\(true\)\}/);
  assert.match(menu, /createFirstTableOrder\(/);
});

test("opening an item and editing or removing cart lines do not start a session", () => {
  const beforeCheckout = menu.slice(0, menu.indexOf("const handlePlaceOrder"));
  for (const action of ["setCustomisingItem(item)", "incrementQty", "decrementQty", "removeItem"]) {
    assert.ok(beforeCheckout.includes(action), action);
  }
  assert.doesNotMatch(beforeCheckout, /\/sessions["`]/);
  assert.doesNotMatch(beforeCheckout, /createFirstTableOrder\(/);
});

test("409 session conflict transitions UI to join_required state", () => {
  assert.match(menu, /err\.status === 409/);
  assert.match(menu, /setTableOccupied\(true\)/);
  assert.match(menu, /tableOccupied && !participantToken/);
});

test("single CustomerMenuState resolves all 7 table and session lifecycle states", () => {
  assert.match(menu, /type CustomerMenuState =/);
  for (const state of ["ready", "join_required", "ordering_active", "bill_requested", "payment_pending", "completed", "expired"]) {
    assert.match(menu, new RegExp(`"${state}"`));
  }
});

test("completed session renders receipt action instead of start new table order", () => {
  assert.match(menu, /orderCompletedTitle/);
  assert.match(menu, /viewReceipt/);
  assert.doesNotMatch(menu, /Start a new table order/);
});

test("payment pending copy instructs showing payment code at counter", () => {
  assert.match(menu, /Show your payment code at the counter/);
});

test("saved sessions restore while occupied tables still require an explicit code", () => {
  assert.match(menu, /readPublicSessionToken\(restaurantSlug, tableCode\)/);
  assert.match(menu, /readParticipantToken\(restaurantSlug, tableCode\)/);
  assert.match(menu, /getPublicDiningSession\(tokenToValidate, savedParticipantToken\)/);
  assert.match(menu, /joinSecureTableSession\(restaurantSlug, tableCode, joinCode\)/);
  assert.match(menu, /tableOccupied && !participantToken/);
});

test("closed and rejected participant access is cleared instead of restored", () => {
  assert.match(menu, /\["closed", "cancelled"\]\.includes\(session\.status\)/);
  assert.match(menu, /clearPublicSessionToken\(restaurantSlug, tableCode\)/);
  assert.match(menu, /clearParticipantToken\(restaurantSlug, tableCode\)/);
  assert.match(menu, /setParticipantToken\(null\)/);
});

test("menu prices required variants from their lowest real customer price", () => {
  assert.match(menu, /requiredVariantPrices/);
  assert.match(menu, /group\.type === "variant" && group\.required/);
  assert.match(menu, /Math\.min\(\.\.\.requiredVariantPrices\)/);
  assert.match(menu, /\$\{t\.from\} ₹/);
  assert.match(menu, /chooseOptions/);
});

test("choice modal uses customer language and a sticky validated total", () => {
  for (const copy of ["Choose one", "Choose multiple", "Select the required choices to continue.", "Total", "Add to cart"]) assert.ok(menu.includes(copy), copy);
  assert.match(menu, /customisationComplete/);
  assert.match(menu, /missingRequiredGroup/);
  assert.match(menu, /aria-pressed=\{checked\}/);
  assert.match(menu, /sticky bottom-0/);
  assert.match(menu, /disabled=\{!customisationComplete\}/);
  assert.doesNotMatch(menu, /Choose at least|up to \$\{max\}|>Item price</);
});

test("selected language is used consistently for primary menu actions", () => {
  assert.match(menu, /ml:\s*\{/);
  assert.match(menu, /choose: "തിരഞ്ഞെടുക്കുക"/);
  assert.match(menu, /unavailable: "ലഭ്യമല്ല"/);
  assert.doesNotMatch(menu, /\{t\.addMore\}\s*·\s*\{t\.addMoreMl\}/);
});

test("session progressively discloses order and service detail", () => {
  assert.match(session, /aria-label=\{`Order progress:/);
  assert.match(session, /overflow-x-auto/);
  assert.match(session, /session\.service_requests\.length > 0 &&/);
  assert.match(session, /expandedOrders/);
  assert.match(session, /aria-expanded=\{isExpanded\}/);
  assert.match(session, /: false;/);
  assert.match(session, /₹\{Number\(order\.subtotal\)\.toFixed\(2\)\}/);
  assert.doesNotMatch(session, /\{t\.addMore\}\s*·\s*\{t\.addMoreMl\}/);
});

test("customer flows retain realtime, polling fallback, and submission guards", () => {
  assert.match(menu, /useRealtime/);
  assert.match(menu, /if \(isPlacingOrder\) return/);
  assert.match(session, /useRealtime/);
  assert.match(session, /document\.visibilityState !== "visible"/);
  assert.match(session, /status === "loading" \|\| status === "success"/);
  assert.match(session, /billActionLoading !== null/);
});
