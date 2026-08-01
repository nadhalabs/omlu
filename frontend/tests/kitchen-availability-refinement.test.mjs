import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dialog = readFileSync(new URL("../app/kitchen/[restaurantSlug]/KitchenAvailabilityDialog.tsx", import.meta.url), "utf8");

test("Kitchen availability rows use accessible state-labelled buttons", () => {
  for (const copy of ["Available", "Unavailable", "Updating…", "Current state"]) {
    assert.ok(dialog.includes(copy), copy);
  }
  assert.match(dialog, /item\.category_name/);
  assert.match(dialog, /aria-pressed=\{item\.is_available\}/);
  assert.match(dialog, /aria-label=\{`\$\{item\.name_en\}: \$\{item\.is_available \? "Available" : "Unavailable"\}`\}/);
  assert.match(dialog, /item\.is_available \? "border-green-700 bg-green-950\/50 text-green-300/);
  assert.match(dialog, /"border-red-800 bg-red-950\/40 text-red-300/);
  assert.doesNotMatch(dialog, /Mark unavailable|Mark available/);
  assert.doesNotMatch(dialog, /role="switch"/);
});

test("Kitchen availability mutation remains row-scoped and preserves the API contract", () => {
  assert.match(dialog, /pendingIds\[item\.id\]/);
  assert.match(dialog, /disabled=\{pending\}/);
  assert.doesNotMatch(dialog, /disabled=\{pendingId !== null\}/);
  assert.match(dialog, /`\/api\/staff\/availability\/items\/\$\{item\.id\}`/);
  assert.match(dialog, /method: "PATCH"/);
  assert.match(dialog, /body: JSON\.stringify\(\{ is_available: next \}\)/);
  assert.match(dialog, /onEvent: \(\) => void load\(\)/);
  assert.match(dialog, /min-h-11/);
});
