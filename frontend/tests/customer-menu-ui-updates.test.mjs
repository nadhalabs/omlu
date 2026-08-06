import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("MenuClient removes pre-order onboarding card when menuState is ready", () => {
  const menu = read("app/menu/[restaurantSlug]/[tableCode]/MenuClient.tsx");

  // In TableOrderStatusCard, ready menuState returns null
  assert.match(menu, /if \(menuState === "ready"\) \{\s*return null;\s*\}/);

  // TableOrderStatusCard component does not render onboarding title in ready state
  const statusCardSource = menu.slice(menu.indexOf("function TableOrderStatusCard"), menu.indexOf("export default function MenuClient"));
  assert.doesNotMatch(statusCardSource, /readyToOrderTitle/);
});

test("MenuClient renders exactly one search input with id menu-search", () => {
  const menu = read("app/menu/[restaurantSlug]/[tableCode]/MenuClient.tsx");

  assert.match(menu, /id="menu-search"/);
  assert.match(menu, /type="search"/);
  assert.equal((menu.match(/id="menu-search"/g) || []).length, 1);
  assert.equal((menu.match(/type="search"/g) || []).length, 1);
});

test("MenuClient implements synthetic All Items category filter selected by default", () => {
  const menu = read("app/menu/[restaurantSlug]/[tableCode]/MenuClient.tsx");

  // State initialized to "all"
  assert.match(menu, /useState<number \| "all">\("all"\)/);

  // Translations include All Items in en and ml
  assert.match(menu, /allItems: "All Items"/);
  assert.match(menu, /allItems: "എല്ലാ ഇനങ്ങളും"/);

  // Synthetic "all" button rendered first in category tabs
  assert.match(menu, /id="cat-tab-all"/);
  assert.match(menu, /\{t\.allItems\}/);

  // visibleCategories includes all displayCategories when activeCategory === "all"
  assert.match(menu, /activeCategory === "all"/);
});

test("MenuClient defers ordering session creation until first order placement", () => {
  const menu = read("app/menu/[restaurantSlug]/[tableCode]/MenuClient.tsx");
  const beforePlaceOrder = menu.slice(0, menu.indexOf("const handlePlaceOrder"));

  // Browsing/adding to cart does not invoke createFirstTableOrder or start session
  assert.doesNotMatch(beforePlaceOrder, /createFirstTableOrder\(/);
  assert.match(menu, /createFirstTableOrder\(/);
});
