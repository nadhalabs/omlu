import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("app/page.tsx");
const header = read("components/LandingHeader.tsx");
const pricing = read("lib/pricing.ts");
const demoForm = read("components/LandingDemoForm.tsx");
const globals = read("app/globals.css");

test("landing header is minimal, sticky, and routes correctly", () => {
  assert.match(page, /<LandingHeader/);
  assert.match(header, /sticky top-0/);
  assert.match(header, /backdrop-blur-md/);
  for (const label of ["Product", "Pricing", "Login", "Get Started"]) assert.match(header, new RegExp(`>${label}<`));
  assert.match(page, /productHref="#product"/);
  assert.match(header, /href="\/pricing"/);
  assert.match(header, /href="\/login"/);
  assert.match(header, /href="\/register"/);
  assert.match(header, /aria-expanded=\{menuOpen\}/);
  assert.match(header, /min-h-12/);
});

test("public headers expose Book a Demo and the landing page captures enquiries", () => {
  assert.match(header, /href="\/#demo"[^>]*>Book a Demo</);
  assert.match(page, /<LandingDemoForm/);
  assert.match(demoForm, /id="demo"/);
  assert.match(demoForm, /fetch\("\/api\/sales-leads"/);
  for (const label of ["Name", "Phone number", "Restaurant name", "City", "Email", "Interested plan"]) assert.match(demoForm, new RegExp(`label="${label}"`));
  assert.doesNotMatch(demoForm, /Number of outlets|number_of_outlets/);
  assert.match(demoForm, /Request received\./);
});

test("landing preserves the hero and exposes product and pricing anchors", () => {
  assert.match(page, /Restaurant operations/);
  assert.match(page, /<h1[^>]*>\s*OMLU/);
  assert.match(page, /id="product"/);
  assert.match(page, /id="pricing"/);
  assert.match(globals, /scroll-behavior: smooth/);
});

test("landing pricing stays a concise teaser and routes to the dedicated page", () => {
  assert.match(page, /Plans that fit the way you operate\./);
  assert.match(page, /View Pricing/);
  assert.match(page, /href="\/pricing"/);
  assert.match(page, /Assisted setup and onboarding available/);
  assert.doesNotMatch(page, /OMLU_MONTHLY_PRICE|₹999|pricingFeatures/);
  assert.match(pricing, /PRICING_PLANS/);
});
