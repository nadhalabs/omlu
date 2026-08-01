import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const layout = read("app/admin/layout.tsx");
const sidebarLink = read("app/admin/AdminSidebarLink.tsx");
const historyPage = read("app/admin/history/page.tsx");

test("admin navigation exposes one canonical History entry", () => {
  assert.match(layout, /href="\/admin\/history\?view=orders" label="History"/);
  assert.doesNotMatch(layout, /label="(?:Order|Bill|Session) History"/);
  assert.match(sidebarLink, /href\.split\("\?", 1\)\[0\]/);
});

test("unified History page has accessible canonical tabs and mounts one selected view", () => {
  assert.ok(historyPage.includes(`href={\`/admin/history?view=\${tab.view}\`}`));
  for (const view of ["orders", "bills", "sessions"]) {
    assert.ok(historyPage.includes(`"${view}"`));
  }
  assert.match(historyPage, /role="tablist"/);
  assert.match(historyPage, /role="tab"/);
  assert.match(historyPage, /aria-selected=\{isActive\}/);
  assert.match(historyPage, /view === "orders"[\s\S]*OrderHistoryClient[\s\S]*view === "bills"[\s\S]*BillHistoryClient[\s\S]*SessionHistoryClient/);
  assert.match(historyPage, /redirect\("\/admin\/history\?view=orders"\)/);
});

test("legacy history routes redirect to their canonical tabs", () => {
  for (const [path, view] of [
    ["orders/history/page.tsx", "orders"],
    ["bills/history/page.tsx", "bills"],
    ["sessions/history/page.tsx", "sessions"],
  ]) {
    assert.match(read(`app/admin/${path}`), new RegExp(`redirect\\(\\"/admin/history\\?view=${view}\\"\\)`));
  }
});
