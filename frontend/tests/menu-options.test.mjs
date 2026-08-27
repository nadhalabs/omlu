import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Admin menu editor presents an owner-friendly guided specification flow", () => {
  const editor = read("app/admin/menu/MenuOptionEditor.tsx");
  const page = read("app/admin/menu/page.tsx");
  assert.match(page, /MenuOptionEditor/);
  for (const copy of [
    "Options",
    "Let customers choose variations, preferences or extras.",
    "Option name",
    "How can customers choose?",
    "Choose one",
    "Choose any",
    "Required",
    "Customer must choose before adding the item",
    "Pricing",
    "Each choice has a price",
    "Add extra cost",
    "No extra cost",
    "Add option",
    "+ Add choice",
    "Save changes",
    "Create option",
    "Cancel",
  ]) {
    assert.ok(editor.includes(copy), copy);
  }
  assert.doesNotMatch(editor, /Single-select \/ final price|Multi-select \/ price adjustment|Adds ₹|Sort 0/);
});

test("choice cards use plain pricing, progressive kitchen help, and ordering actions", () => {
  const editor = read("app/admin/menu/MenuOptionEditor.tsx");
  for (const copy of ["Choice name", "Kitchen label", "Price ₹", "Extra +₹", "More", "Move up", "Move down", "Remove", "+ Add choice"]) assert.ok(editor.includes(copy), copy);
  assert.match(editor, /pricing !== "none"/);
  assert.doesNotMatch(editor, /pricing === "none" && <p[^>]*>No price change/);
  assert.match(editor, /price_delta: behavior === "none" \? 0/);
  assert.match(editor, /display_order: index/);
  assert.match(editor, /function move</);
});

test("option editor stays readable inside the narrow item modal", () => {
  const editor = read("app/admin/menu/MenuOptionEditor.tsx");
  const page = read("app/admin/menu/page.tsx");
  assert.doesNotMatch(editor, /xl:grid-cols-\[minmax\(0,1fr\)_300px\]/);
  assert.match(editor, /min-w-0/);
  assert.match(editor, /min-h-11/);
  assert.match(page, /max-w-2xl/);
});

test("new groups use safe smart defaults and existing group meaning is translated", () => {
  const editor = read("app/admin/menu/MenuOptionEditor.tsx");
  assert.match(editor, /useState<"one" \| "multiple">\("one"\)/);
  assert.match(editor, /useState<PricingBehavior>\("none"\)/);
  assert.match(editor, /useState\(true\)/);
  assert.match(editor, /useState\(1\)/);
  assert.match(editor, /group\.type === "variant" \|\| group\.maximum_selections === 1/);
  assert.match(editor, /group\.type === "variant"[\s\S]*"different"/);
  assert.match(editor, /group\.options\.every[\s\S]*"none"/);
});

test("customer preview reflects selection, requirement, and existing pricing semantics", () => {
  const editor = read("app/admin/menu/MenuOptionEditor.tsx");
  for (const copy of ["Customer preview", "Required", "Optional", "Included in item price", "+₹"]) assert.ok(editor.includes(copy), copy);
  assert.match(editor, /selection === "one" \? "○" : "□"/);
  assert.match(editor, /behavior === "different" \? `₹/);
});

test("new option creation opens explicitly and Cancel closes a clean API-free draft", () => {
  const editor = read("app/admin/menu/MenuOptionEditor.tsx");
  assert.match(editor, /useState\(false\).*isCreating|\[isCreating, setIsCreating\] = useState\(false\)/);
  assert.match(editor, /!isCreating && \([\s\S]*onClick=\{startNewOption\}[\s\S]*\+ Add option/);
  assert.match(editor, /isCreating && <article[\s\S]*Cancel[\s\S]*Create option/);

  const start = editor.match(/const startNewOption = \(\) => \{([\s\S]*?)\n  \};/)?.[1] || "";
  assert.match(start, /resetNewOptionDraft\(\)/);
  assert.match(start, /setIsCreating\(true\)/);

  const cancel = editor.match(/const cancelNewOption = \(\) => \{([\s\S]*?)\n  \};/)?.[1] || "";
  for (const reset of ["resetNewOptionDraft()", "setMessage(null)", "setIsCreating(false)"]) assert.ok(cancel.includes(reset), reset);
  assert.doesNotMatch(cancel, /jsonRequest|createGroup|saveExisting|updateGroup|setGroups/);

  const reset = editor.match(/const resetNewOptionDraft = \(\) => \{([\s\S]*?)\n  \};/)?.[1] || "";
  for (const defaultState of [
    'setName("")',
    'setSelection("one")',
    'setNewPricing("none")',
    "setRequired(true)",
    "setMinimum(1)",
    "setMaximum(1)",
    "setOptionsState([",
  ]) assert.ok(reset.includes(defaultState), defaultState);
});

test("advanced constraints and validation use owner-friendly language", () => {
  const editor = read("app/admin/menu/MenuOptionEditor.tsx");
  assert.match(editor, /<details[\s\S]*Advanced settings/);
  assert.match(editor, /<summary[^>]*>More<\/summary>[\s\S]*Kitchen label/);
  for (const copy of [
    "Minimum choices",
    "Maximum choices",
    "The minimum number of choices cannot be greater than the maximum.",
    "Enter ₹0 or a higher amount.",
    "A required choice must ask the customer to select at least one option.",
  ]) assert.ok(editor.includes(copy), copy);
});

test("option-group API contracts and stored fields remain unchanged", () => {
  const editor = read("app/admin/menu/MenuOptionEditor.tsx");
  for (const contract of ["/api/admin/menu/option-groups", "/api/admin/menu/options", "minimum_selections", "maximum_selections", "price_delta", "kitchen_display_name", "display_order", "available", "active"]) assert.ok(editor.includes(contract), contract);
  assert.match(editor, /newPricing === "different" \? "variant" : "addon"/);
  assert.match(editor, /behavior === "different" \? "variant" : "addon"/);
});

test("initial item creation supports fixed and option-defined pricing with recoverable drafts", () => {
  const editor = read("app/admin/menu/MenuOptionEditor.tsx");
  const page = read("app/admin/menu/page.tsx");
  for (const copy of ["How is this item priced?", "One price", "Price varies by option", "Save Menu Item"]) assert.ok(page.includes(copy), copy);
  assert.match(page, /validatePriceDefiningDraft\(itemOptionDrafts\)/);
  assert.match(page, /Math\.min\([\s\S]*price_delta/);
  assert.match(page, /let itemId = createdItemId/);
  assert.match(page, /persistDraftOptionGroups\(itemId, itemOptionDrafts, setItemOptionDrafts\)/);
  assert.match(page, /without creating a duplicate/);
  assert.match(editor, /if \(draftMode\)/);
  assert.match(editor, /onDraftGroupsChange/);
  assert.match(editor, /method: "DELETE"/);
  assert.match(editor, /drafts\.slice\(draftIndex \+ 1\)/);
});

test("Gemini review flow supports universal option group review, editing and customer preview", () => {
  const review = read("app/admin/menu/MenuImportFlow.tsx");
  assert.match(review, /Option Groups for/);
  assert.match(review, /Pricing method/);
  assert.match(review, /Added to base price/);
  assert.match(review, /Final customer price/);
  assert.match(review, /Customer Preview/);
});
