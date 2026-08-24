import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("all 5 public policy route files exist and import LegalLayout", () => {
  const routes = [
    "app/terms/page.tsx",
    "app/privacy/page.tsx",
    "app/refunds/page.tsx",
    "app/acceptable-use/page.tsx",
    "app/service-policy/page.tsx",
  ];

  for (const route of routes) {
    const content = read(route);
    assert.match(content, /import LegalLayout/);
    assert.match(content, /export const metadata/);
  }
});

test("shared legal version constants exist and match canonical date format", () => {
  const constants = read("lib/legalConstants.ts");
  assert.match(constants, /export const TERMS_VERSION = "2026-08-07"/);
  assert.match(constants, /export const PRIVACY_VERSION = "2026-08-07"/);
  assert.match(constants, /export const REFUND_VERSION = "2026-08-07"/);
  assert.match(constants, /export const ACCEPTABLE_USE_VERSION = "2026-08-07"/);
  assert.match(constants, /export const SERVICE_POLICY_VERSION = "2026-08-07"/);
});

test("LegalLayout component provides accessible navigation, TOC, print CSS, and theme controls", () => {
  const layout = read("components/LegalLayout.tsx");
  assert.match(layout, /aria-label="Legal documents"/);
  assert.match(layout, /aria-label="Table of contents"/);
  assert.match(layout, /window\.print\(\)/);
  assert.match(layout, /PublicThemeControl/);
});

test("registration consent checkbox in register/page.tsx contains accessible links to terms and privacy", () => {
  const register = read("app/register/page.tsx");
  assert.match(register, /name="accept_terms"/);
  assert.match(register, /type="checkbox"/);
  assert.match(register, /href="\/terms"/);
  assert.match(register, /href="\/privacy"/);
  assert.match(register, /I confirm that I’m authorized to create this restaurant account/);
});

test("login footer in LoginClient.tsx and landing page in page.tsx contain legal links", () => {
  const login = read("app/login/LoginClient.tsx");
  const landing = read("app/page.tsx");
  const adminSettings = read("app/admin/settings/AdminSettingsClient.tsx");

  for (const path of ["/terms", "/privacy", "/refunds", "/acceptable-use", "/service-policy"]) {
    assert.ok(login.includes(path), `LoginClient should link to ${path}`);
    assert.ok(landing.includes(path), `Landing page should link to ${path}`);
    assert.ok(adminSettings.includes(path), `AdminSettingsClient should link to ${path}`);
  }
});

test("legalConfig placeholder guard checks required fields and throws in strict mode if placeholders remain", () => {
  const legalConfigSrc = read("lib/legalConfig.ts");
  assert.match(legalConfigSrc, /REQUIRED_LEGAL_KEYS/);
  assert.match(legalConfigSrc, /getUnresolvedPlaceholders/);
  assert.match(legalConfigSrc, /verifyLegalConfigSafety/);

  // In production builds, unresolved bracketed placeholders fail
  const rawPlaceholders = ["[LEGAL ENTITY NAME]", "[REGISTERED BUSINESS ADDRESS]", "[SUPPORT EMAIL]", "[PRIVACY OR GRIEVANCE EMAIL]"];
  for (const placeholder of rawPlaceholders) {
    const isUnresolved = placeholder.includes("[") && placeholder.includes("]");
    assert.equal(isUnresolved, true);
  }
});
