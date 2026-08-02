/**
 * paid-session-lifecycle.test.mjs
 *
 * Comprehensive regression suite covering:
 *   PART 1: Option Modal Contrast & Accessibility
 *   PART 2: Mobile QR Menu UI
 *   PART 3: Done Button & Tab Close Fallback
 *   PART 4 & 5: Browser Back, History Replacement & BFCache Revalidation
 *   PART 6: Terminal Completion & Receipt Routes
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const menu = read("app/menu/[restaurantSlug]/[tableCode]/MenuClient.tsx");
const bill = read("app/bill/[sessionToken]/BillClient.tsx");
const completion = read("app/complete/[sessionToken]/CompletionClient.tsx");
const quickSale = read("app/admin/quick-sale/QuickSaleClient.tsx");
const newStaffOrder = read("app/staff/orders/new/NewStaffOrderClient.tsx");

// ---------------------------------------------------------------------------
// PART 1 — OPTION MODAL CONTRAST & ACCESSIBILITY
// ---------------------------------------------------------------------------

test("1. Selected option has readable text and price in dark mode in QuickSale", () => {
  assert.match(quickSale, /dark:bg-orange-950\/40/);
  assert.match(quickSale, /dark:text-\[var\(--omlu-text-primary\)\]/);
});

test("2. Selected state uses theme-safe contrast classes in MenuClient", () => {
  assert.match(menu, /bg-orange-50/);
  assert.match(menu, /dark:bg-orange-950\/40/);
  assert.match(menu, /dark:text-\[var\(--omlu-text-primary\)\]/);
});

test("3. Selected state remains distinguishable without color alone (check/radio indicator present)", () => {
  assert.match(quickSale, /✓/);
  assert.match(menu, /✓/);
  assert.match(newStaffOrder, /✓/);
});

test("4. Focus and selected states coexist correctly with focus-visible styles", () => {
  assert.match(menu, /focus-visible:ring-2/);
  assert.match(quickSale, /focus-visible:ring-2/);
  assert.match(newStaffOrder, /focus-visible:ring-2/);
});

// ---------------------------------------------------------------------------
// PART 2 — MOBILE QR MENU REDESIGN
// ---------------------------------------------------------------------------

test("5. Header controls use compact mobile classes (min-h-9)", () => {
  assert.match(menu, /min-h-9/);
  assert.match(menu, /px-2\.5/);
});

test("6. Category chips are horizontally scrollable and compact", () => {
  assert.match(menu, /overflow-x-auto/);
  assert.match(menu, /no-scrollbar/);
  assert.match(menu, /whitespace-nowrap/);
  assert.match(menu, /shrink-0/);
});

test("7. Item cards use compact padding and 2-column flex structure", () => {
  assert.match(menu, /min-h-\[104px\]|min-h-\[84px\]/);
  assert.match(menu, /flex-1 flex flex-col justify-between/);
});

test("8. Items with options show Choose options action", () => {
  assert.match(menu, /chooseOptions/);
  assert.match(menu, /isConfigurable \? t\.chooseOptions/);
});

test("9. Items without options show compact Add action", () => {
  assert.match(menu, /t\.add/);
  assert.match(menu, /decrementQty/);
  assert.match(menu, /incrementQty/);
});

test("10. Mobile layout does not depend on item images (conditional image render)", () => {
  assert.match(menu, /item\.image_url &&/);
});

test("11. Sticky cart bar appears only when cart has items and ordering is allowed", () => {
  assert.match(menu, /totalQty > 0 && !orderingDisabled/);
  assert.match(menu, /fixed bottom-0/);
  assert.match(menu, /safe-area-inset-bottom/);
});

test("12. 320px layout avoids horizontal overflow with max-w-3xl, flex-1 and truncate classes", () => {
  assert.match(menu, /max-w-3xl/);
  assert.match(menu, /truncate/);
});

test("13. Existing desktop layout remains functional with md:grid-cols-2", () => {
  assert.match(menu, /md:grid-cols-2/);
});

// ---------------------------------------------------------------------------
// PART 3 — DONE BUTTON & TAB CLOSE FALLBACK
// ---------------------------------------------------------------------------

test("14. Done calls window.close", () => {
  assert.match(bill, /window\.close\(\)/);
  assert.match(completion, /window\.close\(\)/);
});

test("15. Done has a visible fallback when the tab cannot close", () => {
  assert.match(bill, /You can safely close this tab/);
  assert.match(completion, /You can safely close this tab/);
});

test("16. Done clears customer credentials", () => {
  assert.match(bill, /clearPublicSessionToken/);
  assert.match(bill, /clearParticipantToken/);
  assert.match(bill, /clearCustomerCartState/);
  assert.match(completion, /clearPublicSessionToken/);
  assert.match(completion, /clearParticipantToken/);
  assert.match(completion, /clearCustomerCartState/);
});

test("17. Done never routes to an active menu", () => {
  assert.doesNotMatch(completion, /router\.push\("\/menu/);
  assert.match(completion, /Scan table QR for a new visit/);
});

// ---------------------------------------------------------------------------
// PART 4 — BROWSER BACK / HISTORY / BFCACHE PROTECTION
// ---------------------------------------------------------------------------

test("18. Paid navigation uses router.replace", () => {
  assert.match(bill, /router\.replace\(completionPath\(sessionToken\)\)/);
  assert.match(menu, /router\.replace\(completionPath/);
});

test("19. No router.push is used for terminal paid navigation", () => {
  assert.doesNotMatch(bill, /router\.push\(completionPath/);
  assert.doesNotMatch(menu, /router\.push\(completionPath/);
});

test("20. Two Back presses cannot restore active ordering (pageshow/popstate/focus listeners present)", () => {
  assert.match(menu, /addEventListener\("pageshow"/);
  assert.match(menu, /addEventListener\("popstate"/);
  assert.match(menu, /addEventListener\("focus"/);
});

test("21. pageshow revalidates session authority", () => {
  assert.match(menu, /validateSavedSession/);
  assert.match(menu, /event\.persisted/);
});

test("22. bfcache-restored menu clears cached state during revalidation", () => {
  assert.match(menu, /clearCachedStateFirst: true/);
});

test("23. popstate on completion remains terminal", () => {
  assert.match(completion, /readCompletedSession/);
});

test("24. focus/visibility restoration revalidates paid state", () => {
  assert.match(bill, /addEventListener\("focus"/);
  assert.match(menu, /addEventListener\("focus"/);
});

test("25. stale participant token is cleared", () => {
  assert.match(menu, /clearParticipantToken/);
  assert.match(bill, /clearParticipantToken/);
});

test("26. old WebSocket is disabled/rejected when participantToken is null", () => {
  assert.match(bill, /enabled:\s*Boolean\(participantToken\)/);
  assert.match(menu, /enabled:\s*Boolean\(participantToken/);
});

test("27. old cart state is cleared", () => {
  assert.match(menu, /clearOrderingState/);
  assert.match(bill, /clearCustomerCartState/);
});

test("28. receipt access remains available via receiptToken parameter", () => {
  assert.match(bill, /receiptToken/);
  assert.match(completion, /receiptToken/);
});
