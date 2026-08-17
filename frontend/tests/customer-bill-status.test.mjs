import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const billClient = fs.readFileSync(
  new URL("../app/bill/[sessionToken]/BillClient.tsx", import.meta.url),
  "utf8",
);

test("customer bill messages cover canonical role and workflow states", () => {
  for (const message of [
    "Your bill is being prepared. Please wait while staff sends it to the counter.",
    "Your bill is ready. Please proceed to the counter for payment.",
    "Your bill has been sent to the counter. Please proceed to the counter for payment.",
    "Payment is awaiting confirmation at the counter.",
    "Payment received. Thank you!",
  ]) {
    assert.ok(billClient.includes(message), `missing customer message: ${message}`);
  }

  assert.match(
    billClient,
    /bill\.generated_by_role === "owner"\s*\|\|\s*bill\.generated_by_role === "admin"/,
  );
  assert.match(
    billClient,
    /bill\.sent_to_counter_by_role === "staff" && !bill\.payment_method/,
  );
});

test("customer never sees the obsolete Owner/Admin staff-handoff wording", () => {
  assert.doesNotMatch(
    billClient,
    /Please wait while Staff sends the bill to Owner or Admin/,
  );
});

test("bill workflow messages refresh from session realtime events", () => {
  assert.match(
    billClient,
    /target:\s*\{\s*kind:\s*"session",\s*token:\s*sessionToken,\s*participantToken:/,
  );
  assert.match(
    billClient,
    /onEvent:\s*\(\)\s*=>\s*void fetchBill\(false,\s*"event"\)/,
  );
});

test("paid bill refresh uses the scoped receipt authority and keeps customer receipt actions", () => {
  assert.match(billClient, /receiptAccessToken/);
  assert.match(billClient, /window\.history\.replaceState/);
  assert.match(billClient, /\?receipt=/);
  assert.match(billClient, /getPublicBill\(sessionToken, authority, receiptAccessToken\)/);
  assert.ok(billClient.includes('downloadBill: "Download bill"'));
  assert.doesNotMatch(billClient, /Paper width|Print Receipt/);
  assert.ok(billClient.includes("Share on WhatsApp"));
  assert.ok(billClient.includes("Payment successful"));
  assert.ok(billClient.includes('status === "paid"'));
  assert.ok(billClient.includes("payment_method"));
  assert.ok(billClient.includes("paid_at"));
});
