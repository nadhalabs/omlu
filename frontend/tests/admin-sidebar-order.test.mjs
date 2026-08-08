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
