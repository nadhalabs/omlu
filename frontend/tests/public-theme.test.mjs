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
const register = read("app/register/RegisterClient.tsx");
const control = read("components/PublicThemeControl.tsx");
const landingControl = read("components/LandingThemeToggle.tsx");
const landing = read("app/page.tsx");
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

test("public theme control is a direct accessible light and dark icon toggle", () => {
  assert.match(control, /useTheme/);
  assert.match(control, /resolvedTheme/);
  assert.match(control, /setPreference\(isDark \? "light" : "dark"\)/);
  assert.match(control, /"Switch to light mode"/);
  assert.match(control, /"Switch to dark mode"/);
  assert.match(control, /type="button"/);
  assert.match(control, /size-11/);
  assert.doesNotMatch(control, /<ThemeToggle|system|<details|<summary|Appearance|>Theme</);
});

test("landing uses a compact direct light and dark toggle without a theme panel", () => {
  assert.match(landing, /<LandingThemeToggle/);
  assert.doesNotMatch(landing, /<PublicThemeControl|<ThemeToggle/);
  assert.match(landingControl, /useTheme/);
  assert.match(landingControl, /resolvedTheme/);
  assert.match(landingControl, /setPreference\(isDark \? "light" : "dark"\)/);
  assert.match(landingControl, /"Switch to light mode"/);
  assert.match(landingControl, /"Switch to dark mode"/);
  assert.match(landingControl, /type="button"/);
  assert.match(landingControl, /size-11/);
  assert.match(landingControl, /focus-visible:outline/);
  assert.doesNotMatch(landingControl, /<ThemeToggle|system|<details|<summary/);
});

test("login and registration are theme-aware without changing form behavior", () => {
  for (const source of [login, register]) {
    assert.match(source, /<LandingThemeToggle/);
    assert.doesNotMatch(source, /<PublicThemeControl/);
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

test("every QR customer surface uses the compact public toggle", () => {
  for (const source of [menu, session, order, bill]) assert.match(source, /<PublicThemeControl/);
  assert.equal((`${menu}\n${session}\n${order}\n${bill}`.match(/<ThemeToggle/g) || []).length, 0);
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

test("authentication pages present retryable connectivity errors without raw internals", () => {
  const presentation = read("lib/authError.ts");
  const alert = read("components/AuthErrorAlert.tsx");
  assert.match(presentation, /Unable to connect/);
  assert.match(presentation, /We couldn’t reach OMLU\. Check your internet connection and try again\./);
  assert.match(presentation, /You appear to be offline\. Reconnect to the internet and try again\./);
  assert.match(presentation, /OMLU is temporarily unavailable\. Please try again shortly\./);
  assert.match(presentation, /The connection took too long/);
  assert.match(presentation, /Invalid restaurant credentials, email, or password\./);
  assert.match(presentation, /error\.message/);
  assert.match(alert, /role="alert"/);
  assert.match(alert, /Try again/);
  assert.match(alert, /disabled=\{loading\}/);
  assert.doesNotMatch(`${login}\n${register}`, /Could not connect|Next\.js|API server|proxy server|authentication server/);
});

test("login retry keeps current values and rejects duplicate submissions", () => {
  assert.match(login, /submissionPending\.current/);
  assert.match(login, /if \(submissionPending\.current\) return/);
  assert.match(login, /onRetry=\{\(\) => void submitLogin\(\)\}/);
  assert.match(login, /restaurant_slug: restaurantSlug\.trim\(\)\.toLowerCase\(\)/);
  assert.match(login, /login: login\.trim\(\)/);
  assert.match(login, /password,/);
});
