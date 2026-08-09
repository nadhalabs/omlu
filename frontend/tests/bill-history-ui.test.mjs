import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const historyControls = read("app/admin/historyControls.tsx");
const billHistoryClient = read("app/admin/bills/history/BillHistoryClient.tsx");

test("historyControls exports payment status, payment method, currency and datetime formatters", () => {
  assert.match(historyControls, /export function formatPaymentMethod/);
  assert.match(historyControls, /export function formatPaymentStatus/);
  assert.match(historyControls, /export function formatCurrencyINR/);
  assert.match(historyControls, /export function formatDateTime/);
});

test("formatPaymentMethod maps raw enum values and falls back safely", () => {
  assert.match(historyControls, /counter_cash:\s*"Cash"/);
  assert.match(historyControls, /counter_upi:\s*"UPI"/);
  assert.match(historyControls, /counter_card:\s*"Card"/);
  assert.match(historyControls, /online:\s*"Online"/);
  assert.match(historyControls, /replace\(\/_\/g,\s*" "\)/);
});

test("formatPaymentStatus maps raw status values and falls back safely", () => {
  assert.match(historyControls, /paid:\s*"Paid"/);
  assert.match(historyControls, /unpaid:\s*"Unpaid"/);
  assert.match(historyControls, /payment_pending:\s*"Payment Pending"/);
  assert.match(historyControls, /void:\s*"Void"/);
  assert.match(historyControls, /replace\(\/_\/g,\s*" "\)/);
});

test("formatCurrencyINR uses en-IN digit grouping and currency symbol", () => {
  assert.match(historyControls, /Intl\.NumberFormat\("en-IN"/);
  assert.match(historyControls, /minimumFractionDigits:\s*2/);
  assert.match(historyControls, /maximumFractionDigits:\s*2/);
  assert.match(historyControls, /`₹\$\{formatted\}`/);
});

test("BillHistoryClient preserves filter values while displaying formatted labels", () => {
  // Raw backend filter values mapped in arrays and passed to options
  assert.match(billHistoryClient, /"paid",\s*"unpaid",\s*"payment_pending",\s*"void"/);
  assert.match(billHistoryClient, /"counter_cash",\s*"counter_upi",\s*"counter_card",\s*"online"/);
  assert.match(billHistoryClient, /key=\{status\}\s+value=\{status\}/);
  assert.match(billHistoryClient, /key=\{method\}\s+value=\{method\}/);

  // Formatted labels used in select options
  assert.match(billHistoryClient, /displayStatus\(status\)/);
  assert.match(billHistoryClient, /displayPaymentMethod\(method\)/);
});

test("BillHistoryClient separates GSTIN badge, formats tax breakdown and handles Quick Sale context", () => {
  // GSTIN separated in secondary badge
  assert.match(billHistoryClient, /GSTIN \{bill\.gstin\}/);
  assert.match(billHistoryClient, /inline-block rounded border/);

  // Quick Sale table/session display
  assert.match(billHistoryClient, /bill\.table_number \|\| "Quick Sale"/);
  assert.match(billHistoryClient, /bill\.session_token \|\| \(isQuickSale \? "Quick Sale" : "-"\)/);

  // Formatted amounts and tax breakdown
  assert.match(billHistoryClient, /formatCurrencyINR\(bill\.subtotal\)/);
  assert.match(billHistoryClient, /formatCurrencyINR\(bill\.tax_amount\)/);
  assert.match(billHistoryClient, /formatCurrencyINR\(bill\.discount_amount\)/);
  assert.match(billHistoryClient, /formatCurrencyINR\(bill\.grand_total\)/);
  assert.match(billHistoryClient, /CGST \{formatCurrencyINR\(bill\.cgst_amount\)\}/);
  assert.match(billHistoryClient, /SGST \{formatCurrencyINR\(bill\.sgst_amount\)\}/);
});
