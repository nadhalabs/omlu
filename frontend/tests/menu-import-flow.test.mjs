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
