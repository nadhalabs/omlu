import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("completed Takeaways reuse the shared Print Bridge and browser fallback", () => {
  const quickSale = read("app/admin/quick-sale/QuickSaleClient.tsx");
  const printService = read("lib/print_service.ts");
  assert.match(quickSale, /printCompletedQuickSale/);
  assert.match(quickSale, /sale\.sale_type === "takeaway" && sale\.status === "completed"/);
  assert.match(quickSale, /"Print Bill"/);
  assert.match(printService, /async function printDocument/);
  assert.match(printService, /receiptType: "receipt"/);
  assert.match(printService, /quickSale=1/);
  assert.match(printService, /sendPrintJobToBridge/);
});

test("draft Takeaways and Late Entry records do not receive print actions", () => {
  const quickSale = read("app/admin/quick-sale/QuickSaleClient.tsx");
  const printGuard = quickSale.match(/printSale && sale\.sale_type[^}]+/s)?.[0] || "";
  assert.match(printGuard, /sale_type === "takeaway"/);
  assert.match(printGuard, /status === "completed"/);
  assert.doesNotMatch(printGuard, /late_entry/);
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
