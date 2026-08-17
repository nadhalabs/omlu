import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const headerSrc = read("app/kitchen/[restaurantSlug]/KitchenHeader.tsx");
const moreMenuSrc = read("app/kitchen/[restaurantSlug]/KitchenMoreMenu.tsx");
const boardSrc = read("app/kitchen/[restaurantSlug]/KitchenBoard.tsx");
const laneSrc = read("app/kitchen/[restaurantSlug]/KitchenLane.tsx");
const cardSrc = read("app/kitchen/[restaurantSlug]/KitchenOrderCard.tsx");
const clientSrc = read("app/kitchen/[restaurantSlug]/KitchenDashboardClient.tsx");

test("Kitchen board displays single central board empty state when all lanes are clear", () => {
  assert.match(boardSrc, /Kitchen is clear/);
  assert.match(boardSrc, /New orders will appear here automatically\./);
  assert.match(boardSrc, /totalOrders === 0/);
  // Four repeated "No pending orders" messages are suppressed at board level when clear
  assert.doesNotMatch(boardSrc, /No pending orders[\s\S]*No accepted orders[\s\S]*No preparing orders[\s\S]*No ready orders/);
});

test("Kitchen lanes preserve sticky header, count badges, and unobtrusive empty state", () => {
  assert.match(laneSrc, /sticky top-0/);
  assert.match(laneSrc, /aria-label=.*orders in/);
  assert.match(laneSrc, /emptyLabel/);
});

test("Mobile status tabs allow switching active workflow lane with stage counts", () => {
  assert.match(boardSrc, /role="tab"/);
  assert.match(boardSrc, /setMobileTab/);
  assert.match(boardSrc, /cfg\.count/);
});

test("Kitchen order card renders distance-readable heading, quantities, options, and notes", () => {
  assert.match(cardSrc, /sourceHeading/);
  assert.match(cardSrc, /text-2xl font-black/);
  assert.match(cardSrc, /item\.quantity\} ×/);
  assert.match(cardSrc, /kitchen_display_name \|\| option\.option_name/);
  assert.match(cardSrc, /Customer Note/);
  assert.match(cardSrc, /Note: \{item\.item_note\}/);
});

test("Kitchen card progressive urgency thresholds calculate elapsed time", () => {
  assert.match(cardSrc, /URGENCY_THRESHOLDS = \{/);
  assert.match(cardSrc, /APPROACHING_DELAY: 10/);
  assert.match(cardSrc, /DELAYED: 20/);
  assert.match(cardSrc, /SEVERELY_DELAYED: 30/);
  assert.match(cardSrc, /calculateElapsedMinutes/);
  assert.match(cardSrc, /formatElapsedTime/);
});

test("Kitchen workflow actions preserve primary dominant button and secondary reject option", () => {
  assert.match(cardSrc, /Accept order/);
  assert.match(cardSrc, /Start preparing/);
  assert.match(cardSrc, /Mark ready/);
  assert.match(cardSrc, /Mark served/);
  assert.match(cardSrc, /aria-label=\{`Reject order #/);
});

test("Kitchen header preserves direct availability, sound toggle, fullscreen, and connection badge", () => {
  assert.match(headerSrc, /Manage availability/);
  assert.match(headerSrc, /Sound on|Sound muted/);
  assert.match(headerSrc, /focusMode \? "Exit" : "Enlarge"/);
  assert.match(headerSrc, /connectionConfig/);
  assert.match(headerSrc, /Live|Reconnecting|Checking for updates|Offline/);
});

test("Kitchen More menu encapsulates appearance, dashboard link, manual refresh, user info, and sign out", () => {
  assert.match(moreMenuSrc, /ThemeToggle/);
  assert.match(moreMenuSrc, /Manual refresh/);
  assert.match(moreMenuSrc, /Back to dashboard/);
  assert.match(moreMenuSrc, /Signed-in Staff/);
  assert.match(moreMenuSrc, /Sign Out/);
  assert.match(moreMenuSrc, /event\.key === "Escape"/);
});

test("Kitchen dashboard orchestrator preserves realtime updates, auth gate, audio, and error recovery", () => {
  assert.match(clientSrc, /useRealtime/);
  assert.match(clientSrc, /getKitchenOrders/);
  assert.match(clientSrc, /updateKitchenOrderStatus/);
  assert.match(clientSrc, /playNewOrderAlert/);
  assert.match(clientSrc, /confirmDialog/);
  assert.match(clientSrc, /toast/);
});
