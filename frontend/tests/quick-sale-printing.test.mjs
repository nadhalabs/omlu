import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("completed Takeaways and Late Entry reuse the shared Print Bridge and browser fallback", () => {
  const quickSale = read("app/admin/quick-sale/QuickSaleClient.tsx");
  const printService = read("lib/print_service.ts");
  assert.match(quickSale, /printCompletedQuickSale/);
  assert.match(quickSale, /sale\.sale_type === "takeaway" \|\| sale\.sale_type === "late_entry"/);
  assert.match(quickSale, /sale\.status === "completed"/);
  assert.match(quickSale, /"Print Bill"/);
  assert.match(printService, /async function printDocument/);
  assert.match(printService, /receiptType: "receipt"/);
  assert.match(printService, /quickSale=1/);
  assert.match(printService, /sendPrintJobToBridge/);
});

test("only completed Takeaway and Late Entry records receive print actions", () => {
  const quickSale = read("app/admin/quick-sale/QuickSaleClient.tsx");
  const handlerGuard = quickSale.match(/if \(\(sale\.sale_type[^;]+return;/s)?.[0] || "";
  const actionGuard = quickSale.match(/printSale && \(sale\.sale_type[^}]+/s)?.[0] || "";

  // The handler blocks incomplete records and unrelated sale types.
  assert.match(handlerGuard, /sale\.sale_type !== "takeaway" && sale\.sale_type !== "late_entry"/);
  assert.match(handlerGuard, /sale\.status !== "completed"/);

  // The UI explicitly allows both completed Takeaway and completed Late Entry records.
  assert.match(actionGuard, /sale\.sale_type === "takeaway" \|\| sale\.sale_type === "late_entry"/);
  assert.match(actionGuard, /sale\.status === "completed"/);
});

test("Takeaway print view uses the existing dine-in bill renderer with B2B details", () => {
  const page = read("app/bill/[sessionToken]/page.tsx");
  const bill = read("app/bill/[sessionToken]/BillClient.tsx");
  assert.match(page, /quickSale=\{quickSale === "1"\}/);
  assert.match(bill, /getQuickSalePrintDocument/);
  assert.match(bill, /bill\.customer_tax_type === "b2b"/);
  assert.match(bill, /bill\.customer_billing_address_snapshot/);
});

test("staff Late Entry remains part of the dining-session bill workflow", () => {
  const staffTable = read("app/staff/tables/[tableId]/StaffTableDetailClient.tsx");
  assert.match(staffTable, /mode=served/);
  assert.match(staffTable, /requestStaffTableBill/);
  assert.doesNotMatch(staffTable, /printCompletedQuickSale/);
});

test("Quick Sale printing has no separate Takeaway or Late Entry implementation", () => {
  const quickSale = read("app/admin/quick-sale/QuickSaleClient.tsx");
  assert.equal(quickSale.match(/printCompletedQuickSale\(/g)?.length, 1);
  assert.doesNotMatch(quickSale, /sendPrintJobToBridge|window\.print\(/);
});
