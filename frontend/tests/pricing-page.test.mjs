import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("app/pricing/page.tsx");
const styles = read("app/pricing/pricing.module.css");

test("pricing route presents the requested title and route metadata", () => {
  assert.match(page, /Choose the plan that’s right/);
  assert.match(page, /title: "Pricing \| OMLU"/);
  assert.match(page, /canonical: "https:\/\/omlu\.in\/pricing"/);
});

test("pricing has the exact four plans and values", () => {
  for (const value of ["Lite", "₹499", "Standard", "₹999", "Pro", "₹1,999", "Custom", "Talk to us"]) {
    assert.match(page, new RegExp(value));
  }
  assert.match(page, /Best Value/);
});

test("billing toggle defaults to Monthly and exposes the yearly offer", () => {
  assert.match(page, /id="billing-monthly"[\s\S]*defaultChecked/);
  assert.match(page, /id="billing-yearly"/);
  assert.match(page, />Monthly</);
  assert.match(page, />Yearly</);
  assert.match(page, /2 months free/);
  assert.match(page, /type="radio"/);
  assert.match(styles, /\.billingControls \{ position: relative; width: 220px;[^}]*margin: 0 auto 36px/);
  assert.match(styles, /\.offerBadge \{[^}]*position: absolute;[^}]*visibility: hidden;[^}]*opacity: 0/);
  assert.match(styles, /#billing-yearly\):checked\) \.offerBadge \{ visibility: visible; opacity: 1; \}/);
});

test("yearly prices, effective monthly values, and savings are exact", () => {
  for (const value of [
    "₹4,999", "₹9,999", "₹19,999",
    "₹417", "₹833", "₹1,667",
    "Save ₹989", "Save ₹1,989", "Save ₹3,989",
  ]) assert.match(page, new RegExp(value.replace(/[\/]/g, "\\/")));
  assert.match(page, /plan\.yearlyEffective \?\? plan\.price/);
  assert.match(page, /plan\.yearlyPrice} billed annually/);
  assert.doesNotMatch(page, /\/year|\/mo billed annually/);
});

test("Custom remains unchanged and has no fake yearly savings", () => {
  assert.match(page, /yearlyEffective \?\? plan\.price/);
  assert.match(page, /name: "Custom",\s+price: "Talk to us",\s+description:/);
  assert.doesNotMatch(page, /name: "Custom",\s+price: "Talk to us",\s+yearly/);
});

test("Lite keeps the essential restaurant workflow and marks Ad-free unavailable", () => {
  for (const feature of ["QR ordering", "Dine-in, takeaway & Quick Sale", "Kitchen display", "Billing & bill printing", "Staff access", "Basic reports"]) {
    assert.match(page, new RegExp(feature.replace(/[&]/g, "\\&")));
  }
  assert.match(page, /label: "Ad-free", available: false/);
  assert.match(page, /not included/);
});

test("Standard, Pro, and Custom expose only their requested differentiators", () => {
  for (const feature of [
    "Ad-free", "Advanced sales reports", "Owner performance insights", "PDF & Excel exports",
    "GST reporting dashboard", "HSN/SAC reports", "Accountant / CA exports", "Tailored setup",
  ]) assert.match(page, new RegExp(feature.replace(/[\/&]/g, "\\$&")));
});

test("pricing is presentational and makes no unsupported product claims", () => {
  assert.doesNotMatch(page, /multi-branch|payment gateway|checkout|subscription|selectedPlan|savePlan/i);
  assert.doesNotMatch(page, /fetch\(|axios|useState|useRouter/);
  assert.doesNotMatch(page, /localStorage|URLSearchParams|searchParams/);
  assert.match(page, /<button type="button"/);
});

test("the four-card presentation is responsive and Standard is emphasized", () => {
  assert.match(styles, /grid-template-columns: repeat\(4/);
  assert.match(styles, /@media \(max-width: 1100px\)/);
  assert.match(styles, /@media \(max-width: 700px\)/);
  assert.match(styles, /\.recommended/);
  assert.match(styles, /border: 2px solid #f86831/);
});

test("pricing uses a text-only OMLU wordmark and no decorative plan icons", () => {
  assert.match(page, /className=\{styles\.wordmark\}[^>]*>OMLU<\/Link>/);
  assert.doesNotMatch(page, /PlanIcon|iconTile|planIcon|<svg/);
});

test("pricing only links to established public routes and never links another page to pricing", () => {
  for (const route of ["/", "/faq", "/login", "/register"]) assert.match(page, new RegExp(`href="${route === "/" ? "\\/" : route}"`));
  assert.doesNotMatch(page, /href="\/pricing"/);
});
