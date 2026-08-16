import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const session = fs.readFileSync(new URL("../app/session/[sessionToken]/SessionClient.tsx", import.meta.url), "utf8");
const capabilities = fs.readFileSync(new URL("../lib/kitchenCapabilities.ts", import.meta.url), "utf8");

test("direct kitchen mode centralizes customer workflow capabilities", () => {
  assert.match(capabilities, /customerSelfCancellationAllowed: usesKds/);
  assert.match(capabilities, /showLiveKitchenProgress: usesKds/);
  assert.match(session, /order\.kitchen_mode_snapshot \|\| session\.kitchen_mode/);
});

test("direct kitchen mode shows honest status and staff-assisted cancellation copy", () => {
  assert.match(session, /Order sent to kitchen/);
  assert.match(session, /Need to change or cancel an item\? Please contact restaurant staff\./);
  assert.match(session, /capabilities\.customerSelfCancellationAllowed &&/);
  assert.match(session, /!capabilities\.showLiveKitchenProgress/);
});
