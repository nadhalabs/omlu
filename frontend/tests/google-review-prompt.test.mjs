import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const bill = read("app/bill/[sessionToken]/BillClient.tsx");
const completion = read("app/complete/[sessionToken]/CompletionClient.tsx");
const settings = read("app/admin/settings/AdminSettingsClient.tsx");
const marker = read("lib/customerCompletion.ts");

test("review prompt is derived only from a confirmed paid bill and its tenant URL", () => {
  assert.match(bill, /const isPaid = data\.status === "paid"/);
  assert.match(bill, /googleReviewUrl: data\.google_review_url \|\| undefined/);
  assert.match(marker, /googleReviewUrl\?: string/);
  assert.match(completion, /setShowReviewPrompt\(Boolean\(completed\?\.googleReviewUrl\)\)/);
});

test("prompt is optional and dismissible without collecting review content", () => {
  assert.match(completion, /Enjoyed your visit\?/);
  assert.match(completion, /Rate us on Google/);
  assert.match(completion, /Not now/);
  assert.match(completion, /setShowReviewPrompt\(false\)/);
  assert.doesNotMatch(completion, /type="radio"|textarea|rating_value|review_content/);
});

test("admin exposes safe test navigation and persists the setting", () => {
  assert.match(settings, /title="Google Reviews"/);
  assert.match(settings, /google_review_url: googleReviewUrl\.trim\(\) \|\| null/);
  assert.match(settings, /window\.open\(url\.href, "_blank", "noopener,noreferrer"\)/);
  assert.match(settings, /url\.protocol === "https:"/);
});
