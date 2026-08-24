import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import React, { StrictMode } from "react";
import { JSDOM } from "jsdom";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import CompletionClient from "../app/complete/[sessionToken]/CompletionClient";
import type { CompletedSessionMarker } from "../lib/customerCompletion";
import type { PublicReceiptBillResponse } from "../lib/types";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://omlu.example" });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
});
Object.defineProperty(globalThis, "navigator", { configurable: true, value: dom.window.navigator });

afterEach(() => {
  cleanup();
  dom.window.sessionStorage.clear();
});

const reviewUrl = "https://g.page/r/restaurant-a/review";

const paidReceipt = (googleReviewUrl: string | null = reviewUrl) => ({
  bill_number: "BILL-1",
  restaurant_name: "Restaurant A",
  table_number: "7",
  receipt_token: "receipt-a",
  status: "paid",
  total_amount: "420.00",
  currency: "INR",
  google_review_url: googleReviewUrl,
} as unknown as PublicReceiptBillResponse);

const marker = (googleReviewUrl?: string): CompletedSessionMarker => ({
  sessionToken: "session-a",
  restaurantName: "Restaurant A",
  receiptToken: "receipt-a",
  billStatus: "paid",
  googleReviewUrl,
});

function renderCompletion(overrides: Partial<React.ComponentProps<typeof CompletionClient>> = {}) {
  return render(
    <CompletionClient
      sessionToken="session-a"
      receiptToken="receipt-a"
      readMarker={() => null}
      loadBill={async () => paidReceipt()}
      showThemeControl={false}
      {...overrides}
    />,
  );
}

test("missing marker falls back to paid authoritative receipt and renders the review modal", async () => {
  const view = renderCompletion();
  assert.ok(await view.findByRole("button", { name: /Rate us on Google/i }));
  assert.ok(view.getByRole("dialog"));
});

test("incomplete marker falls back to paid authoritative receipt and renders the review modal", async () => {
  const view = renderCompletion({ readMarker: () => marker() });
  assert.ok(await view.findByRole("button", { name: /Rate us on Google/i }));
});

test("paid marker renders in Strict Mode without calling the fallback", async () => {
  let fallbackCalls = 0;
  const view = render(
    <StrictMode>
      <CompletionClient
        sessionToken="session-a"
        readMarker={() => marker(reviewUrl)}
        loadBill={async () => { fallbackCalls += 1; return paidReceipt(); }}
        showThemeControl={false}
      />
    </StrictMode>,
  );
  assert.ok(await view.findByRole("button", { name: /Rate us on Google/i }));
  assert.equal(fallbackCalls, 0);
});

test("pending authoritative receipt and paid receipt without URL do not render the modal", async () => {
  let pendingCalls = 0;
  const pending = renderCompletion({ loadBill: async () => { pendingCalls += 1; return { ...paidReceipt(), status: "payment_pending" }; } });
  await waitFor(() => assert.equal(pendingCalls, 1));
  assert.equal(pending.queryByRole("dialog"), null);
  cleanup();

  let missingUrlCalls = 0;
  const missingUrl = renderCompletion({ loadBill: async () => { missingUrlCalls += 1; return paidReceipt(null); } });
  await waitFor(() => assert.equal(missingUrlCalls, 1));
  assert.equal(missingUrl.queryByRole("dialog"), null);
});

test("review action uses the configured URL and Not now dismisses the visible modal", async () => {
  let destination = "";
  const view = renderCompletion({ navigateToReview: (url) => { destination = url; } });
  fireEvent.click(await view.findByRole("button", { name: /Rate us on Google/i }));
  assert.equal(destination, reviewUrl);

  fireEvent.click(view.getByRole("button", { name: "Not now" }));
  assert.equal(view.queryByRole("dialog"), null);
});
