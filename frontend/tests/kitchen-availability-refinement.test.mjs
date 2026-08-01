import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dialog = readFileSync(new URL("../app/kitchen/[restaurantSlug]/KitchenAvailabilityDialog.tsx", import.meta.url), "utf8");

test("Kitchen availability rows separate current status from the labelled action", () => {
  for (const copy of ["Available", "Unavailable", "Mark unavailable", "Mark available", "Updating…"]) {
    assert.ok(dialog.includes(copy), copy);
  }
  assert.match(dialog, /item\.category_name/);
  assert.match(dialog, /aria-label=\{`\$\{item\.is_available \? "Mark unavailable" : "Mark available"\}: \$\{item\.name_en\}`\}/);
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
