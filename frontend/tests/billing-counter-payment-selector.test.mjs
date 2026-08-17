import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../app/admin/billing/BillingCounterClient.tsx", import.meta.url), "utf8");

test("Billing Counter payment method starts unselected and remains bill-scoped", () => {
  assert.match(source, /useState<Record<string, Method>>\(\{\}\)/);
  assert.match(source, /const selected = methods\[item\.bill_number\] === method/);
  assert.match(source, /aria-checked=\{selected\}/);
});

test("Cash and UPI share exclusive selected styling through the existing method state", () => {
  assert.match(source, /\["counter_cash", "counter_upi"\]/);
  assert.match(source, /setMethods\(\(current\) => \(\{\.\.\.current, \[item\.bill_number\]: method\}\)\)/);
  assert.match(source, /selected \? "border-orange-600 bg-orange-50 text-orange-950 ring-1 ring-orange-500\/40 dark:bg-orange-950\/40 dark:text-orange-100"/);
  assert.match(source, /selected \? "✓" : ""/);
});

test("selected, unselected, hover, focus, and disabled states remain theme-safe", () => {
  for (const contract of [
    "border-[var(--omlu-border-strong)]",
    "bg-[var(--omlu-primary-surface)]",
    "text-[var(--omlu-text-primary)]",
    "hover:bg-[var(--omlu-muted-surface)]",
    "focus-visible:ring-2",
    "focus-visible:ring-offset-[var(--omlu-page-background)]",
    "disabled:cursor-not-allowed",
    "dark:bg-orange-950/40",
    "dark:text-orange-100",
  ]) assert.ok(source.includes(contract), contract);
});

test("confirmation behavior and wording are unchanged", () => {
  assert.match(source, /disabled=\{!methods\[item\.bill_number\] \|\| Boolean\(busyBills\[item\.bill_number\]\)\}/);
  assert.match(source, /onClick=\{\(\) => void collect\(item\)\}/);
  assert.match(source, /busyBills\[item\.bill_number\] \|\| "Confirm Payment"/);
  assert.match(source, /title: `Confirm \$\{method === "counter_cash" \? "cash" : "UPI"\} payment\?`/);
  assert.match(source, /await confirmPendingPayment\(item\.bill_number, method\)/);
});
