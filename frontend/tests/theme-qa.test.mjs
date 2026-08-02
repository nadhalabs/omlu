import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const globals = read("app/globals.css");
const layout = read("app/layout.tsx");
const provider = read("components/ThemeProvider.tsx");
const allUi = ["app", "components"].flatMap((directory) => fs.readdirSync(path.join(root, directory), { recursive: true })
  .filter((file) => /\.(?:tsx|css)$/.test(String(file)))
  .map((file) => read(path.join(directory, String(file))))).join("\n");

function luminance(hex) {
  const values = hex.match(/[0-9a-f]{2}/gi).map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("obsolete compatibility selectors are absent from application UI", () => {
  assert.doesNotMatch(allUi, /omlu-light-shell|contrast-dark-card|contrast-dark-row/);
});

test("one provider owns every ThemeToggle placement", () => {
  assert.equal((allUi.match(/function ThemeProvider/g) || []).length, 1);
  assert.match(provider, /THEME_STORAGE_KEY = "omlu_theme"/);
  assert.match(read("components/ThemeToggle.tsx"), /useTheme/);
  assert.match(read("components/PublicThemeControl.tsx"), /useTheme/);
  assert.doesNotMatch(read("components/PublicThemeControl.tsx"), /<ThemeToggle|system|<details/);
  assert.match(read("components/LandingThemeToggle.tsx"), /useTheme/);
});

test("anti-flash, persistence, System, and cross-tab synchronization remain intact", () => {
  assert.match(layout, /omlu_theme/);
  assert.match(layout, /prefers-color-scheme: dark/);
  assert.match(layout, /dangerouslySetInnerHTML/);
  assert.match(provider, /localStorage\.setItem/);
  assert.match(provider, /addEventListener\("change", applyTheme\)/);
  assert.match(provider, /addEventListener\("storage", handleStorage\)/);
  assert.match(provider, /useSyncExternalStore\(subscribePreference/);
  assert.match(provider, /getServerPreferenceSnapshot/);
});

test("semantic light and dark tokens cover QA states", () => {
  assert.match(globals, /:root\s*\{/);
  assert.match(globals, /\.dark\s*\{/);
  for (const token of ["page-background", "primary-surface", "elevated-surface", "text-primary", "text-secondary", "text-muted", "border", "input-background", "focus-ring", "disabled-text", "skeleton-highlight", "primary-action", "primary-action-text", "strong-action-text"]) {
    assert.equal((globals.match(new RegExp(`--omlu-${token}:`, "g")) || []).length, 2, token);
  }
});

test("core text and semantic statuses meet practical contrast targets", () => {
  const pairs = [
    ["18181b", "f7f7f5"], ["71717a", "f7f7f5"], ["fafafa", "09090b"], ["d4d4d8", "09090b"],
    ["047857", "ecfdf5"], ["c2410c", "fff7ed"], ["b91c1c", "fef2f2"],
    ["6ee7b7", "052e16"], ["fdba74", "431407"], ["fca5a5", "450a0a"],
    ["18181b", "ea580c"], ["ffffff", "b91c1c"], ["ffffff", "9333ea"],
  ];
  for (const [foreground, background] of pairs) assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background}`);
});

test("representative route families use semantic theme styles", () => {
  for (const file of [
    "app/admin/dashboard/AdminDashboardClient.tsx", "app/staff/tables/StaffTablesClient.tsx",
    "app/kitchen/[restaurantSlug]/KitchenDashboardClient.tsx", "app/menu/[restaurantSlug]/[tableCode]/MenuClient.tsx",
    "app/login/LoginClient.tsx", "app/page.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /--omlu-(?:page-background|primary-surface|text-primary|border)/, file);
  }
});

test("charts and staff theme popovers use theme-aware contracts", () => {
  const charts = read("app/admin/performance/PerformanceCharts.tsx");
  assert.match(charts, /stroke="var\(--omlu-border\)"/);
  assert.match(charts, /stroke="var\(--omlu-accent\)"/);
  assert.match(read("components/staff/StaffBottomNav.tsx"), /calc\(100vw-2rem\)/);
});

test("bill and QR print-white contracts remain explicit", () => {
  const bill = read("app/bill/[sessionToken]/BillClient.tsx");
  const tables = read("app/admin/tables/page.tsx");
  assert.match(bill, /print:bg-white/);
  assert.match(bill, /print:text-black/);
  assert.match(globals, /\.print-bill-sheet \*/);
  assert.match(tables, /print:bg-white/);
  assert.match(tables, /print:text-black/);
});
