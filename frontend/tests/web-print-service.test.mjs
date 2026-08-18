import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("shared print_service implements strict Print Bridge direct print and explicit OMLU_PRINT_READY browser print", () => {
  const printService = read("lib/print_service.ts");
  const billClient = read("app/bill/[sessionToken]/BillClient.tsx");

  assert.match(printService, /export async function printIssuedBill/);
  assert.match(printService, /checkBridgeHealth/);
  assert.match(printService, /getStaffBillReceiptPayload/);
  assert.match(printService, /requestPrintBridgeToken/);
  assert.match(printService, /sendPrintJobToBridge/);
  assert.match(printService, /document\.createElement\("iframe"\)/);
  assert.match(printService, /OMLU_PRINT_READY/);
  assert.match(printService, /event\.origin !== window\.location\.origin/);
  assert.match(printService, /event\.source !== iframe\.contentWindow/);
  assert.match(printService, /event\.data\?\.sessionToken !== sessionToken/);
  assert.match(printService, /event\.data\?\.receiptToken !== receiptToken/);
  assert.match(printService, /doc\.querySelector\("\.print-bill-sheet"\)/);
  assert.match(printService, /win === window/);
  assert.match(printService, /afterprint/);
  assert.match(printService, /win\.print\(\)/);
  assert.match(printService, /Printable bill did not become ready\./);

  // Strict separation assertions:
  // 1. forceIframe triggers browserPrint
  assert.match(printService, /if \(options\.forceIframe\) \{\s*return browserPrint\(options\);\s*\}/);
  // 2. Otherwise calls bridgePrint directly
  assert.match(printService, /return bridgePrint\(options\);/);
  // 3. Explicit error messages for bridge failures
  assert.match(printService, /OMLU Printer Bridge is unavailable\./);
  assert.match(printService, /Printer Bridge is not paired\./);
  assert.match(printService, /Billing printer is not configured\./);
  assert.match(printService, /Billing printer address is missing\./);
  assert.match(printService, /Billing printer is offline\./);
  assert.match(printService, /Unable to authorize printer job\./);

  // BillClient emits readiness postMessage only when official printable receipt is mounted
  assert.match(billClient, /OMLU_PRINT_READY/);
  assert.match(billClient, /document\.querySelector\("\.print-bill-sheet"\)/);
  assert.match(billClient, /querySelectorAll\("img"\)/);
  assert.match(billClient, /image\.decode\(\)/);
  assert.match(billClient, /document\.fonts\?\.ready/);
  assert.match(billClient, /await new Promise<void>\(\(resolve\) => requestAnimationFrame/);
  assert.match(billClient, /window\.parent\.postMessage/);
});

test("KDS applies status websocket events locally instead of refetching the full board", () => {
  const kitchen = read("app/kitchen/[restaurantSlug]/KitchenDashboardClient.tsx");
  assert.match(kitchen, /event\.type === "order\.status_changed" && publicToken && status/);
  assert.match(kitchen, /current\.filter\(\(order\) => order\.public_token !== publicToken\)/);
  assert.match(kitchen, /\? \{ \.\.\.order, status \} : order/);
});

test("customer menu applies availability websocket payloads without another menu request", () => {
  const menu = read("app/menu/[restaurantSlug]/[tableCode]/MenuClient.tsx");
  assert.match(menu, /event\.type !== "availability\.updated"/);
  assert.match(menu, /kind === "item"/);
  assert.match(menu, /kind === "category"/);
  assert.match(menu, /kind === "option"/);
  assert.match(menu, /\? \{ \.\.\.option, available \}/);
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
  // Explicit Browser Print passes forceIframe: true
  assert.match(billingCounter, /handleBrowserPrint/);
  assert.match(billingCounter, /forceIframe:\s*true/);
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

test("direct print flow handles errors without falling through to browser print", () => {
  const printService = read("lib/print_service.ts");
  // Ensure bridgePrint does NOT reference browserPrint or iframe creation
  const bridgePrintCode = printService.slice(printService.indexOf("async function bridgePrint"), printService.indexOf("async function browserPrint"));
  assert.doesNotMatch(bridgePrintCode, /browserPrint/);
  assert.doesNotMatch(bridgePrintCode, /document\.createElement\("iframe"\)/);
  assert.doesNotMatch(bridgePrintCode, /win\.print/);
});
