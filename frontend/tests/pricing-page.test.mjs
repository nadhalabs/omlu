import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("app/pricing/page.tsx");
const client = read("app/pricing/PricingClient.tsx");
const data = read("app/pricing/pricingData.ts");
const styles = read("app/pricing/pricing.module.css");

test("pricing route retains metadata and one shared client UI", () => {
  assert.match(page, /title: "Pricing \| OMLU"/);
  assert.match(page, /canonical: "https:\/\/omlu\.in\/pricing"/);
  assert.match(page, /<PricingClient/);
  assert.equal((client.match(/function PricingCard/g) || []).length, 1);
  assert.match(client, /pricing\.plans\.map/);
});

test("venue switcher supports direct links and safely defaults to restaurant", () => {
  assert.match(client, /useSearchParams\(\)\.get\("type"\)/);
  assert.match(client, /requestedType === "cinema" \? "cinema" : "restaurant"/);
  assert.match(client, /href="\/pricing\?type=restaurant"/);
  assert.match(client, /href="\/pricing\?type=cinema"/);
  assert.match(client, /aria-label="Choose venue pricing"/);
  assert.match(styles, /\.venueToggle/);
});

test("restaurant pricing and features remain exact", () => {
  for (const value of ["Lite", "₹499", "₹4,999", "₹417", "Save ₹989", "Standard", "₹999", "₹9,999", "₹833", "Save ₹1,989", "Pro", "₹1,999", "₹19,999", "₹1,667", "Save ₹3,989", "Custom", "Talk to us"]) assert.ok(data.includes(value), `missing ${value}`);
  for (const feature of ["QR ordering", "Dine-in, takeaway & Quick Sale", "Kitchen display", "Billing & bill printing", "Staff access", "Basic reports", "Advanced sales reports", "GST reporting dashboard", "HSN/SAC reports"]) assert.ok(data.includes(feature), `missing ${feature}`);
  assert.match(data, /label: "Ad-free", available: false/);
  assert.match(data, /registrationHref: "\/register\?type=restaurant"/);
});

test("cinema mode provides plans, prices, screen limits and operational features", () => {
  for (const value of ["Starter", "Multiplex", "Cinema Pro", "₹3,999", "₹39,999", "Up to 2 screens", "Up to 5 screens", "Up to 12 screens", "More than 12 screens"]) assert.ok(data.includes(value), `missing ${value}`);
  for (const feature of ["Seat-based ordering", "Screens & seats", "Concession menu", "Concession KDS", "Customer order tracking", "Cinema admin workspace", "Realtime operations"]) assert.ok(data.includes(feature), `missing ${feature}`);
  assert.match(data, /registrationHref: "\/register\?type=cinema"/);
});

test("both modes share billing, cards, CTAs and responsive behavior", () => {
  assert.match(client, /id="billing-monthly"[\s\S]*defaultChecked/);
  assert.match(client, /id="billing-yearly"/);
  assert.match(client, /2 months free/);
  assert.match(client, /href=\{registrationHref\} className=\{styles\.cta\}/);
  assert.match(styles, /grid-template-columns: repeat\(4/);
  assert.match(styles, /@media \(max-width: 1100px\)/);
  assert.match(styles, /@media \(max-width: 700px\)/);
  assert.match(styles, /\.recommended/);
});

test("pricing remains presentational and does not touch backend behavior", () => {
  assert.doesNotMatch(`${client}\n${data}`, /fetch\(|axios|localStorage|savePlan|selectedPlan/i);
  assert.doesNotMatch(client, /useState|useRouter/);
});
