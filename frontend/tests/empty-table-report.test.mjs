import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const detail = read("app/staff/tables/[tableId]/StaffTableDetailClient.tsx");
const tables = read("app/staff/tables/StaffTablesClient.tsx");
const api = read("lib/staffTables.ts");

test("staff can report an active table empty with the required confirmation and reported state", () => {
  assert.match(detail, /staffInfo\?\.role === "staff"/);
  assert.match(detail, /Report Table Empty/);
  assert.match(detail, /Report this table as empty\?/);
  assert.match(detail, /The owner or admin will review the table and decide whether to close the session\./);
  assert.match(detail, /Report Empty Table/);
  assert.match(detail, /Empty table reported/);
  assert.match(api, /empty-table-report/);
  assert.match(detail, /reportStaffTableEmpty\(tableId, detail\.session!\.session_token\)/);
  assert.match(api, /JSON\.stringify\(\{ session_token: sessionToken \}\)/);
});

test("Active Tables prioritizes and counts reports with owner-admin actions", () => {
  assert.match(tables, /empty-table/);
  assert.match(tables, /reportCount === 1 \? "report" : "reports"/);
  assert.match(tables, /Staff reported this table empty/);
  assert.match(tables, /Reported by/);
  assert.match(tables, /canResolveReports/);
  assert.match(tables, /staffInfo\?\.role === "owner" \|\| staffInfo\?\.role === "admin"/);
  assert.match(tables, /Close Session/);
  assert.match(tables, /Dismiss Report/);
});

test("close and dismiss confirmations preserve the required safety wording", () => {
  assert.match(tables, /Close Table \$\{table\.table_number\}\?/);
  assert.match(tables, /This will cancel all orders from this session, remove them from the active kitchen dashboard, void the draft bill, and end the session\./);
  assert.match(tables, /Dismiss this empty-table report\?/);
  assert.match(tables, /useRealtime/);
  assert.match(tables, /onEvent: \(\) => void load\(\)/);
});
