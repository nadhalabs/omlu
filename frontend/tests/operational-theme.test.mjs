import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const staffNav = read("components/staff/StaffBottomNav.tsx");
const kitchen = read("app/kitchen/[restaurantSlug]/KitchenDashboardClient.tsx");
const availability = read("app/kitchen/[restaurantSlug]/KitchenAvailabilityDialog.tsx");
const themeProvider = read("components/ThemeProvider.tsx");
const adminLayout = read("app/admin/layout.tsx");

const collect = (directory) => fs.readdirSync(path.join(root, directory), { recursive: true })
  .filter((file) => String(file).endsWith(".tsx"))
  .map((file) => read(path.join(directory, String(file))))
  .join("\n");
const staff = `${collect("app/staff")}\n${collect("components/staff")}`;
const kitchenSources = collect("app/kitchen");

test("Staff shared navigation renders the existing accessible ThemeToggle", () => {
  assert.match(staffNav, /import \{ ThemeToggle \} from "@\/components\/ThemeToggle"/);
  assert.match(staffNav, /<ThemeToggle/);
  assert.match(staffNav, /aria-label="Choose Staff theme"/);
});

test("Kitchen header renders the existing ThemeToggle near operational controls", () => {
  assert.match(kitchen, /import \{ ThemeToggle \} from "@\/components\/ThemeToggle"/);
  assert.match(kitchen, /<ThemeToggle/);
  assert.ok(kitchen.indexOf("<ThemeToggle") < kitchen.indexOf("<button\n            onClick={handleToggleSound}"));
});

test("Staff core surfaces use shared semantic theme styles", () => {
  for (const token of ["--omlu-page-background", "--omlu-primary-surface", "--omlu-muted-surface", "--omlu-text-primary", "--omlu-text-secondary", "--omlu-border"]) {
    assert.match(staff, new RegExp(token));
  }
  assert.doesNotMatch(staff, /omlu-light-shell|contrast-dark-card|contrast-dark-row/);
});

test("Kitchen cards and availability panel use theme-aware surfaces", () => {
  assert.match(kitchen, /bg-\[var\(--omlu-primary-surface\)\]/);
  assert.match(kitchen, /text-\[var\(--omlu-text-primary\)\]/);
  assert.match(kitchen, /border-\[var\(--omlu-border\)\]/);
  assert.match(availability, /bg-\[var\(--omlu-page-background\)\]/);
  assert.match(availability, /bg-\[var\(--omlu-primary-surface\)\]/);
  assert.doesNotMatch(kitchenSources, /omlu-light-shell|contrast-dark-card|contrast-dark-row/);
});

test("Kitchen status stages remain text-labelled and visually distinct", () => {
  for (const label of ["New", "Accepted", "Preparing", "Ready", "Mark Served"]) assert.match(kitchen, new RegExp(label));
  for (const color of ["text-orange-500", "text-cyan-500", "text-purple-500", "text-green-500"]) assert.match(kitchen, new RegExp(color));
  for (const action of ["bg-orange-600", "bg-cyan-600", "bg-purple-600", "bg-green-600"]) assert.match(kitchen, new RegExp(action));
  assert.match(kitchen, /\{elapsedTime\}/);
});

test("Phase 2 reuses the single Phase 1 preference and provider", () => {
  assert.match(themeProvider, /THEME_STORAGE_KEY = "omlu_theme"/);
  assert.match(adminLayout, /<ThemeToggle/);
  assert.doesNotMatch(`${staff}\n${kitchenSources}`, /localStorage\.(?:getItem|setItem)\([^)]*theme/i);
  assert.doesNotMatch(`${staff}\n${kitchenSources}`, /createContext<.*Theme|function ThemeProvider/);
});
