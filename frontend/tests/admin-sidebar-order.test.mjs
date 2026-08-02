import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const layout = fs.readFileSync(new URL("../app/admin/layout.tsx", import.meta.url), "utf8");

test("admin sidebar uses the required navigation order without duplicate entries", () => {
  const nav = layout.match(/<nav[^>]*aria-label="Admin navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav, "admin navigation should exist");

  const labels = [...nav.matchAll(/label="(?:[^" ]+ )?([^"]+)"|<PendingPaymentsSidebarLink/g)].map(
    (match) => match[0].startsWith("<PendingPaymentsSidebarLink") ? "Pending Payments" : match[1],
  );

  assert.deepEqual(labels, [
    "Dashboard",
    "Quick Sale",
    "Pending Payments",
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
