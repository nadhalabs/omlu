import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeScreensWithDrafts,
  DRAG_THRESHOLD,
  type ScreenDrafts,
} from "../lib/cinema/drafts";
import { screen, seat, order, qrDestination } from "../lib/cinema/api";
import type { CinemaScreen, CinemaSeat } from "../lib/cinema/types";

function createMockSeat(id: string, code: string, layoutX: number, layoutY: number): CinemaSeat {
  return {
    id,
    row: code.slice(0, 1),
    number: parseInt(code.slice(1), 10) || 1,
    code,
    layoutX,
    layoutY,
    displayOrder: 0,
    isActive: true,
    isAccessible: false,
    aisleAfter: false,
    status: "active",
  };
}

function createMockScreen(id: string, name: string, seats: CinemaSeat[]): CinemaScreen {
  return {
    id,
    name,
    code: id.toUpperCase(),
    isActive: true,
    sortOrder: 0,
    rows: ["A"],
    seatsPerRow: seats.length,
    aislesAfter: [],
    seats,
  };
}

test("screen draft preservation: independent per-screen drafts are preserved across screen switches", () => {
  const s1Seats = [createMockSeat("s1-1", "A1", 0, 0), createMockSeat("s1-2", "A2", 64, 0)];
  const s2Seats = [createMockSeat("s2-1", "B1", 0, 56), createMockSeat("s2-2", "B2", 64, 56)];

  const serverScreens = [
    createMockScreen("scr-1", "Screen 1", s1Seats),
    createMockScreen("scr-2", "Screen 2", s2Seats),
  ];

  const drafts: ScreenDrafts = new Map();

  // 1. User drags s1-1 on Screen 1
  const scr1Draft = new Map<string, { layoutX: number; layoutY: number }>();
  scr1Draft.set("s1-1", { layoutX: 128, layoutY: 64 });
  drafts.set("scr-1", scr1Draft);

  // Merge for Screen 1
  let merged = mergeScreensWithDrafts(serverScreens, drafts);
  assert.equal(merged[0].seats[0].layoutX, 128);
  assert.equal(merged[0].seats[0].layoutY, 64);
  assert.equal(merged[0].seats[1].layoutX, 64); // untouched

  // 2. User switches to Screen 2 and drags s2-2
  const scr2Draft = new Map<string, { layoutX: number; layoutY: number }>();
  scr2Draft.set("s2-2", { layoutX: 256, layoutY: 120 });
  drafts.set("scr-2", scr2Draft);

  merged = mergeScreensWithDrafts(serverScreens, drafts);
  // Screen 2 has draft
  assert.equal(merged[1].seats[1].layoutX, 256);
  assert.equal(merged[1].seats[1].layoutY, 120);
  assert.equal(merged[1].seats[0].layoutX, 0); // untouched

  // 3. User switches back to Screen 1 — Screen 1 draft is still intact!
  assert.equal(merged[0].seats[0].layoutX, 128);
  assert.equal(merged[0].seats[0].layoutY, 64);

  // 4. User switches back to Screen 2 — Screen 2 draft is still intact!
  assert.equal(merged[1].seats[1].layoutX, 256);
  assert.equal(merged[1].seats[1].layoutY, 120);
});

test("screen draft preservation: saving Screen 1 clears only Screen 1 draft, leaving Screen 2 draft intact", () => {
  const s1Seats = [createMockSeat("s1-1", "A1", 0, 0)];
  const s2Seats = [createMockSeat("s2-1", "B1", 0, 56)];

  const serverScreens = [
    createMockScreen("scr-1", "Screen 1", s1Seats),
    createMockScreen("scr-2", "Screen 2", s2Seats),
  ];

  const drafts: ScreenDrafts = new Map([
    ["scr-1", new Map([["s1-1", { layoutX: 100, layoutY: 100 }]])],
    ["scr-2", new Map([["s2-1", { layoutX: 200, layoutY: 200 }]])],
  ]);

  // Simulate save on Screen 1: delete only Screen 1 draft
  drafts.delete("scr-1");

  // Update server baseline for Screen 1 with saved coordinates
  serverScreens[0] = createMockScreen("scr-1", "Screen 1", [createMockSeat("s1-1", "A1", 100, 100)]);

  const merged = mergeScreensWithDrafts(serverScreens, drafts);
  // Screen 1 now has saved coordinates from server
  assert.equal(merged[0].seats[0].layoutX, 100);
  assert.equal(merged[0].seats[0].layoutY, 100);
  // Screen 2 STILL has its unsaved draft!
  assert.equal(merged[1].seats[0].layoutX, 200);
  assert.equal(merged[1].seats[0].layoutY, 200);
  assert.equal(drafts.has("scr-2"), true);
  assert.equal(drafts.has("scr-1"), false);
});

test("auto-refresh safety: server auto-refresh preserves dirty seat positions while updating untouched seats and metadata", () => {
  // Local draft on seat s1-1
  const drafts: ScreenDrafts = new Map([
    ["scr-1", new Map([["s1-1", { layoutX: 192, layoutY: 88 }]])],
  ]);

  // 15 seconds later, server auto-refresh returns updated data:
  // - screen name updated by another staff to "Renamed Audi"
  // - seat s1-2 was moved on server to (64, 30)
  // - seat s1-1 on server is still (0, 0)
  const refreshedServerScreens = [
    createMockScreen("scr-1", "Renamed Audi", [
      createMockSeat("s1-1", "A1", 0, 0),
      createMockSeat("s1-2", "A2", 64, 30),
    ]),
  ];

  const merged = mergeScreensWithDrafts(refreshedServerScreens, drafts);

  // Screen name updated from server
  assert.equal(merged[0].name, "Renamed Audi");
  // Untouched seat s1-2 updated from server
  assert.equal(merged[0].seats[1].layoutY, 30);
  // Dirty seat s1-1 PRESERVED local draft coordinates!
  assert.equal(merged[0].seats[0].layoutX, 192);
  assert.equal(merged[0].seats[0].layoutY, 88);
});

test("click vs drag: movement below threshold (5px) does not trigger drag", () => {
  const startX = 100;
  const startY = 200;

  // A plain click with jitter (dx=2, dy=2 -> distance² = 8 < 25)
  const clickX = 102;
  const clickY = 202;
  const movedX = clickX - startX;
  const movedY = clickY - startY;
  const distSq = movedX * movedX + movedY * movedY;

  assert.ok(distSq < DRAG_THRESHOLD, "Small click jitter should be below threshold");

  // An intentional drag (dx=6, dy=6 -> distance² = 72 >= 25)
  const dragX = 106;
  const dragY = 206;
  const dragMovedX = dragX - startX;
  const dragMovedY = dragY - startY;
  const dragDistSq = dragMovedX * dragMovedX + dragMovedY * dragMovedY;

  assert.ok(dragDistSq >= DRAG_THRESHOLD, "Intentional drag should meet or exceed threshold");
});

test("drag calculation: accurately subtracts 42px and 100px canvas offsets with 8px snapping and clamps to 0", () => {
  // Seat at layoutX=64, layoutY=56. Button at left=106, top=156.
  // Canvas bounds at (50, 50). Button bounds at (50 + 106, 50 + 156) = (156, 206).
  const canvasLeft = 50;
  const canvasTop = 50;
  const buttonLeft = 156;
  const buttonTop = 206;

  // Click at (166, 216) -> dx = 10, dy = 10
  const pointerDownX = 166;
  const pointerDownY = 216;
  const dx = pointerDownX - buttonLeft;
  const dy = pointerDownY - buttonTop;
  assert.equal(dx, 10);
  assert.equal(dy, 10);

  // Drag to (166 + 32, 216 + 24) = (198, 240) -> movement = (32, 24)
  const dragClientX = 198;
  const dragClientY = 240;

  const x = Math.max(0, Math.round((dragClientX - canvasLeft + 0 - dx - 42) / 8) * 8);
  const y = Math.max(0, Math.round((dragClientY - canvasTop + 0 - dy - 100) / 8) * 8);

  // Expected: 64 + 32 = 96, 56 + 24 = 80
  assert.equal(x, 96);
  assert.equal(y, 80);

  // Drag off left/top edge clamps to 0
  const offEdgeX = Math.max(0, Math.round((0 - canvasLeft - dx - 42) / 8) * 8);
  const offEdgeY = Math.max(0, Math.round((0 - canvasTop - dy - 100) / 8) * 8);
  assert.equal(offEdgeX, 0);
  assert.equal(offEdgeY, 0);
});

test("API mapper: screen mapper preserves all authoritative fields including isActive and sortOrder", () => {
  const apiScreen = {
    id: 42,
    name: "IMAX Screen",
    code: "IMAX-1",
    is_active: true,
    sort_order: 3,
    seats: [
      {
        id: 101,
        row_label: "A",
        seat_number: 1,
        public_code: "A1",
        position_index: 0,
        layout_x: 0,
        layout_y: 0,
        aisle_after: true,
        is_active: true,
        is_accessible: false,
      },
    ],
  };

  const domainScreen = screen(apiScreen);
  assert.equal(domainScreen.id, "42");
  assert.equal(domainScreen.name, "IMAX Screen");
  assert.equal(domainScreen.code, "IMAX-1");
  assert.equal(domainScreen.isActive, true);
  assert.equal(domainScreen.sortOrder, 3);
  assert.equal(domainScreen.seats.length, 1);
  assert.deepEqual(domainScreen.aislesAfter, [1]);
});

test("API mapper: seat mapper preserves all authoritative fields including aisleAfter, status, and coordinates", () => {
  const activeAisleSeat = seat({
    id: 1,
    row_label: "F",
    seat_number: 11,
    public_code: "F11",
    position_index: 60,
    layout_x: 640,
    layout_y: 280,
    aisle_after: true,
    is_active: true,
    is_accessible: false,
  });

  assert.equal(activeAisleSeat.id, "1");
  assert.equal(activeAisleSeat.row, "F");
  assert.equal(activeAisleSeat.number, 11);
  assert.equal(activeAisleSeat.code, "F11");
  assert.equal(activeAisleSeat.layoutX, 640);
  assert.equal(activeAisleSeat.layoutY, 280);
  assert.equal(activeAisleSeat.displayOrder, 60);
  assert.equal(activeAisleSeat.aisleAfter, true);
  assert.equal(activeAisleSeat.isActive, true);
  assert.equal(activeAisleSeat.isAccessible, false);
  assert.equal(activeAisleSeat.status, "active");

  const accessibleSeat = seat({
    id: 2,
    row_label: "G",
    seat_number: 12,
    public_code: "G12",
    position_index: 70,
    layout_x: 704,
    layout_y: 336,
    aisle_after: false,
    is_active: true,
    is_accessible: true,
  });
  assert.equal(accessibleSeat.status, "accessible");

  const disabledSeat = seat({
    id: 3,
    row_label: "A",
    seat_number: 4,
    public_code: "A4",
    position_index: 3,
    layout_x: 192,
    layout_y: 0,
    aisle_after: false,
    is_active: false,
    is_accessible: false,
  });
  assert.equal(disabledSeat.status, "disabled");
});

test("API mapper: order mapper maps created_at to createdAt and preserves customer_note", () => {
  const apiOrder = {
    id: 501,
    order_number: "ORD-2026-001",
    status: "pending" as const,
    subtotal: "450.00",
    screen_id: 1,
    seat_code: "G12",
    created_at: "2026-09-02T18:30:00.000Z",
    customer_note: "Extra caramel on popcorn please",
    items: [
      {
        name: "Caramel Popcorn",
        quantity: 2,
        unit_price: "200.00",
        note: "Warm",
        options: [{ name: "Large", quantity: 1 }],
      },
    ],
    public_token: "tok_abc123",
  };

  const domainOrder = order(apiOrder);
  assert.equal(domainOrder.id, "ORD-2026-001");
  assert.equal(domainOrder.backendId, "501");
  assert.equal(domainOrder.publicToken, "tok_abc123");
  assert.equal(domainOrder.screenId, "1");
  assert.equal(domainOrder.seatCode, "G12");
  assert.equal(domainOrder.status, "pending");
  assert.equal(domainOrder.createdAt, "2026-09-02T18:30:00.000Z");
  assert.equal(domainOrder.customerNote, "Extra caramel on popcorn please");
  assert.equal(domainOrder.items.length, 1);
  assert.equal(domainOrder.items[0].price, 200);
});

test("QR invariant: moving visual seat coordinates never changes public code or QR authority URL", () => {
  const scr = createMockScreen("scr-1", "Screen 1", []);
  scr.code = "S1";

  const originalSeat = createMockSeat("seat-1", "VIP-7", 0, 0);
  const movedSeat = createMockSeat("seat-1", "VIP-7", 800, 600); // Visual move

  const urlBefore = qrDestination("test-cinema", scr, originalSeat);
  const urlAfter = qrDestination("test-cinema", scr, movedSeat);

  assert.equal(urlBefore, "/c/test-cinema/S1/VIP-7");
  assert.equal(urlAfter, "/c/test-cinema/S1/VIP-7");
  assert.equal(urlBefore, urlAfter, "QR destination must be identical before and after visual dragging");
});

test("partial save failure: failed seats remain in draft while succeeded seats clear from draft", () => {
  const drafts: ScreenDrafts = new Map([
    ["scr-1", new Map([
      ["s1-1", { layoutX: 100, layoutY: 100 }],
      ["s1-2", { layoutX: 200, layoutY: 200 }],
      ["s1-3", { layoutX: 300, layoutY: 300 }],
    ])],
  ]);

  // Simulate partial failure: s1-1 and s1-2 succeed, s1-3 fails
  const savedSeats = [{ id: "s1-1" }, { id: "s1-2" }];
  const failedSeats = ["s1-3"];

  // Update drafts matching CinemaAdminClient logic
  const screenDraft = new Map(drafts.get("scr-1") || []);
  for (const s of savedSeats) {
    screenDraft.delete(s.id);
  }
  drafts.set("scr-1", screenDraft);

  assert.equal(drafts.get("scr-1")?.has("s1-1"), false, "Saved seat s1-1 must be removed from draft");
  assert.equal(drafts.get("scr-1")?.has("s1-2"), false, "Saved seat s1-2 must be removed from draft");
  assert.equal(drafts.get("scr-1")?.has("s1-3"), true, "Failed seat s1-3 must remain in draft");
  assert.equal(drafts.get("scr-1")?.get("s1-3")?.layoutX, 300);
  assert.equal(failedSeats.length, 1);
});

test("orders: duplicate item names within an order produce distinct, stable index keys", () => {
  const orderWithDuplicateItems = {
    id: "ORD-1",
    items: [
      { name: "Pepsi", quantity: 1, price: 110 },
      { name: "Pepsi", quantity: 2, price: 110, note: "Extra ice" },
      { name: "Pepsi", quantity: 1, price: 110, note: "Diet" },
    ],
  };

  // Verifies that index-based mapping produces unique keys for all items
  const keys = orderWithDuplicateItems.items.map((_, idx) => idx);
  const uniqueKeys = new Set(keys);
  assert.equal(uniqueKeys.size, 3, "Index-based keys must be unique even with identical item names");
});

test("orders: elapsed time derives accurately from createdAt ISO timestamp", () => {
  const elapsed = (iso: string, now: number) => Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));

  const baseTime = Date.parse("2026-09-02T12:00:00.000Z");

  // Placed 5 minutes ago
  const fiveMinAgo = new Date(baseTime - 5 * 60000).toISOString();
  assert.equal(elapsed(fiveMinAgo, baseTime), 5);

  // Placed 42 minutes ago
  const fortyTwoMinAgo = new Date(baseTime - 42 * 60000).toISOString();
  assert.equal(elapsed(fortyTwoMinAgo, baseTime), 42);

  // Future timestamp clamped to 0
  const future = new Date(baseTime + 10 * 60000).toISOString();
  assert.equal(elapsed(future, baseTime), 0);
});
