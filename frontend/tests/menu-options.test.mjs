import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Admin menu editor distinguishes final variant prices from add-on adjustments", () => {
  const editor = read("app/admin/menu/MenuOptionEditor.tsx");
  const page = read("app/admin/menu/page.tsx");
  assert.match(page, /MenuOptionEditor/);
  assert.match(editor, /Single-select \/ final price/);
  assert.match(editor, /Multi-select \/ price adjustment/);
  assert.match(editor, /Final price ₹/);
  assert.match(editor, /Adds ₹/);
  for (const field of ["Required", "Min", "Max", "Available", "Sort"]) {
    assert.ok(editor.includes(field), field);
  }
});

test("Gemini review labels extracted variants as editable final customer prices", () => {
  const review = read("app/admin/menu/MenuImportFlow.tsx");
  assert.match(review, /Confirm final option prices/);
  assert.match(review, /final customer prices, not amounts added/);
});
