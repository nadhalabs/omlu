import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  shouldEnterPaidCompletion,
  shouldShowGoogleReviewPrompt,
} from "../lib/googleReviewPrompt.mjs";
import {
  buildPaidCompletionMarker,
  markCompletedSession,
  readCompletedSession,
} from "../lib/customerCompletion.ts";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const bill = read("app/bill/[sessionToken]/BillClient.tsx");
const session = read("app/session/[sessionToken]/SessionClient.tsx");
const settings = read("app/admin/settings/AdminSettingsClient.tsx");
const marker = read("lib/customerCompletion.ts");

const paidBillResponse = {
  status: "paid",
  session_token: "session-a",
  restaurant_slug: "restaurant-a",
  restaurant_name: "Restaurant A",
  table_code: "table-a",
  table_number: "7",
  receipt_token: "receipt-a",
  currency: "INR",
  total_amount: "420.00",
  google_review_url: " https://g.page/r/restaurant-a/review ",
};

test("paid bill with a configured URL shows the review prompt", () => {
  assert.equal(shouldShowGoogleReviewPrompt("paid", "https://g.page/r/example/review"), true);
});

test("review prompt rejects missing URLs and every non-paid state", () => {
  assert.equal(shouldShowGoogleReviewPrompt("paid", null), false);
  assert.equal(shouldShowGoogleReviewPrompt("paid", "   "), false);
  assert.equal(shouldShowGoogleReviewPrompt("pending", "https://example.com"), false);
  assert.equal(shouldShowGoogleReviewPrompt("failed", "https://example.com"), false);
  assert.equal(shouldShowGoogleReviewPrompt("cancelled", "https://example.com"), false);
});

test("live bill flow stays eligible for completion after its URL gains a receipt token", () => {
  assert.equal(shouldEnterPaidCompletion(false), true);
  assert.equal(shouldEnterPaidCompletion(true), false);
  assert.match(bill, /enteredAsReceiptViewRef = useRef\(Boolean\(receiptToken\)\)/);
  assert.match(bill, /shouldEnterPaidCompletion\(enteredAsReceiptViewRef\.current\)/);
  assert.match(bill, /buildPaidCompletionMarker/);
  assert.match(marker, /billStatus\?: "paid"/);
});

test("real paid bill response survives marker storage and enables the completion popup", () => {
  const values = new Map();
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  try {
    const completionMarker = buildPaidCompletionMarker(paidBillResponse);
    assert.ok(completionMarker);
    markCompletedSession(completionMarker);
    const storedMarker = readCompletedSession(paidBillResponse.session_token);
    assert.deepEqual(storedMarker, completionMarker);
    assert.equal(storedMarker.billStatus, "paid");
    assert.equal(storedMarker.googleReviewUrl, "https://g.page/r/restaurant-a/review");
    assert.equal(
      shouldShowGoogleReviewPrompt(storedMarker.billStatus, storedMarker.googleReviewUrl),
      true,
    );
  } finally {
    delete globalThis.window;
  }
});

test("non-paid bill responses cannot create paid completion markers", () => {
  assert.equal(buildPaidCompletionMarker({ ...paidBillResponse, status: "cancelled" }), null);
});

test("missing and non-paid stored markers do not become popup-eligible", () => {
  assert.equal(shouldShowGoogleReviewPrompt(undefined, undefined), false);
  assert.equal(shouldShowGoogleReviewPrompt(undefined, "https://g.page/r/example/review"), false);
});

test("receipt-shaped paid data is stored under the canonical session token", () => {
  const values = new Map();
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
  };
  try {
    const receiptShape = {
      ...paidBillResponse,
      session_token: undefined,
      restaurant_slug: undefined,
      table_code: undefined,
    };
    const completionMarker = buildPaidCompletionMarker(receiptShape, "canonical-session");
    assert.ok(completionMarker);
    markCompletedSession(completionMarker);
    assert.equal(readCompletedSession("canonical-session")?.googleReviewUrl, paidBillResponse.google_review_url.trim());
    assert.equal(readCompletedSession("undefined"), null);
  } finally {
    delete globalThis.window;
  }
});

test("admin exposes safe test navigation and persists the setting", () => {
  assert.match(settings, /title="Google Reviews"/);
  assert.match(settings, /google_review_url: googleReviewUrl\.trim\(\) \|\| null/);
  assert.match(settings, /window\.open\(url\.href, "_blank", "noopener,noreferrer"\)/);
  assert.match(settings, /url\.protocol === "https:"/);
});
