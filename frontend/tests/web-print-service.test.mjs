import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("shared print_service implements Print Bridge direct print and hidden iframe fallback", () => {
  const printService = read("lib/print_service.ts");

  assert.match(printService, /export async function printIssuedBill/);
  assert.match(printService, /checkBridgeHealth/);
  assert.match(printService, /getStaffBillReceiptPayload/);
  assert.match(printService, /requestPrintBridgeToken/);
  assert.match(printService, /sendPrintJobToBridge/);
  assert.match(printService, /document\.createElement\("iframe"\)/);
  assert.match(printService, /afterprint/);
  assert.match(printService, /win\.print\(\)/);
  assert.match(printService, /method:\s*"bridge"/);
  assert.match(printService, /method:\s*"iframe"/);
  assert.match(printService, /confirmed:\s*false/);
});

test("admin billing views use print_service and contain zero window.open or target=_blank print calls", () => {
  const billingCounter = read("app/admin/billing/BillingCounterClient.tsx");
  const pendingPayments = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  const adminRequests = read("app/admin/requests/AdminRequestsClient.tsx");

  for (const [name, content] of Object.entries({
    BillingCounterClient: billingCounter,
    PendingPaymentsClient: pendingPayments,
    AdminRequestsClient: adminRequests,
  })) {
    assert.match(content, /printIssuedBill/, `${name} should import and call printIssuedBill`);
    assert.doesNotMatch(content, /window\.open/, `${name} must not contain window.open`);
  }

  // Print Bill / Reprint Bill in BillingCounter must be buttons, not target="_blank" links
  assert.doesNotMatch(billingCounter, /Link href=\{receiptUrl\(item\)!\} target="_blank"/);
});

test("PendingPaymentsClient and AdminRequestsClient issue bill prior to calling printIssuedBill", () => {
  const pendingPayments = read("app/admin/payments/pending/PendingPaymentsClient.tsx");
  const adminRequests = read("app/admin/requests/AdminRequestsClient.tsx");

  const pendingIssueIdx = pendingPayments.indexOf("issueStaffBill");
  const pendingPrintIdx = pendingPayments.indexOf("printIssuedBill");
  assert.ok(pendingIssueIdx > -1 && pendingPrintIdx > -1 && pendingIssueIdx < pendingPrintIdx, "PendingPaymentsClient must call issueStaffBill before printIssuedBill");

  const reqIssueIdx = adminRequests.indexOf("issueStaffBill");
  const reqPrintIdx = adminRequests.indexOf("printIssuedBill");
  assert.ok(reqIssueIdx > -1 && reqPrintIdx > -1 && reqIssueIdx < reqPrintIdx, "AdminRequestsClient must call issueStaffBill before printIssuedBill");
});
