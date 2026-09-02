import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("app/page.tsx");
const header = read("components/LandingHeader.tsx");
const globals = read("app/globals.css");

test("landing header is minimal, sticky, and routes correctly", () => {
  assert.match(page, /<LandingHeader/);
  assert.match(header, /sticky top-0/);
  assert.match(header, /backdrop-blur-md/);
  for (const label of ["Product", "Pricing", "Sign In", "Get Started"]) assert.match(header, new RegExp(`>${label}<`));
  assert.match(header, /href="\/pricing"/);
  assert.match(header, /href="\/login"/);
  assert.match(header, /href="\/get-started"/);
  assert.match(header, /href="\/restaurants"/);
  assert.match(header, /href="\/cinemas"/);
  assert.match(header, /aria-expanded=\{menuOpen\}/);
  assert.match(header, /min-h-12/);
});

test("public homepage exposes both product paths and core actions", () => {
  for (const label of ["OMLU for Restaurants", "Explore Restaurants", "OMLU for Cinemas", "Explore Cinemas", "Get Started", "Sign In"]) assert.match(page, new RegExp(label));
  assert.match(page, /href: "\/restaurants"/);
  assert.match(page, /href: "\/cinemas"/);
});

test("landing preserves the hero and exposes product and pricing anchors", () => {
  assert.match(page, /One operations platform/);
  assert.match(page, /Run every part of your venue with OMLU/);
  assert.match(page, /id="product"/);
  assert.match(page, /id="pricing"/);
  assert.match(globals, /scroll-behavior: smooth/);
});

test("landing pricing stays a concise teaser and routes to the dedicated page", () => {
  assert.match(page, /Plans that fit the way your venue operates\./);
  assert.match(page, /View Pricing/);
  assert.match(page, /href="\/pricing"/);
  assert.match(page, /assisted setup available/);
  assert.doesNotMatch(page, /OMLU_MONTHLY_PRICE|₹999|pricingFeatures/);
});
