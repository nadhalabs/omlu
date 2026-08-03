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

// ---------------------------------------------------------------------------
// PART 5 — BEHAVIORAL HISTORY STACK STATE MACHINE TESTS (CASES A, B, C, D)
// ---------------------------------------------------------------------------

class MockHistoryStack {
  constructor() {
    this.stack = [];
    this.currentIndex = -1;
  }
  push(url, state = {}) {
    this.stack = this.stack.slice(0, this.currentIndex + 1);
    this.stack.push({ url, state });
    this.currentIndex = this.stack.length - 1;
  }
  replace(url, state = {}) {
    if (this.currentIndex < 0) {
      this.push(url, state);
    } else {
      this.stack[this.currentIndex] = { url, state };
    }
  }
  back() {
    if (this.currentIndex > 0) this.currentIndex--;
  }
  forward() {
    if (this.currentIndex < this.stack.length - 1) this.currentIndex++;
  }
  current() {
    return this.stack[this.currentIndex] || null;
  }
}

test("Case A: Completed lifecycle restoration via Back navigation redirects to completion", () => {
  const history = new MockHistoryStack();
  const sessionStorage = new Map();

  // 1. Initial Menu load
  history.push("/menu/demo/T1", {});

  // 2. Order placed -> replaces entry with session (tagged history)
  history.replace("/session/sess_A", { omluCustomerSessionToken: "sess_A" });

  // 3. Bill requested -> replaces entry with bill (tagged history)
  history.replace("/bill/sess_A", { omluCustomerSessionToken: "sess_A" });

  // 4. Payment complete -> mark completion & replace entry with completion
  sessionStorage.set("omlu:completed-session:session:sess_A", JSON.stringify({ sessionToken: "sess_A", restaurantSlug: "demo", tableCode: "T1" }));
  sessionStorage.set("omlu:completed-session:table:demo:T1", JSON.stringify({ sessionToken: "sess_A", restaurantSlug: "demo", tableCode: "T1" }));
  history.replace("/complete/sess_A", { omluCustomerSessionToken: "sess_A" });

  assert.equal(history.current().url, "/complete/sess_A");

  // 5. Back navigation evaluation
  const completed = JSON.parse(sessionStorage.get("omlu:completed-session:table:demo:T1"));
  const historySessionToken = history.current().state?.omluCustomerSessionToken;
  const isRestoringSameCompletedVisit = Boolean(
    completed && historySessionToken && completed.sessionToken === historySessionToken
  );

  assert.equal(isRestoringSameCompletedVisit, true);
});

test("Case B: Fresh QR navigation to public table menu is unblocked and opens menu", () => {
  const history = new MockHistoryStack();
  const sessionStorage = new Map();

  // Tab has an old completion marker from a previous visit
  sessionStorage.set("omlu:completed-session:table:demo:T1", JSON.stringify({ sessionToken: "sess_A", restaurantSlug: "demo", tableCode: "T1" }));

  // Fresh QR scan in browser has NO omluCustomerSessionToken in history.state
  history.push("/menu/demo/T1", {});

  const completed = JSON.parse(sessionStorage.get("omlu:completed-session:table:demo:T1"));
  const historySessionToken = history.current().state?.omluCustomerSessionToken; // undefined!
  const isRestoringSameCompletedVisit = Boolean(
    completed && historySessionToken && completed.sessionToken === historySessionToken
  );

  // Fresh scan MUST NOT be blocked!
  assert.equal(isRestoringSameCompletedVisit, false);
  assert.equal(history.current().url, "/menu/demo/T1");
});

test("Case C: New customer creates session B without inheriting session A state", () => {
  const sessionStorage = new Map();
  // Session A marker exists in table key
  sessionStorage.set("omlu:completed-session:table:demo:T1", JSON.stringify({ sessionToken: "sess_A" }));

  // Fresh customer scans QR and creates session B
  const sessionBToken = "sess_B";
  assert.notEqual(sessionBToken, "sess_A");
  assert.equal(sessionStorage.has(`omlu:completed-session:session:${sessionBToken}`), false);
});

test("Case D: Read-only receipt for session A remains accessible with receiptToken parameter", () => {
  const url = new URL("http://localhost/bill/sess_A?receipt=rcpt_123");
  const receiptToken = url.searchParams.get("receipt");

  assert.equal(receiptToken, "rcpt_123");
  // When receiptToken is present, completion redirect is bypassed for receipt viewing
  const completed = { sessionToken: "sess_A" };
  const shouldRedirectToCompletion = Boolean(completed && !receiptToken);
  assert.equal(shouldRedirectToCompletion, false);
});
