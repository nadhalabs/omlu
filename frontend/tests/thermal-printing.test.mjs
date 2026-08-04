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

test("official bill printing is hidden for drafts", () => {
  assert.match(billClient, /canPrintOfficially/);
  assert.match(billClient, /\["issued", "payment_pending", "paid"\]\.includes\(bill\.status\)/);
  assert.match(billClient, /\{canPrintOfficially &&/);
  assert.match(billClient, /\{isPaid \? "Print Receipt" : "Print Bill"\}/);
});

test("58 mm and 80 mm selection controls the printed receipt class", () => {
  assert.match(billClient, /printPaperWidth/);
  assert.match(billClient, /print-thermal-\$\{printPaperWidth\}/);
  assert.match(billClient, /<option value="58">58 mm<\/option>/);
  assert.match(billClient, /<option value="80">80 mm<\/option>/);
  assert.match(css, /\.print-thermal-58/);
  assert.match(css, /\.print-thermal-80/);
  assert.match(billClient, /window\.print\(\)/);
  assert.match(css, /overflow-wrap: anywhere/);
});

test("receipt print layout includes long options, GST totals, and hides navigation and actions", () => {
  assert.match(billClient, /item\.selected_options\?\.map/);
  assert.match(billClient, /option\.group_name.*option\.option_name/s);
  for (const label of ["Taxable subtotal", "CGST", "SGST", "IGST"]) assert.ok(billClient.includes(label), label);
  assert.match(billClient, /className="print-hidden flex flex-wrap items-center/);
  assert.match(billClient, /<div className="print-hidden grid grid-cols-1 gap-3/);
});

test("browser print action cannot mutate bill or payment state", () => {
  const printButton = billClient.slice(billClient.indexOf('onClick={() => window.print()}'), billClient.indexOf('{isPaid ? "Print Receipt" : "Print Bill"}'));
  assert.match(printButton, /window\.print\(\)/);
  assert.doesNotMatch(printButton, /fetch\(|confirm|payment|issue|send/i);
});
