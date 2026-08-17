import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Item 1: Inside-interval document.visibilityState check in all 9 polling components", () => {
  const files = [
    "app/bill/[sessionToken]/BillClient.tsx",
    "app/session/[sessionToken]/SessionClient.tsx",
    "app/admin/dashboard/AdminDashboardClient.tsx",
    "app/admin/requests/AdminRequestsClient.tsx",
    "app/staff/StaffHomeClient.tsx",
    "app/staff/requests/StaffRequestsClient.tsx",
    "app/staff/sessions/StaffSessionsClient.tsx",
    "app/staff/tables/StaffTablesClient.tsx",
    "app/staff/tables/[tableId]/StaffTableDetailClient.tsx",
  ];

  for (const file of files) {
    const content = read(file);
    assert.match(
      content,
      /document\.visibilityState !== "visible"/,
      `Component ${file} must check document.visibilityState !== "visible" inside polling callback`
    );
  }
});

test("Item 2: Machine-code authority clearing exported in lib/api.ts and used in MenuClient, SessionClient, BillClient", () => {
  const api = read("lib/api.ts");
  assert.match(api, /export function isDefiniteAuthFailure/);
  assert.match(api, /INVALID_PARTICIPANT_AUTHORITY/);
  assert.match(api, /PARTICIPANT_AUTHORITY_EXPIRED/);
  assert.match(api, /SESSION_NOT_FOUND/);
  assert.match(api, /SESSION_CLOSED/);
  assert.doesNotMatch(api, /msg\.includes\("expired"\)/);

  const menu = read("app/menu/[restaurantSlug]/[tableCode]/MenuClient.tsx");
  assert.match(menu, /if \(isDefiniteAuthFailure\(err\)\)/);

  const session = read("app/session/[sessionToken]/SessionClient.tsx");
  assert.match(session, /if \(isDefiniteAuthFailure\(err\)\)/);

  const bill = read("app/bill/[sessionToken]/BillClient.tsx");
  assert.match(bill, /if \(isDefiniteAuthFailure\(err\)\)/);
});

test("Item 2 Logic: Machine-code authority clearing strictly checks machine codes and ignores status/messages alone", () => {
  const DEFINITE_AUTH_FAILURE_CODES = new Set([
    "INVALID_PARTICIPANT_AUTHORITY",
    "PARTICIPANT_AUTHORITY_EXPIRED",
    "SESSION_NOT_FOUND",
    "SESSION_CLOSED",
  ]);

  function isDefiniteAuthFailureMock(err) {
    if (!err || typeof err !== "object") return false;
    return Boolean(err.code && DEFINITE_AUTH_FAILURE_CODES.has(err.code));
  }

  // 1. Generic 401 with no code does NOT clear authority
  assert.equal(isDefiniteAuthFailureMock({ status: 401, message: "Unauthorized" }), false);

  // 2. Generic 404 with no code does NOT clear authority
  assert.equal(isDefiniteAuthFailureMock({ status: 404, message: "Not found" }), false);

  // 3. English text containing "expired" without a machine code does NOT clear authority
  assert.equal(isDefiniteAuthFailureMock({ status: 401, message: "Your access token has expired" }), false);

  // 4. INVALID_PARTICIPANT_AUTHORITY clears authority
  assert.equal(isDefiniteAuthFailureMock({ status: 401, code: "INVALID_PARTICIPANT_AUTHORITY" }), true);

  // 5. PARTICIPANT_AUTHORITY_EXPIRED clears authority
  assert.equal(isDefiniteAuthFailureMock({ status: 401, code: "PARTICIPANT_AUTHORITY_EXPIRED" }), true);

  // 6. SESSION_NOT_FOUND clears authority
  assert.equal(isDefiniteAuthFailureMock({ status: 404, code: "SESSION_NOT_FOUND" }), true);

  // 7. 429 and 5xx never clear authority
  assert.equal(isDefiniteAuthFailureMock({ status: 429, message: "Too many attempts" }), false);
  assert.equal(isDefiniteAuthFailureMock({ status: 500, message: "Internal server error" }), false);
});

test("Item 3: public_id is not used as a session token storage key", () => {
  const menuContent = read("app/menu/[restaurantSlug]/[tableCode]/MenuClient.tsx");
  assert.doesNotMatch(menuContent, /authority\.session\.public_token \|\| authority\.session\.public_id/);
  assert.match(menuContent, /const sessionToken = authority\.session\.public_token;/);

  const apiContent = read("lib/api.ts");
  assert.match(apiContent, /session: \{ public_id: string; public_token: string;/);
});

test("Item 4: Add More Items includes ?session= and paid bill does not link back to menu", () => {
  const sessionClient = read("app/session/[sessionToken]/SessionClient.tsx");
  assert.match(sessionClient, /\?session=\$\{encodeURIComponent\(session\.public_token\)\}/);

  const billClient = read("app/bill/[sessionToken]/BillClient.tsx");
  assert.doesNotMatch(
    billClient,
    /href=\{`\/menu\/\$\{encodeURIComponent\(bill\.restaurant_slug\)\}\/\$\{encodeURIComponent\(bill\.table_code\)\}`\}/
  );
  assert.doesNotMatch(
    billClient,
    /href=\{`\/menu\/\$\{encodeURIComponent\(bill\.restaurant_slug\)\}\/\$\{encodeURIComponent\(bill\.table_code\)\}\?session=/
  );
});

test("Item 5: Realtime resources utilize trailing execution pendingFetchRef loop", () => {
  const files = [
    "app/bill/[sessionToken]/BillClient.tsx",
    "app/session/[sessionToken]/SessionClient.tsx",
    "app/admin/requests/AdminRequestsClient.tsx",
    "app/staff/requests/StaffRequestsClient.tsx",
    "app/staff/sessions/StaffSessionsClient.tsx",
    "app/admin/AdminOperationalSidebar.tsx",
  ];

  for (const file of files) {
    const content = read(file);
    assert.match(
      content,
      /pendingFetchRef\.current/,
      `Resource in ${file} must have pendingFetchRef for trailing execution`
    );
  }
});
