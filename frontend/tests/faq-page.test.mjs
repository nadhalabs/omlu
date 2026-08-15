import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const page = read("app/faq/page.tsx");
const content = read("app/faq/faqContent.ts");
const home = read("app/page.tsx");
const login = read("app/login/LoginClient.tsx");
const notFound = read("app/not-found.tsx");
const llms = read("public/llms.txt");

test("public FAQ route has the expected product heading and positioning", () => {
  assert.match(page, /Questions about OMLU\?/);
  assert.match(page, /A simpler way to run your restaurant every day\./);
  assert.match(content, /restaurant software that brings QR ordering, kitchen display, staff operations and billing/);
  assert.match(content, /restaurants in India/);
});

test("FAQ covers real ordering, kitchen, billing, staff, and restaurant use cases", () => {
  for (const question of [
    "How does QR ordering work?",
    "Can the kitchen display work on a phone or tablet?",
    "Does OMLU support restaurant billing?",
    "Can restaurant staff use OMLU on their phones?",
    "Is OMLU suitable for small cafés and restaurants?",
  ]) {
    assert.match(content, new RegExp(question.replace(/[?]/g, "\\?")));
  }
  assert.match(content, /do not need to install an app/);
  assert.match(content, /does not require proprietary ordering hardware/);
  assert.match(content, /does not currently present an online payment gateway/);
});

test("FAQ includes accurate company attribution and registration path", () => {
  assert.match(content, /OMLU is built by Nadha Labs/);
  assert.match(content, /Kailasanadh G in 2025/);
  assert.match(content, /Create Restaurant registration flow/);
  assert.match(page, /href="\/register"/);
});

test("FAQ metadata and canonical URL are explicit", () => {
  assert.match(page, /title: "FAQ \| OMLU"/);
  assert.match(page, /canonical: "https:\/\/omlu\.in\/faq"/);
  assert.match(page, /openGraph/);
});

test("FAQ JSON-LD is generated from the same visible FAQ collection", () => {
  assert.match(page, /"@type": "FAQPage"/);
  assert.match(page, /FAQ_ITEMS\.map/);
  assert.match(page, /name: item\.question/);
  assert.match(page, /text: item\.answer/);
  assert.match(page, /application\/ld\+json/);
});

test("FAQ is public and does not expose operational routes", () => {
  assert.doesNotMatch(page, /href="\/(admin|staff|kitchen)/);
  assert.doesNotMatch(content, /session token|join code|restaurant slug|restaurant ID/i);
});

test("public homepage and login footer link to FAQ", () => {
  assert.match(home, /href="\/faq"/);
  assert.match(login, /href="\/faq"/);
});

test("FAQ disclosures and responsive shell preserve accessibility", () => {
  assert.match(page, /<details/);
  assert.match(page, /<summary/);
  assert.match(page, /min-h-14/);
  assert.match(page, /overflow-x-hidden/);
  assert.match(page, /focus-visible:outline/);
});

test("llms.txt lists only the official public homepage and FAQ", () => {
  assert.match(llms, /\[OMLU\]\(https:\/\/omlu\.in\/\)/);
  assert.match(llms, /\[FAQ\]\(https:\/\/omlu\.in\/faq\)/);
  assert.doesNotMatch(llms, /https:\/\/omlu\.in\/(admin|staff|kitchen|session|order|bill)/);
});

test("completed 404 page remains unchanged by FAQ integration", () => {
  assert.match(notFound, /omlu-404-chef\.png/);
  assert.doesNotMatch(notFound, /href="\/faq"/);
});
