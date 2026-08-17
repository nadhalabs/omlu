import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const menu = read("app/menu/[restaurantSlug]/[tableCode]/MenuClient.tsx");
const session = read("app/session/[sessionToken]/SessionClient.tsx");
const bill = read("app/bill/[sessionToken]/BillClient.tsx");
const queryCache = read("lib/queryCache.ts");

test("validateSavedSession recovers participant token from session token fallback", () => {
  assert.match(menu, /readSessionParticipantToken\(tokenToValidate\)/);
  assert.match(menu, /saveParticipantToken\(restaurantSlug, tableCode, savedParticipantToken\)/);
});

test("validateSavedSession does not clear authority on transient network or server errors", () => {
  assert.match(menu, /if \(isDefiniteAuthFailure\(err\)\)/);
  assert.match(menu, /Connection issue\. Retrying table session status\.\.\./);
});

test("handleJoinTable standardizes storage keys on authority.session.public_token", () => {
  assert.match(menu, /const sessionToken = authority\.session\.public_token;/);
  assert.match(menu, /savePublicSessionToken\(restaurantSlug, tableCode, sessionToken\)/);
  assert.match(menu, /saveSessionParticipantToken\(sessionToken, authority\.participant_token\)/);
});

test("SessionClient handleAddMore saves table-scoped and session-scoped authority tokens before navigating", () => {
  assert.match(session, /savePublicSessionToken\(\s*session\.restaurant_slug,\s*session\.table_code,\s*session\.public_token\s*\)/);
  assert.match(session, /saveParticipantToken\(\s*session\.restaurant_slug,\s*session\.table_code,\s*activeParticipantToken\s*\)/);
  assert.match(session, /saveSessionParticipantToken\(session\.public_token, activeParticipantToken\)/);
  assert.match(session, /\?session=\$\{encodeURIComponent\(session\.public_token\)\}/);
});

test("BillClient paid completion does not link back to the table menu", () => {
  assert.doesNotMatch(bill, /Scan table QR for a new visit/);
  assert.doesNotMatch(
    bill,
    /href=\{`\/menu\/\$\{encodeURIComponent\(bill\.restaurant_slug\)\}\/\$\{encodeURIComponent\(bill\.table_code\)\}`\}/,
  );
});

test("queryCache useCachedQuery passes force = false so cached queries deduplicate properly", () => {
  assert.match(queryCache, /runQuery\(key, queryFn, false\)/);
});
