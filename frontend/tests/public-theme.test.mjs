import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const menu = read("app/menu/[restaurantSlug]/[tableCode]/MenuClient.tsx");
const session = read("app/session/[sessionToken]/SessionClient.tsx");
const order = read("app/order/[publicToken]/OrderTrackingClient.tsx");
const bill = read("app/bill/[sessionToken]/BillClient.tsx");
const login = read("app/login/LoginClient.tsx");
const register = read("app/register/page.tsx");
const control = read("components/PublicThemeControl.tsx");
const provider = read("components/ThemeProvider.tsx");
const rootLayout = read("app/layout.tsx");
const globals = read("app/globals.css");
const adminTables = read("app/admin/tables/page.tsx");

test("customer menu uses the shared theme and compact public control", () => {
  assert.match(menu, /<PublicThemeControl/);
  for (const token of ["--omlu-page-background", "--omlu-primary-surface", "--omlu-muted-surface", "--omlu-text-primary", "--omlu-border"]) assert.match(menu, new RegExp(token));
  assert.match(menu, /menu-options-title/);
  assert.match(menu, /menu-cart-title/);
});

test("public theme control is accessible and delegates to ThemeToggle", () => {
  assert.match(control, /aria-label="Choose color theme"/);
  assert.match(control, /<ThemeToggle/);
  assert.match(control, /<details/);
});

test("login and registration are theme-aware without changing form behavior", () => {
  for (const source of [login, register]) {
    assert.match(source, /<PublicThemeControl/);
    assert.match(source, /--omlu-primary-surface/);
    assert.match(source, /--omlu-text-primary/);
    assert.match(source, /--omlu-border/);
  }
  assert.match(login, /staffLogin/);
  assert.match(register, /registerRestaurant/);
});

test("session and order tracking retain textual status with semantic surfaces", () => {
  for (const source of [session, order]) {
    assert.match(source, /<PublicThemeControl/);
    assert.match(source, /--omlu-primary-surface/);
    assert.match(source, /--omlu-text-primary/);
  }
  assert.match(order, /orderData\.status/);
  assert.match(session, /requestStatusLabel/);
});

test("bill is theme-aware on screen and forced white and black in print", () => {
  assert.match(bill, /<PublicThemeControl/);
  assert.match(bill, /--omlu-primary-surface/);
  assert.match(bill, /print:bg-white/);
  assert.match(bill, /print:text-black/);
  assert.match(bill, /print:border-black/);
  assert.match(globals, /\.print-bill-sheet\s*\{[^}]*background:\s*#fff\s*!important;[^}]*color:\s*#000\s*!important;/s);
  assert.match(globals, /\.print-bill-sheet \*\s*\{[^}]*color:\s*#000\s*!important;[^}]*border-color:/s);
});

test("QR table print contract remains white and black", () => {
  assert.match(adminTables, /print:bg-white/);
  assert.match(adminTables, /print:text-black/);
});

test("first visit still defaults to shared System preference", () => {
  assert.match(provider, /getServerPreferenceSnapshot[\s\S]*return "system"/);
  assert.match(rootLayout, /omlu_theme/);
  assert.match(rootLayout, /prefers-color-scheme: dark/);
  assert.doesNotMatch(`${menu}\n${session}\n${order}\n${bill}\n${login}\n${register}`, /localStorage\.(?:getItem|setItem)\([^)]*theme/i);
});
