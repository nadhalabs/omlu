import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const menu = read("app/menu/[restaurantSlug]/[tableCode]/MenuClient.tsx");
const session = read("app/session/[sessionToken]/SessionClient.tsx");

test("menu provides compact, accessible discovery and a safe-area cart action", () => {
  assert.match(menu, /id="menu-search"/);
  assert.match(menu, /type="search"/);
  assert.match(menu, /htmlFor="menu-search"/);
  assert.match(menu, /clearSearch/);
  assert.match(menu, /overflow-x-auto no-scrollbar/);
  assert.match(menu, /min-h-\[104px\]/);
  assert.match(menu, /env\(safe-area-inset-bottom\)/);
  assert.match(menu, /totalQty > 0 && !orderingDisabled/);
  assert.equal((menu.match(/id="menu-search"/g) || []).length, 1);
  assert.match(menu, /aria-label=\{`\$\{t\.cart\}: \$\{totalQty\}/);
  assert.doesNotMatch(menu, /Ready to order\?|Start secure ordering for this table|>Start ordering</);
});

test("fresh QR load and refresh only load status and validate saved access", () => {
  const beforeCheckout = menu.slice(0, menu.indexOf("const handlePlaceOrder"));
  assert.match(beforeCheckout, /fetchMenu\(true\)/);
  assert.match(beforeCheckout, /getTableSessionStatus\(restaurantSlug, tableCode\)/);
  assert.match(beforeCheckout, /validateSavedSession\(\)/);
  assert.doesNotMatch(beforeCheckout, /startSecureTableSession\(/);
  assert.doesNotMatch(menu, /handleStartOrdering|autoStartAttemptedRef|occupancyChecked|savedSessionChecked/);
  assert.match(menu, /pageshow/);
  assert.match(menu, /validateSavedSession\(\{ clearCachedStateFirst: true \}\)/);
});

test("local cart actions never create table access", () => {
  const cartActions = menu.slice(menu.indexOf("const addLineToCart"), menu.indexOf("// Search filtering"));
  assert.match(cartActions, /setCart/);
  assert.match(cartActions, /setCustomisingItem/);
  assert.doesNotMatch(cartActions, /startSecureTableSession|joinSecureTableSession|addOrderToDiningSession/);
});

test("first order submission creates secure access before placing the order", () => {
  const checkout = menu.slice(menu.indexOf("const handlePlaceOrder"), menu.indexOf("const handleJoinTable"));
  assert.match(checkout, /if \(!activeSession && !tableOccupied\)/);
  assert.match(checkout, /await startSecureTableSession\(restaurantSlug, tableCode\)/);
  assert.ok(checkout.indexOf("await startSecureTableSession") < checkout.indexOf("await addOrderToDiningSession"));
  assert.match(checkout, /saveParticipantToken/);
  assert.match(checkout, /saveSessionParticipantToken/);
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
  assert.match(session, /latestActiveOrderToken/);
  assert.doesNotMatch(session, /\{t\.addMore\}\s*·\s*\{t\.addMoreMl\}/);
});

test("customer flows retain realtime, polling fallback, and submission guards", () => {
  assert.match(menu, /useRealtime/);
  assert.match(menu, /if \(isPlacingOrder\) return/);
  assert.match(session, /useRealtime/);
  assert.match(session, /setInterval\(\(\) => fetchSession\(false\), 6_000\)/);
  assert.match(session, /status === "loading" \|\| status === "success"/);
  assert.match(session, /billActionLoading !== null/);
});
