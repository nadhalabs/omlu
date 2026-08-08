import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const layout = fs.readFileSync(new URL("../app/admin/layout.tsx", import.meta.url), "utf8");

test("admin sidebar uses the required navigation order without duplicate entries", () => {
  const nav = layout.match(/<nav[^>]*aria-label="Admin navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav, "admin navigation should exist");

  // Extract the full label= attribute values; labels are now clean text (no emoji prefix).
  const labels = [...nav.matchAll(/label="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(labels, [
    "Dashboard",
    "Quick Sale",
    "Billing Counter",
    "Kitchen Dashboard",
    "Service Requests",
    "History",
    "Tables Map",
    "Menu Items",
    "Staff Management",
    "Performance",
    "Settings",
  ]);
});

test("nav icon props passed from the Server Component are plain strings, not function/component references", () => {
  // Regression: passing ComponentType as a prop crashes Next.js RSC serialization with
  // "Functions cannot be passed directly to Client Components".
  // icon= must always be a serializable string literal (NavIconId), never a JSX expression
  // containing a component reference like icon={IconFoo}.
  const nav = layout.match(/<nav[^>]*aria-label="Admin navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav, "admin navigation should exist");

  // Find every icon= attribute usage inside the nav block.
  const iconProps = [...nav.matchAll(/\bicon=(\{[^}]*\}|"[^"]*")/g)];
  assert.ok(iconProps.length > 0, "nav items should carry icon props");

  for (const [full, value] of iconProps) {
    // A plain string literal looks like: icon="dashboard"
    // A JSX expression containing a component looks like: icon={IconFoo} or icon={someFunc}
    const isStringLiteral = value.startsWith('"') && value.endsWith('"');
    assert.ok(
      isStringLiteral,
      `icon prop must be a plain string literal, but found: ${full} — ` +
        "passing a function/component across the Server→Client boundary causes a Next.js RSC crash"
    );
  }
});

test("admin sidebar layout does not render Appearance, Light, Dark, or System theme controls", () => {
  // ThemeToggle was removed from the sidebar and lives exclusively in /admin/settings.
  assert.doesNotMatch(layout, /<ThemeToggle/, "ThemeToggle must not be rendered in the sidebar layout");
  assert.doesNotMatch(layout, /import.*ThemeToggle/, "ThemeToggle must not be imported in the sidebar layout");
  // The sidebar JSX must not contain the Appearance legend or Light/Dark/System button labels
  // that the ThemeToggle component renders internally.
  assert.doesNotMatch(layout, /\bAppearance\b/, "Appearance label must not appear in the sidebar layout");
  assert.doesNotMatch(layout, /\bLight\b|\bDark\b|\bSystem\b/, "Theme option labels must not appear in the sidebar layout");
});

test("admin sidebar uses desktop sticky viewport height and internal nav scrolling", () => {
  // The sidebar aside element must use lg:sticky, lg:top-0, and lg:h-dvh so it remains anchored to the viewport
  // and does not stretch when main page content is tall.
  const asideMatch = layout.match(/<aside[^>]*className="([^"]+)"/)?.[1];
  assert.ok(asideMatch, "aside element with className should exist");
  assert.match(asideMatch, /lg:sticky/, "aside must be sticky on desktop");
  assert.match(asideMatch, /lg:top-0/, "aside must anchor to top-0 on desktop");
  assert.match(asideMatch, /lg:h-dvh/, "aside must use viewport height on desktop");
  assert.doesNotMatch(asideMatch, /lg:static/, "aside must not use lg:static which disables sticky positioning");

  // Navigation container must handle internal overflow on desktop if content exceeds viewport
  const navMatch = layout.match(/<nav[^>]*className="([^"]+)"/)?.[1];
  assert.ok(navMatch, "nav element with className should exist");
  assert.match(navMatch, /lg:overflow-y-auto/, "nav must allow vertical scrolling on desktop");
  assert.match(navMatch, /lg:min-h-0/, "nav must allow flex shrinking on desktop");
});
