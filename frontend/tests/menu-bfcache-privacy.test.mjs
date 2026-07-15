import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(
  new URL("../app/menu/[restaurantSlug]/[tableCode]/MenuClient.tsx", import.meta.url),
  "utf8"
);

test("menu route revalidates persisted bfcache restores before trusting React state", () => {
  assert.match(source, /window\.addEventListener\("pageshow", handlePageShow\)/);
  assert.match(source, /if \(!event\.persisted\) return;/);
  assert.match(source, /validateSavedSession\(\{ clearCachedStateFirst: true \}\)/);
  assert.match(source, /if \(options\.clearCachedStateFirst\) \{/);
  assert.match(source, /clearOrderingState\(\);/);
});

test("menu route does not expose a receipt action for completed cached sessions", () => {
  assert.doesNotMatch(source, /router\.push\(`\/bill\/\$\{/);
  assert.doesNotMatch(source, /onClick=\{\(\) => router\.push\(`\/bill/);
});
