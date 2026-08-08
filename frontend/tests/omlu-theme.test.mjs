import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const globals = read("app/globals.css");
const layout = read("app/layout.tsx");
const provider = read("components/ThemeProvider.tsx");
const toggle = read("components/ThemeToggle.tsx");
const ui = read("components/OmluUiProvider.tsx");
const adminLayout = read("app/admin/layout.tsx");
const adminSources = fs.readdirSync(path.join(root, "app/admin"), { recursive: true })
  .filter((file) => String(file).endsWith(".tsx"))
  .map((file) => read(path.join("app/admin", String(file))))
  .join("\n");
const bill = read("app/bill/[sessionToken]/BillClient.tsx");

test("light and dark semantic theme variables exist", () => {
  assert.match(globals, /:root\s*\{/);
  assert.match(globals, /\.dark\s*\{/);
  for (const token of ["page-background", "primary-surface", "muted-surface", "elevated-surface", "text-primary", "text-secondary", "text-muted", "border", "border-strong", "input-background", "hover-background", "focus-ring", "primary-action", "primary-action-text", "success-background", "warning-background", "destructive-background"]) {
    assert.match(globals, new RegExp(`--omlu-${token}:`));
  }
});

test("anti-flash script resolves omlu_theme before the application body", () => {
  assert.match(layout, /omlu_theme/);
  assert.match(layout, /prefers-color-scheme: dark/);
  assert.match(layout, /dangerouslySetInnerHTML/);
  assert.match(layout, /suppressHydrationWarning/);
  assert.ok(layout.indexOf("dangerouslySetInnerHTML") < layout.indexOf("<body"));
});

test("theme provider supports persistence, system changes, and the html dark class", () => {
  for (const preference of ["light", "dark", "system"]) assert.match(provider, new RegExp(`"${preference}"`));
  assert.match(provider, /localStorage\.setItem\(THEME_STORAGE_KEY, next\)/);
  assert.match(provider, /addEventListener\("change", applyTheme\)/);
  assert.match(provider, /removeEventListener\("change", applyTheme\)/);
  assert.match(provider, /document\.documentElement\.classList\.toggle\("dark"/);
});

test("Admin theme control lives in Settings (Appearance section), not in the sidebar", () => {
  // The sidebar was simplified: ThemeToggle is no longer rendered in the admin layout.
  assert.doesNotMatch(adminLayout, /<ThemeToggle/);
  // Verify it has not been accidentally deleted altogether — it must exist in the Settings page.
  const adminSettings = read("app/admin/settings/AdminSettingsClient.tsx");
  assert.match(adminSettings, /<ThemeToggle/);
  assert.match(adminSettings, /Appearance/);
  // The ThemeToggle component itself must still expose the three-state control.
  assert.match(toggle, /<fieldset/);
  assert.match(toggle, /aria-label="Theme preference"/);
  assert.match(toggle, /aria-pressed=/);
  assert.match(toggle, /✓/);
});

test("forced light shell mappings are removed and Admin uses semantic surfaces", () => {
  assert.doesNotMatch(globals, /\.omlu-light-shell/);
  assert.doesNotMatch(adminSources, /omlu-light-shell/);
  assert.match(adminSources, /--omlu-primary-surface/);
  assert.match(adminSources, /--omlu-text-primary/);
  assert.match(adminLayout, /omlu-admin-shell/);
});

test("shared dialogs and toasts use semantic theme tokens", () => {
  assert.match(ui, /--omlu-elevated-surface/);
  assert.match(ui, /--omlu-destructive-background/);
  assert.match(ui, /--omlu-success-background/);
  assert.match(ui, /--omlu-warning-background/);
});

test("bill print-white rules remain intact", () => {
  assert.match(bill, /print:bg-white/);
  assert.match(bill, /print:text-black/);
});
