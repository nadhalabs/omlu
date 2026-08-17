import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const billClient = fs.readFileSync(new URL("../app/bill/[sessionToken]/BillClient.tsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const types = fs.readFileSync(new URL("../lib/types.ts", import.meta.url), "utf8");

test("web receipt types use the canonical backend item contract", () => {
  const receiptItem = types.slice(types.indexOf("export interface ReceiptItem"), types.indexOf("export interface ReceiptPayload"));
  for (const field of ["name: string", "quantity: number", "unit_price: string", "line_total: string", "options: string[]"]) {
    assert.ok(receiptItem.includes(field), field);
  }
  assert.doesNotMatch(receiptItem, /total_price|selected_options/);
});

test("official bill download is hidden for drafts", () => {
  assert.match(billClient, /canPrintOfficially/);
  assert.match(billClient, /\["issued", "payment_pending", "paid"\]\.includes\(bill\.status\)/);
  assert.match(billClient, /\{canPrintOfficially &&/);
  assert.match(billClient, /downloadBill: "Download bill"/);
  assert.doesNotMatch(billClient, /Print Receipt|Print Bill/);
});

test("customer bill uses a fixed receipt layout without printer settings", () => {
  assert.doesNotMatch(billClient, /printPaperWidth|receipt-paper-width|Paper width/);
  assert.match(billClient, /print-bill-sheet print-thermal-80/);
  assert.match(css, /\.print-thermal-80/);
  assert.match(billClient, /window\.print\(\)/);
  assert.match(billClient, /Choose “Save as PDF” in the next screen\./);
  assert.match(css, /overflow-wrap: anywhere/);
});

test("receipt print layout includes long options, GST totals, and hides navigation and actions", () => {
  assert.match(billClient, /item\.selected_options\?\.map/);
  assert.match(billClient, /option\.group_name.*option\.option_name/s);
  for (const label of ["Taxable subtotal", "CGST", "SGST", "IGST"]) assert.ok(billClient.includes(label), label);
  assert.match(billClient, /className="print-hidden flex flex-wrap items-center/);
  assert.match(billClient, /<div className="print-hidden grid grid-cols-1 gap-3/);
});

test("B2B GST invoice prints the complete recipient snapshot while B2C remains unchanged", () => {
  assert.match(billClient, /bill\.customer_tax_type === "b2b"/);
  assert.match(billClient, />Billed To</);
  for (const field of [
    "bill.customer_gstin_snapshot", "bill.customer_legal_name_snapshot",
    "bill.customer_billing_address_snapshot", "bill.customer_state_name_snapshot",
    "bill.customer_state_code_snapshot",
  ]) assert.ok(billClient.includes(field), field);
});

test("browser download action cannot mutate bill or payment state", () => {
  const downloadAction = billClient.slice(billClient.indexOf("const downloadBill"), billClient.indexOf("return (", billClient.indexOf("const downloadBill")));
  assert.match(downloadAction, /window\.print\(\)/);
  assert.doesNotMatch(downloadAction, /fetch\(|confirm|payment|issue|send/i);
});
