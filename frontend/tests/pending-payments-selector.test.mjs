import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("1. The native payment-method <select> is no longer rendered", () => {
  const pending = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  assert.doesNotMatch(pending, /<select/);
});

test("2. A visible Payment method label exists", () => {
  const pending = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  assert.match(pending, /Payment method/);
});

test("3. The selector exposes a radio-group accessibility contract", () => {
  const pending = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  assert.match(pending, /role="radiogroup"/);
  assert.match(pending, /aria-labelledby=\{`method-label-\${billNumber}`\}/);
});

test("4. Cash and UPI controls expose radio semantics", () => {
  const pending = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  assert.match(pending, /role="radio"/);
  assert.match(pending, /aria-label="Cash"/);
  assert.match(pending, /aria-label="UPI"/);
});

test("5. Neither payment method is selected initially", () => {
  const pending = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  assert.match(pending, /const currentMethod = methods\[billNumber\];/);
  assert.match(pending, /currentMethod === "counter_cash"/);
  assert.match(pending, /currentMethod === "counter_upi"/);
  assert.match(pending, /!currentMethod \|\| isSubmitting \|\| !canConfirm/);
});

test("6. The confirmation button is disabled when no method is selected", () => {
  const pending = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  assert.match(pending, /disabled=\{isDisabled\}/);
  assert.match(pending, /Confirm payment · \${money\(amount\)}/);
});

test("7. Selecting Cash updates aria-checked and button wording to Confirm cash payment", () => {
  const pending = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  assert.match(pending, /aria-checked=\{currentMethod === "counter_cash"\}/);
  assert.match(pending, /Confirm cash payment · \${money\(amount\)}/);
});

test("8. Selecting UPI updates aria-checked and button wording to Confirm UPI payment", () => {
  const pending = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  assert.match(pending, /aria-checked=\{currentMethod === "counter_upi"\}/);
  assert.match(pending, /Confirm UPI payment · \${money\(amount\)}/);
});

test("9. Selecting one method visually and semantically deselects the other", () => {
  const pending = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  assert.match(pending, /setMethods\(\(prev\) => \(\{ \.\.\.prev, \[billNumber\]: "counter_cash" \}\)\)/);
  assert.match(pending, /setMethods\(\(prev\) => \(\{ \.\.\.prev, \[billNumber\]: "counter_upi" \}\)\)/);
  assert.match(pending, /currentMethod === "counter_cash" && <span/);
});

test("10. Opening confirmation displays the correct bill, table, amount, and method", () => {
  const pending = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  assert.match(pending, /confirmTitle = method === "counter_cash" \? "Confirm cash payment\?" : "Confirm UPI payment\?"/);
  assert.match(pending, /`Bill: \${billNumber}`/);
  assert.match(pending, /`Table: \${table}`/);
  assert.match(pending, /`Amount: \${money\(amount\)}`/);
  assert.match(pending, /`Method: \${methodLabel}`/);
});

test("11. Cancelling confirmation performs no payment-confirmation request", () => {
  const pending = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  assert.match(pending, /cancelLabel: "Cancel"/);
  assert.match(pending, /onConfirm: async \(\) => \{/);
});

test("12. Confirming invokes the payment action exactly once and blocks repeated activation while submitting", () => {
  const pending = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  assert.match(pending, /if \(submittingBills\[billNumber\]\) return;/);
  assert.match(pending, /setSubmittingBills\(\(prev\) => \(\{ \.\.\.prev, \[billNumber\]: true \}\)\)/);
  assert.match(pending, /await confirmPendingPayment\(billNumber, method\)/);
  assert.match(pending, /finally \{/);
  assert.match(pending, /setSubmittingBills\(\(prev\) => \(\{ \.\.\.prev, \[billNumber\]: false \}\)\)/);
});

test("13. State is isolated per bill when multiple pending-payment cards are rendered", () => {
  const pending = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  assert.match(pending, /methods\[billNumber\]/);
  assert.match(pending, /submittingBills\[billNumber\]/);
  assert.match(pending, /\[billNumber\]: "counter_cash"/);
});

test("14. Confirming payment… appears during submission and error clears submitting state", () => {
  const pending = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  assert.match(pending, /Confirming payment…/);
  assert.match(pending, /disabled:opacity-50 disabled:cursor-not-allowed/);
});
