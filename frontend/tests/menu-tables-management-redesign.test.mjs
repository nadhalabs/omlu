import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const menu = readFileSync(new URL("../app/admin/menu/page.tsx", import.meta.url), "utf8");
const tables = readFileSync(new URL("../app/admin/tables/page.tsx", import.meta.url), "utf8");

test("Menu Management exposes clear hierarchy, filters, and labelled actions", () => {
  for (const text of ["Organize categories and configure dishes served to customers.", "Add item", "Import menu", "Categories", "Menu items", "Add category", "Edit", "Available", "Unavailable"]) assert.ok(menu.includes(text), text);
  assert.match(menu, /aria-label="Filter by category"/);
  assert.match(menu, /aria-label="Search menu items"/);
  assert.doesNotMatch(menu, /title="Edit Item"[\s\S]*✏️/);
});

test("Menu Management category filtering is explicit, clearable, and category-aware", () => {
  assert.match(menu, /useState<string>\("all"\)/, "All Categories is the default");
  assert.match(menu, /item\.category_id === Number\(selectedCategoryId\)/, "Items filter client-side by category");
  assert.match(menu, /selectedCategory \? "border-orange-500 ring-1 ring-orange-500\/30"/, "Selected category has an active state");
  assert.ok(menu.includes("Filtered by:"));
  assert.match(menu, /const clearCategoryFilter = \(\) => setSelectedCategoryId\("all"\)/);
  assert.match(menu, /onClick=\{clearCategoryFilter\}/);
  assert.ok(menu.includes("Show all categories"));
  assert.ok(menu.includes("No menu items in ${selectedCategory.name_en} yet."));
  assert.ok(menu.includes('`${filteredItems.length} ${filteredItems.length === 1 ? "item" : "items"} in ${selectedCategory.name_en}`'));
});

test("menu destructive actions live in accessible More actions menus", () => {
  assert.match(menu, /aria-label=\{`More actions for \$\{cat\.name_en\}`\}/);
  assert.match(menu, /Delete category/);
  assert.match(menu, /aria-label=\{`More actions for \$\{item\.name_en\}`\}/);
  assert.match(menu, /Delete permanently/);
  assert.match(menu, /confirmDialog\(\{ title: "Delete category\?"/);
  assert.match(menu, /Delete “\$\{item\.name_en\}” permanently\?/);
  assert.match(menu, /Move items and delete/);
  assert.match(menu, /Delete category and items/);
  assert.match(menu, /categoryDeleteText !== category\.name_en/);
});

test("Tables Management uses labelled creation, QR, and public-menu controls", () => {
  for (const text of ["Create tables, manage public access, and print QR codes.", "Print all QR codes", "Add new table", "Registered tables", "Create Table", "Open public menu", "Download QR"]) assert.ok(tables.includes(text), text);
  assert.match(tables, /htmlFor="new-table-number"/);
  assert.match(tables, /aria-describedby="new-table-help"/);
  assert.match(tables, /title=\{t\.table_code\}/);
});

test("table secondary operations are grouped and regeneration remains confirmed", () => {
  assert.match(tables, /aria-label=\{`More actions for Table \$\{t\.table_number\}`\}/);
  for (const action of ["Edit table", "Deactivate table", "Activate table", "Regenerate code"]) assert.ok(tables.includes(action), action);
  assert.match(tables, /Regenerate Table \$\{table\.table_number\} QR code\?/);
  assert.match(tables, /The current QR link will stop working immediately/);
});

test("menu and table cards avoid compressed two-column layouts before wide screens", () => {
  assert.match(menu, /grid grid-cols-1 gap-4 xl:grid-cols-2/);
  assert.match(tables, /grid grid-cols-1 gap-4 xl:grid-cols-2/);
  assert.doesNotMatch(`${menu}\n${tables}`, /grid-cols-1 md:grid-cols-2 gap-4/);
});
