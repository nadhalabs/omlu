import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Menu import flow UI renders comprehensive option group review & edit controls", () => {
  const code = read("app/admin/menu/MenuImportFlow.tsx");

  // Option Group Actions & Wording
  assert.ok(code.includes("+ Add choice group"), "Has add choice group button");
  assert.ok(code.includes("Pricing method"), "Has pricing method dropdown");
  assert.ok(code.includes("Added to base price (+₹)"), "Has additive pricing option");
  assert.ok(code.includes("Final customer price (Replaces base price)"), "Has final price variant option");
  assert.ok(code.includes("Delete group"), "Has delete group action");
  assert.ok(code.includes("+ Add choice"), "Has add choice button");
  assert.ok(code.includes("Customer Preview"), "Renders customer-facing preview");

  // Selection Rules
  assert.ok(code.includes("Requirement"), "Has requirement label");
  assert.ok(code.includes("Customer must choose (Required)"), "Has required choice label");
  assert.ok(code.includes("Optional selection"), "Has optional selection label");
  assert.ok(code.includes("Minimum choices"), "Has min choices input");
  assert.ok(code.includes("Maximum choices"), "Has max choices input");

  // Input fields for options
  assert.ok(code.includes("Choice label (e.g. Regular)"), "Has choice label placeholder");
  assert.ok(code.includes("Kitchen label (optional)"), "Has kitchen label placeholder");
  assert.ok(code.includes("Final ₹"), "Has final price label");
  assert.ok(code.includes("Added +₹"), "Has added price label");
});

test("API helper confirmAdminMenuImport passes full option_groups and description", () => {
  const api = read("lib/api.ts");
  assert.ok(api.includes("description: item.description"), "Includes description in confirmation payload");
  assert.ok(api.includes("option_groups: item.option_groups || []"), "Includes option_groups in confirmation payload");
});

test("Types interface includes MenuOptionGroupDraft and MenuOptionDraft", () => {
  const types = read("lib/types.ts");
  assert.ok(types.includes("export interface MenuOptionGroupDraft"), "Defines MenuOptionGroupDraft");
  assert.ok(types.includes("export interface MenuOptionDraft"), "Defines MenuOptionDraft");
  assert.ok(types.includes("option_groups: MenuOptionGroupDraft[]"), "MenuImportDraftItem includes option_groups");
});

test("Menu import scanning experience includes trustworthy status sequence and truthfulness safeguards", () => {
  const code = read("app/admin/menu/MenuImportFlow.tsx");

  // Scanning View & Headings
  assert.ok(code.includes("Reading your menu"), "Has dedicated reading menu heading");
  assert.ok(code.includes("OMLU is turning your photos into a review-ready menu draft."), "Has honest description");

  // Status Sequence
  assert.ok(code.includes("Preparing your photos…"), "Has initial status message");
  assert.ok(code.includes("Reading visible menu text…"), "Has text reading status message");
  assert.ok(code.includes("Looking for categories and item rows…"), "Has row detection status message");
  assert.ok(code.includes("Checking prices and configurable choices…"), "Has choices checking status message");
  assert.ok(code.includes("Structuring the menu draft…"), "Has structuring status message");
  assert.ok(code.includes("Finalising the review-ready draft…"), "Has finalising status message");
  assert.ok(code.includes("Detailed menus can take a little longer. OMLU is still working…"), "Has extended wait reassurance");

  // Reassurance & Truthfulness
  assert.ok(code.includes("Nothing will be published automatically. You’ll review the extracted menu before publishing."), "Has publishing reassurance");
  assert.ok(!code.includes("% complete"), "Does NOT contain fake numeric percentages");
  assert.ok(!code.includes("Gemini"), "Does NOT expose internal model provider names");

  // Accessibility & Image Preview
  assert.ok(code.includes('aria-live="polite"'), "Uses aria-live polite for status text");
  assert.ok(code.includes('role="dialog"'), "Sets accessible dialog role");
  assert.ok(code.includes("omlu-scan-line"), "Uses scan line CSS class");

  // Recoverable Error UI
  assert.ok(code.includes("We couldn’t read this menu"), "Has clear error heading");
  assert.ok(code.includes("Try again"), "Has try again action");
  assert.ok(code.includes("Choose different photos"), "Has choose different photos action");

  // Success Banner
  assert.ok(code.includes("Menu draft ready"), "Has success draft ready banner");
});

test("Global CSS includes restrained omlu-scan-line keyframe animation", () => {
  const css = read("app/globals.css");
  assert.ok(css.includes("@keyframes omlu-scan-line"), "Defines scan line keyframes");
  assert.ok(css.includes(".omlu-scan-line"), "Defines omlu-scan-line class");
});

test("Menu import category review distinguishes existing, new, and unresolved categories", () => {
  const code = read("app/admin/menu/MenuImportFlow.tsx");
  const api = read("lib/api.ts");
  const types = read("lib/types.ts");

  assert.ok(code.includes("Existing category"));
  assert.ok(code.includes("New category"));
  assert.ok(code.includes("Needs selection"));
  assert.ok(code.includes("+ Create new category"));
  assert.ok(code.includes("Create “{item.extracted_category_name}”"));
  assert.ok(code.includes("...categoryPatch(bulkCategory)"), "Bulk assignment uses explicit category intent");
  assert.ok(api.includes('create_new_category: item.category_source === "new"'));
  assert.ok(types.includes('category_source: "existing" | "new" | "unresolved"'));
});
