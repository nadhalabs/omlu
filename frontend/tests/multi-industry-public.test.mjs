import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const home = read("app/page.tsx");
const restaurants = read("app/restaurants/page.tsx");
const cinemas = read("app/cinemas/page.tsx");
const productPage = read("components/VenueProductPage.tsx");
const header = read("components/LandingHeader.tsx");

test("homepage presents OMLU as a multi-industry operations platform", () => {
  assert.match(home, /One operations platform/);
  assert.match(home, /OMLU for Restaurants/);
  assert.match(home, /Explore Restaurants/);
  assert.match(home, /OMLU for Cinemas/);
  assert.match(home, /Explore Cinemas/);
  assert.match(home, />Get Started</);
  assert.match(home, />Sign In</);
  assert.doesNotMatch(home, /Restaurant operations[\s\S]*<h1[^>]*>\s*OMLU/);
});

test("public navigation exposes both products and core actions", () => {
  for (const expected of ['href="/restaurants"', 'href="/cinemas"', 'href="/pricing"', 'href="/login"', 'href="/get-started"']) assert.match(header, new RegExp(expected));
  assert.match(header, /aria-label="Mobile navigation"/);
  assert.match(header, />Sign In</);
});

test("restaurant product page has focused workflows and registration", () => {
  assert.match(restaurants, /OMLU for Restaurants/);
  assert.match(restaurants, /Ordering & tables/);
  assert.match(restaurants, /Kitchen operations/);
  assert.match(restaurants, /Billing & payments/);
  assert.match(restaurants, /Staff access/);
  assert.match(restaurants, /Reports & oversight/);
  assert.match(restaurants, /\/register\?type=restaurant/);
  assert.match(restaurants, /\/pricing\?type=restaurant/);
});

test("cinema product page has focused workflows and registration", () => {
  assert.match(cinemas, /OMLU for Cinemas/);
  assert.match(cinemas, /Seat-based ordering/);
  assert.match(cinemas, /Screens & seats/);
  assert.match(cinemas, /Concession KDS/);
  assert.match(cinemas, /Customer tracking/);
  assert.match(cinemas, /Cinema oversight/);
  assert.match(cinemas, /\/register\?type=cinema/);
  assert.match(cinemas, /\/pricing\?type=cinema/);
});

test("both product pages share pricing, login and interface-preview structure", () => {
  assert.match(productPage, /id="pricing"/);
  assert.match(productPage, /href="\/login"/);
  assert.match(productPage, /interface preview/);
  assert.match(productPage, />Register</);
});
