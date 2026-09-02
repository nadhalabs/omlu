import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("public onboarding offers both venue types and typed registration routes", () => {
  const source = read("app/get-started/page.tsx");
  assert.match(source, /Restaurant/);
  assert.match(source, /Cinema/);
  assert.match(source, /register\?type=\$\{venue\.type\}/);
  assert.match(source, /Already have an account\?/);
});

test("registration validates the route type and submits it to shared registration", () => {
  const page = read("app/register/page.tsx");
  const client = read("app/register/RegisterClient.tsx");
  assert.match(page, /requestedType !== "restaurant" && requestedType !== "cinema"/);
  assert.match(page, /redirect\("\/get-started"\)/);
  assert.match(client, /venue_type: venueType/);
  assert.match(client, /registerRestaurant/);
  assert.match(client, /staffLogin/);
  assert.match(client, /router\.replace\(roleHomePath\(authenticated\.staff\)\)/);
});

test("public journey keeps venue context through product, pricing, and registration", () => {
  const home = read("app/page.tsx");
  const products = read("components/VenueProductPage.tsx");
  const restaurant = read("app/restaurants/page.tsx");
  const cinema = read("app/cinemas/page.tsx");
  const pricingClient = read("app/pricing/PricingClient.tsx");
  const pricingData = read("app/pricing/pricingData.ts");
  const login = read("app/login/LoginClient.tsx");

  assert.match(home, /href="\/get-started"/);
  assert.match(home, /href="\/login"/);
  assert.match(home, /href: "\/restaurants"/);
  assert.match(home, /href: "\/cinemas"/);
  assert.match(home, /href="\/pricing"/);
  assert.match(restaurant, /pricingHref: "\/pricing\?type=restaurant"/);
  assert.match(cinema, /pricingHref: "\/pricing\?type=cinema"/);
  assert.match(products, /href=\{product\.registrationHref\}/);
  assert.match(products, /href=\{product\.pricingHref\}/);
  assert.match(pricingClient, /requestedType === "cinema" \? "cinema" : "restaurant"/);
  assert.match(pricingData, /registrationHref: "\/register\?type=restaurant"/);
  assert.match(pricingData, /registrationHref: "\/register\?type=cinema"/);
  assert.match(login, /router\.replace\(destination\)/);
});

test("authoritative venue type controls login and reciprocal workspace routing", () => {
  const routes = read("lib/roleRoutes.ts");
  const admin = read("app/admin/layout.tsx");
  const cinema = read("app/cinema-admin/[[...section]]/page.tsx");
  const publicAuth = read("lib/publicAuth.ts");
  const loginPage = read("app/login/page.tsx");
  const registerPage = read("app/register/page.tsx");
  const getStarted = read("app/get-started/page.tsx");
  assert.match(routes, /staff\.venue_type === "cinema"[\s\S]*"\/cinema-admin"/);
  assert.match(admin, /staffInfo\.venue_type === "cinema"[\s\S]*redirect\("\/cinema-admin"\)/);
  assert.match(cinema, /staff\.venue_type !== "cinema"/);
  assert.match(publicAuth, /roleHomePath/);
  for (const source of [loginPage, registerPage, getStarted]) {
    assert.match(source, /authenticatedHomePath/);
    assert.match(source, /redirect\(destination\)/);
  }
});
