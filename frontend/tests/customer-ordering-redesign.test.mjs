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
